import { useEffect, useState } from "react";
import { Loader2, Search, Receipt, BadgePercent, Plus } from "lucide-react";
import { toast } from "sonner";
import { notify } from "@/lib/notify";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import { printGuiaMensalidade, printGuiaMensalidadeComTaxa } from "@/lib/print-gr";
import { PagamentoAvulsoMensalidadeDialog } from "@/components/cartao-beneficios/pagamento-avulso-dialog";

const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Tolerância de 5 dias corridos; a partir do 6º dia: multa 10% + 0,33% ao dia. */
export function calcularValorMensalidade(valor: number, vencimento: string) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(`${vencimento}T00:00:00`);
  const diasAtraso = Math.floor((hoje.getTime() - venc.getTime()) / 86400000);
  if (diasAtraso <= 5)
    return { valorFinal: valor, juros: 0, multa: 0, diasAtraso: Math.max(0, diasAtraso) };
  const multa = +(valor * 0.1).toFixed(2);
  const juros = +(valor * 0.0033 * diasAtraso).toFixed(2);
  return { valorFinal: +(valor + multa + juros).toFixed(2), juros, multa, diasAtraso };
}

type MensalidadeAberta = {
  id: string;
  contrato_id: string;
  contrato_numero: number;
  /** 0 = taxa de adesão · negativo = taxa de inclusão de dependente. */
  numero_parcela: number;
  total_parcelas: number;
  valor: number;
  /** Taxa de adesão embutida nesta parcela (só a 1ª a carrega). Não sofre juros. */
  taxa_adesao: number;
  vencimento: string;
  titular_nome: string;
  paciente_id: string | null;
  observacoes: string | null;
};

type ContratoAtivo = {
  id: string;
  numero: number;
  titular: string;
  paciente_id: string | null;
  valor_mensal: number;
  dia_vencimento: number | null;
  num_parcelas: number;
};

/** Linha da taxa de adesão do contrato (gravada como parcela 0). */
const isAdesao = (m: Pick<MensalidadeAberta, "numero_parcela">) => Number(m.numero_parcela) === 0;
/** Taxa de inclusão de dependente (gravada com número de parcela negativo). */
const isTaxaInclusao = (m: Pick<MensalidadeAberta, "numero_parcela">) =>
  Number(m.numero_parcela) < 0;
/** Adesão e taxas avulsas não são mensalidades — não entram na contagem "x/12". */
const isEncargoAvulso = (m: Pick<MensalidadeAberta, "numero_parcela">) =>
  Number(m.numero_parcela) <= 0;

/** Rótulo da cobrança, como aparece na lista e na descrição do lançamento. */
const rotuloCobranca = (m: MensalidadeAberta) =>
  isAdesao(m)
    ? "Taxa de adesão"
    : isTaxaInclusao(m)
      ? "Taxa de inclusão de dependente"
      : `Mensalidade ${m.numero_parcela}/${m.total_parcelas}`;

/** Soma 1 mês a uma data ISO (yyyy-mm-dd), preservando o dia quando possível. */
function proximoVencimento(base: string, dia?: number | null) {
  const d = new Date(`${base}T00:00:00`);
  const alvoDia = dia && dia > 0 ? dia : d.getDate();
  const ano = d.getFullYear();
  const mes = d.getMonth() + 1;
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const novo = new Date(ano, mes, Math.min(alvoDia, ultimoDia));
  return `${novo.getFullYear()}-${String(novo.getMonth() + 1).padStart(2, "0")}-${String(novo.getDate()).padStart(2, "0")}`;
}

/**
 * Faturamento rápido da mensalidade do Cartão Benefícios.
 *
 * Busca o paciente (titular OU dependente), lista as parcelas em aberto dos
 * contratos ativos e permite receber em poucos cliques — com a mesma regra de
 * juros/multa e a mesma GR usadas na tela de Contratos.
 */
export function FaturamentoRapidoMensalidadeDialog({
  open,
  onOpenChange,
  clinicaId,
  usuario,
  onPago,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clinicaId: string;
  usuario?: { id?: string | null; nome?: string | null } | null;
  onPago?: () => void;
}) {
  const [paciente, setPaciente] = useState<PatientOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [itens, setItens] = useState<MensalidadeAberta[]>([]);
  const [isentar, setIsentar] = useState(false);
  const [pagando, setPagando] = useState<MensalidadeAberta | null>(null);
  const [lancOpen, setLancOpen] = useState(false);
  const [contratosAtivos, setContratosAtivos] = useState<ContratoAtivo[]>([]);
  const [gerando, setGerando] = useState<string | null>(null);
  const [avulsoOpen, setAvulsoOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setPaciente(null);
      setItens([]);
      setIsentar(false);
      setPagando(null);
      setContratosAtivos([]);
    }
  }, [open]);

  const buscar = async (pac: PatientOption | null) => {
    setPaciente(pac);
    setItens([]);
    setContratosAtivos([]);
    if (!pac || !clinicaId) return;
    setLoading(true);
    try {
      // Contratos onde é titular
      const { data: tit } = await supabase
        .from("contratos_assinatura")
        .select(
          "id, numero, paciente_id, valor_mensal, dia_vencimento, num_parcelas, pacientes:paciente_id(nome)",
        )
        .eq("clinica_id", clinicaId)
        .eq("status", "ativo")
        .eq("paciente_id", pac.id);
      // Contratos onde é dependente ativo
      const { data: dep } = await supabase
        .from("contrato_dependentes")
        .select(
          "contrato_id, contratos_assinatura!inner(id, numero, status, clinica_id, paciente_id, valor_mensal, dia_vencimento, num_parcelas, pacientes:paciente_id(nome))",
        )
        .eq("paciente_id", pac.id)
        .eq("ativo", true);

      const contratos = new Map<
        string,
        {
          numero: number;
          titular: string;
          paciente_id: string | null;
          valor_mensal: number;
          dia_vencimento: number | null;
          num_parcelas: number;
        }
      >();
      for (const c of (tit ?? []) as Array<Record<string, unknown>>) {
        contratos.set(String(c.id), {
          numero: Number(c.numero),
          titular: (c.pacientes as { nome?: string } | null)?.nome ?? pac.nome,
          paciente_id: (c.paciente_id as string) ?? null,
          valor_mensal: Number(c.valor_mensal) || 0,
          dia_vencimento: (c.dia_vencimento as number) ?? null,
          num_parcelas: Number(c.num_parcelas) || 0,
        });
      }
      for (const d of (dep ?? []) as Array<Record<string, unknown>>) {
        const c = d.contratos_assinatura as Record<string, unknown> | null;
        if (!c || c.clinica_id !== clinicaId || c.status !== "ativo") continue;
        contratos.set(String(c.id), {
          numero: Number(c.numero),
          titular: (c.pacientes as { nome?: string } | null)?.nome ?? "Titular",
          paciente_id: (c.paciente_id as string) ?? null,
          valor_mensal: Number(c.valor_mensal) || 0,
          dia_vencimento: (c.dia_vencimento as number) ?? null,
          num_parcelas: Number(c.num_parcelas) || 0,
        });
      }
      setContratosAtivos(
        Array.from(contratos.entries()).map(([id, c]) => ({
          id,
          numero: c.numero,
          titular: c.titular,
          paciente_id: c.paciente_id,
          valor_mensal: c.valor_mensal,
          dia_vencimento: c.dia_vencimento,
          num_parcelas: c.num_parcelas,
        })),
      );
      if (!contratos.size) {
        setItens([]);
        return;
      }
      // Só "pendente" e "aberto" são cobráveis. O filtro antigo era
      // `.neq("status", "pago")`, que também trazia as parcelas CANCELADAS —
      // elas apareciam na lista com o botão "Receber" ao lado, e a recepção
      // não tinha como saber que aquela cobrança tinha sido cancelada.
      const { data: mens, error } = await supabase
        .from("contrato_mensalidades")
        .select(
          "id, contrato_id, numero_parcela, valor, vencimento, status, taxa_adesao, observacoes",
        )
        .in("contrato_id", Array.from(contratos.keys()))
        .in("status", ["pendente", "aberto"])
        .order("numero_parcela")
        .order("vencimento");
      if (error) throw error;

      const linhas = (mens ?? []) as Array<Record<string, unknown>>;

      // Taxa de adesão embutida: mesma regra da tela de Contratos. Enquanto a
      // 1ª parcela estiver em aberto, a adesão é cobrada JUNTO com ela e a
      // linha própria da adesão (parcela 0) não pode ser recebida à parte —
      // caso contrário a taxa seria cobrada duas vezes.
      const adesaoEmbutidaPorContrato = new Set<string>();
      for (const m of linhas) {
        if (Number(m.numero_parcela) === 1 && Number(m.taxa_adesao ?? 0) > 0) {
          adesaoEmbutidaPorContrato.add(String(m.contrato_id));
        }
      }

      const lista: MensalidadeAberta[] = linhas
        .filter((m) => {
          const num = Number(m.numero_parcela);
          if (num === 0 && adesaoEmbutidaPorContrato.has(String(m.contrato_id))) return false;
          return true;
        })
        .map((m) => {
          const c = contratos.get(String(m.contrato_id))!;
          const num = Number(m.numero_parcela);
          return {
            id: String(m.id),
            contrato_id: String(m.contrato_id),
            contrato_numero: c.numero,
            numero_parcela: num,
            // Total real do contrato (`num_parcelas`). Antes o total era o
            // maior número entre as parcelas EM ABERTO, então a última parcela
            // de um contrato quitado saía como "12/12" — mas a 5ª de um
            // contrato com as outras pagas virava "5/5".
            total_parcelas: c.num_parcelas || num,
            valor: Number(m.valor) || 0,
            taxa_adesao:
              num === 1 && adesaoEmbutidaPorContrato.has(String(m.contrato_id))
                ? Number(m.taxa_adesao ?? 0) || 0
                : 0,
            vencimento: String(m.vencimento),
            titular_nome: c.titular,
            paciente_id: c.paciente_id,
            observacoes: (m.observacoes as string | null) ?? null,
          };
        });
      setItens(lista);
    } catch (err) {
      mostrarErro(err, "falha ao buscar mensalidades");
    } finally {
      setLoading(false);
    }
  };

  /** Gera a próxima parcela (antecipação) de um contrato ativo e já abre o recebimento. */
  const gerarProximaParcela = async (c: ContratoAtivo) => {
    setGerando(c.id);
    try {
      const { data: todas, error: errList } = await supabase
        .from("contrato_mensalidades")
        .select("numero_parcela, vencimento, valor")
        .eq("contrato_id", c.id)
        .order("numero_parcela", { ascending: false });
      if (errList) throw errList;
      const positivas = (
        (todas ?? []) as Array<{ numero_parcela: number; vencimento: string; valor: number }>
      ).filter((m) => Number(m.numero_parcela) > 0);
      const ultima = positivas[0];
      const proximoNumero = (ultima?.numero_parcela ?? 0) + 1;
      const baseVenc = ultima?.vencimento ?? new Date().toISOString().slice(0, 10);
      const vencimento = proximoVencimento(baseVenc, c.dia_vencimento);
      const valor = Number(ultima?.valor) || c.valor_mensal || 0;

      const { data: nova, error } = await supabase
        .from("contrato_mensalidades")
        .insert({
          contrato_id: c.id,
          clinica_id: clinicaId,
          numero_parcela: proximoNumero,
          vencimento,
          valor,
          status: "pendente",
          observacoes: "Parcela antecipada no faturamento rápido",
        })
        .select("id")
        .single();
      if (error) throw error;

      const item: MensalidadeAberta = {
        id: String(nova.id),
        contrato_id: c.id,
        contrato_numero: c.numero,
        numero_parcela: proximoNumero,
        total_parcelas: Math.max(c.num_parcelas || 0, proximoNumero),
        valor,
        taxa_adesao: 0,
        vencimento,
        titular_nome: c.titular,
        paciente_id: c.paciente_id,
        observacoes: "Parcela antecipada no faturamento rápido",
      };
      setItens((prev) => [...prev, item]);
      setPagando(item);
      setIsentar(false);
      setLancOpen(true);
    } catch (err) {
      mostrarErro(err, "falha ao gerar a próxima parcela");
    } finally {
      setGerando(null);
    }
  };

  const calc = pagando ? calcularValorMensalidade(pagando.valor, pagando.vencimento) : null;
  // Taxa de adesão embutida na 1ª parcela: entra no total cobrado e NÃO sofre
  // juros nem multa (mesma regra da tela de Contratos). Antes essa tela nem
  // lia o campo — a taxa simplesmente não era cobrada e ficava pendente.
  const taxaAdesaoCobrar = pagando ? Number(pagando.taxa_adesao) || 0 : 0;
  const valorMensalidadeCobrar = pagando
    ? isentar
      ? pagando.valor
      : (calc?.valorFinal ?? pagando.valor)
    : 0;
  const valorCobrar = +(valorMensalidadeCobrar + taxaAdesaoCobrar).toFixed(2);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Faturamento rápido — Mensalidade do Cartão
            </DialogTitle>
            <DialogDescription>
              Busque o paciente (titular ou dependente) e receba a parcela em aberto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <PatientSearchInput
              value={paciente}
              onSelect={buscar}
              clinicaIdsOverride={[clinicaId]}
              autoFocus
            />

            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando mensalidades…
              </div>
            )}

            {!loading && !paciente && (
              <Button variant="outline" className="w-full" onClick={() => setAvulsoOpen(true)}>
                <Receipt className="h-4 w-4 mr-1" /> Pagamento avulso (paciente sem contrato no
                sistema)
              </Button>
            )}

            {!loading && paciente && !itens.length && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Search className="h-4 w-4" /> Nenhuma mensalidade em aberto para este paciente.
                </p>
                {!contratosAtivos.length && (
                  <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2">
                    Este paciente não tem contrato ativo cadastrado — pode ser um cadastro que não
                    veio na migração do sistema antigo. Use o pagamento avulso abaixo para não
                    segurar o caixa.
                  </p>
                )}
                {contratosAtivos.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">Contrato #{c.numero} — em dia</div>
                      <div className="text-xs text-muted-foreground truncate">
                        Titular: {c.titular} · Mensalidade {BRL(c.valor_mensal)}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      disabled={gerando === c.id}
                      onClick={() => gerarProximaParcela(c)}
                    >
                      {gerando === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1" /> Antecipar próxima parcela
                        </>
                      )}
                    </Button>
                  </div>
                ))}
                <Button
                  variant={contratosAtivos.length ? "secondary" : "default"}
                  className="w-full"
                  onClick={() => setAvulsoOpen(true)}
                >
                  <Receipt className="h-4 w-4 mr-1" /> Pagamento avulso (sem contrato)
                </Button>
              </div>
            )}

            <div className="space-y-2 max-h-[50vh] overflow-auto">
              {itens.map((m) => {
                const c = calcularValorMensalidade(m.valor, m.vencimento);
                const atrasada = c.diasAtraso > 5;
                const taxa = Number(m.taxa_adesao) || 0;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        Contrato #{m.contrato_numero} — {rotuloCobranca(m)}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        Titular: {m.titular_nome} · Vence em{" "}
                        {new Date(`${m.vencimento}T00:00:00`).toLocaleDateString("pt-BR")}
                        {isTaxaInclusao(m) && m.observacoes ? ` · ${m.observacoes}` : ""}
                      </div>
                      <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
                        <span>{BRL(m.valor)}</span>
                        {taxa > 0 && <Badge variant="secondary">+ adesão {BRL(taxa)}</Badge>}
                        {atrasada && (
                          <Badge variant="destructive">
                            {c.diasAtraso} dias em atraso · multa e juros{" "}
                            {BRL(+(c.multa + c.juros).toFixed(2))}
                          </Badge>
                        )}
                        {(taxa > 0 || atrasada) && (
                          <span className="font-medium">
                            total {BRL(+(c.valorFinal + taxa).toFixed(2))}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        setPagando(m);
                        setIsentar(false);
                        setLancOpen(true);
                      }}
                    >
                      Receber
                    </Button>
                  </div>
                );
              })}
            </div>

            {pagando && calc && calc.diasAtraso > 5 && (
              <div className="rounded-md border p-3 text-sm flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <BadgePercent className="h-4 w-4" />
                  Multa {BRL(calc.multa)} + juros {BRL(calc.juros)} — cobrando {BRL(valorCobrar)}
                </span>
                <Button variant="outline" size="sm" onClick={() => setIsentar((v) => !v)}>
                  {isentar ? "Voltar a cobrar juros" : "Isentar juros e multa"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <LancamentoDialog
        open={lancOpen}
        onOpenChange={(v) => {
          setLancOpen(v);
          if (!v) setPagando(null);
        }}
        tipo="receita"
        categoriaFixaNome={
          pagando && isAdesao(pagando)
            ? "TAXA DE ADESAO CARTAO"
            : pagando && isTaxaInclusao(pagando)
              ? "DEPENDENTE / ADESAO CARTAO"
              : "MENSALIDADE CARTAO CONSULTA"
        }
        pacienteIdFixo={pagando?.paciente_id ?? null}
        initialDescricao={
          pagando
            ? `${rotuloCobranca(pagando)} - Contrato #${pagando.contrato_numero} - ${pagando.titular_nome}`
            : ""
        }
        initialValor={pagando ? valorCobrar.toFixed(2) : ""}
        onSavedWithData={async (dados) => {
          if (!pagando) return;
          const m = pagando;
          const taxaAdesao = Number(m.taxa_adesao) || 0;
          const dataLanc = dados.data || new Date().toISOString().slice(0, 10);
          const { error } = await supabase
            .from("contrato_mensalidades")
            .update({
              status: "pago",
              pago_em: dataLanc,
              forma_pagamento: dados.forma_pagamento ?? "misto",
              lancamento_id: dados.lancamento_id ?? null,
              // A taxa de adesão sai em lançamento próprio (abaixo), então o
              // valor pago da mensalidade não a inclui.
              valor_pago: +(dados.valor - taxaAdesao).toFixed(2),
            })
            .eq("id", m.id);
          if (error) {
            mostrarErro(error, "pagamento salvo, mas a mensalidade não foi baixada");
            return;
          }

          // Adesão e taxa de inclusão recebidas avulsas: o LancamentoDialog já
          // gravou lançamento e caixa com a categoria certa. Não há segunda
          // cobrança nem GR de mensalidade a imprimir.
          if (isEncargoAvulso(m)) {
            notify.success("Pagamento registrado.");
            setItens((prev) => prev.filter((x) => x.id !== m.id));
            setPagando(null);
            onPago?.();
            return;
          }

          try {
            if (taxaAdesao > 0) {
              // Taxa de adesão embutida na 1ª parcela: lançamento financeiro
              // separado (categoria própria) + baixa da linha da adesão
              // (parcela 0) + uma única GR com mensalidade e taxa juntas.
              // Mesmo fluxo já usado na tela de Contratos.
              const { data: catRow } = await supabase
                .from("fin_categorias")
                .select("id")
                .eq("clinica_id", clinicaId)
                .ilike("nome", "TAXA DE ADESAO CARTAO")
                .eq("tipo", "receita")
                .maybeSingle();
              const descricaoTaxa = `Taxa de adesão — Contrato #${m.contrato_numero} — ${m.titular_nome}`;
              const { data: rpcData, error: rpcErr } = await supabase.rpc(
                "fn_registrar_lancamento_e_caixa",
                {
                  p_lancamento: {
                    clinica_id: clinicaId,
                    tipo: "receita",
                    descricao: descricaoTaxa,
                    valor: taxaAdesao,
                    data: dataLanc,
                    status: "confirmado",
                    categoria_id: (catRow as { id: string } | null)?.id ?? null,
                    forma_pagamento: dados.forma_pagamento,
                    bandeira_cartao: dados.bandeira_cartao,
                    parcelas: dados.parcelas,
                    paciente_id: m.paciente_id,
                    criado_por: usuario?.id ?? null,
                  },
                  p_movimento: usuario?.id
                    ? {
                        user_id: usuario.id,
                        user_nome: usuario?.nome ?? null,
                        tipo: "recebimento",
                        valor: taxaAdesao,
                        descricao: descricaoTaxa,
                        forma_pagamento: dados.forma_pagamento,
                      }
                    : null,
                } as never,
              );
              if (rpcErr) {
                mostrarErro(
                  rpcErr,
                  "mensalidade recebida, mas a taxa de adesão não foi lançada (nada foi gravado dela)",
                );
              } else {
                const lancTaxaId = (rpcData as { lancamento_id?: string } | null)?.lancamento_id;
                // Baixa a linha da adesão (parcela 0) do mesmo contrato, se
                // existir — senão ela ficaria pendente para sempre.
                await supabase
                  .from("contrato_mensalidades")
                  .update({
                    status: "pago",
                    pago_em: dataLanc,
                    forma_pagamento: dados.forma_pagamento ?? "misto",
                    lancamento_id: lancTaxaId ?? null,
                    valor_pago: taxaAdesao,
                  })
                  .eq("contrato_id", m.contrato_id)
                  .eq("numero_parcela", 0)
                  .in("status", ["pendente", "aberto"]);
              }
              if (dados.imprimir !== false)
                await printGuiaMensalidadeComTaxa({
                  mensalidadeId: m.id,
                  clinicaId,
                  valorTaxa: taxaAdesao,
                  usuarioNome: usuario?.nome ?? undefined,
                  usuarioId: usuario?.id ?? null,
                  pagamento: {
                    valor: dados.valor,
                    forma_pagamento: dados.forma_pagamento,
                    parcelas: dados.parcelas,
                    bandeira_cartao: dados.bandeira_cartao,
                    detalhe: dados.pagamentos_detalhe,
                  },
                });
            } else if (dados.imprimir !== false) {
              await printGuiaMensalidade({
                mensalidadeId: m.id,
                clinicaId,
                usuarioNome: usuario?.nome ?? undefined,
                usuarioId: usuario?.id ?? null,
                pagamento: {
                  valor: dados.valor,
                  forma_pagamento: dados.forma_pagamento,
                  parcelas: dados.parcelas,
                  bandeira_cartao: dados.bandeira_cartao,
                  detalhe: dados.pagamentos_detalhe,
                },
              });
            }
          } catch (err) {
            mostrarErro(err);
          }
          // A mensagem precisa refletir o que realmente aconteceu: quando o
          // usuário escolhe salvar sem imprimir, dizer "GR enviada para
          // impressão" faz a guia que nunca saiu parecer problema de impressora.
          notify.success(
            dados.imprimir !== false
              ? taxaAdesao > 0
                ? "Mensalidade e taxa de adesão recebidas. GR única enviada para impressão."
                : "Mensalidade recebida e GR enviada para impressão."
              : taxaAdesao > 0
                ? "Mensalidade e taxa de adesão recebidas. Nenhuma GR foi impressa."
                : "Mensalidade recebida. Nenhuma GR foi impressa.",
          );
          setItens((prev) =>
            prev.filter(
              (x) =>
                x.id !== m.id &&
                !(taxaAdesao > 0 && isAdesao(x) && x.contrato_id === m.contrato_id),
            ),
          );
          setPagando(null);
          onPago?.();
        }}
      />

      <PagamentoAvulsoMensalidadeDialog
        open={avulsoOpen}
        onOpenChange={setAvulsoOpen}
        clinicaId={clinicaId}
        usuario={usuario}
        pacienteInicial={paciente}
        onPago={() => {
          if (paciente) void buscar(paciente);
          onPago?.();
        }}
      />
    </>
  );
}
