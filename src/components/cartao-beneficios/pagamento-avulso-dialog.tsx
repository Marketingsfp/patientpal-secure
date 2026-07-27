import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Receipt, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { QuickPatientDialog } from "@/components/pacientes/quick-patient-dialog";
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import { printGuiaMensalidade } from "@/lib/print-gr";

type Convenio = { id: string; nome: string; valor_mensal: number | null; num_parcelas: number | null };
type Faixa = { convenio_id: string; vidas_de: number; vidas_ate: number | null; valor_mensal: number };
type DependenteLinha = { key: string; paciente: PatientOption | null; parentesco: string };

const TOTAL_PARCELAS = 12;

/** Vencimento (yyyy-mm-dd) do mês de referência + offset, respeitando o último dia do mês. */
function vencimentoDe(refMes: string, offset: number, dia: number) {
  const [ano, mes] = refMes.split("-").map(Number);
  const base = new Date(ano, (mes - 1) + offset, 1);
  const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const d = new Date(base.getFullYear(), base.getMonth(), Math.min(Math.max(1, dia), ultimo));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rotuloMes(refMes: string) {
  const [ano, mes] = refMes.split("-").map(Number);
  return new Date(ano, mes - 1, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Pagamento avulso da mensalidade do Cartão (Consulta / Desconto).
 *
 * Usado para regularizar pacientes que ainda não têm contrato no sistema:
 * pergunta o MÊS DE REFERÊNCIA, recebe o valor no caixa e — quando marcado —
 * cria o contrato e gera as mensalidades faltantes até completar 12 meses,
 * já com a parcela do mês de referência baixada como paga.
 */
export function PagamentoAvulsoMensalidadeDialog({
  open,
  onOpenChange,
  clinicaId,
  usuario,
  pacienteInicial,
  onPago,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clinicaId: string;
  usuario?: { id?: string | null; nome?: string | null } | null;
  pacienteInicial?: PatientOption | null;
  onPago?: () => void;
}) {
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  const [paciente, setPaciente] = useState<PatientOption | null>(pacienteInicial ?? null);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [convenioId, setConvenioId] = useState<string>("");
  const [refMes, setRefMes] = useState<string>(mesAtual);
  const [parcelasPagas, setParcelasPagas] = useState<string>("");
  const [valor, setValor] = useState<string>("");
  const [diaVenc, setDiaVenc] = useState<string>("10");
  const [criarContrato, setCriarContrato] = useState(true);
  const [loading, setLoading] = useState(false);
  const [lancOpen, setLancOpen] = useState(false);
  const [dependentes, setDependentes] = useState<DependenteLinha[]>([]);
  const [quickOpen, setQuickOpen] = useState<{ alvo: "titular" | string; nome: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setPaciente(pacienteInicial ?? null);
    setRefMes(mesAtual);
    setCriarContrato(true);
    setParcelasPagas("");
    setDependentes([]);
    (async () => {
      setLoading(true);
      const { data: cv } = await supabase
        .from("cb_convenios")
        .select("id, nome, valor_mensal, num_parcelas")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .order("nome");
      const lista = (cv ?? []) as Convenio[];
      setConvenios(lista);
      if (lista.length) {
        const { data: fx } = await supabase
          .from("cb_convenio_faixas")
          .select("convenio_id, vidas_de, vidas_ate, valor_mensal")
          .in("convenio_id", lista.map((c) => c.id))
          .order("vidas_de");
        setFaixas((fx ?? []) as Faixa[]);
      } else {
        setFaixas([]);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clinicaId]);

  const valorNum = Number(String(valor).replace(/\./g, "").replace(",", ".")) || 0;
  const pagasNum = Math.max(0, Math.min(TOTAL_PARCELAS - 1, Number(parcelasPagas) || 0));
  const dependentesValidos = dependentes.filter((d) => !!d.paciente);
  const vidas = 1 + dependentesValidos.length;

  /** Faixa de vidas do convênio selecionado que cobre o nº de pessoas do contrato. */
  const faixaAtual = useMemo(() => {
    if (!convenioId) return null;
    return (
      faixas.find(
        (f) =>
          f.convenio_id === convenioId &&
          vidas >= Number(f.vidas_de) &&
          (f.vidas_ate == null || vidas <= Number(f.vidas_ate)),
      ) ?? null
    );
  }, [faixas, convenioId, vidas]);

  // Valor automático: faixa de vidas do convênio; sem faixa, valor_mensal do convênio.
  useEffect(() => {
    if (!criarContrato || !convenioId) return;
    const conv = convenios.find((c) => c.id === convenioId);
    const auto = faixaAtual ? Number(faixaAtual.valor_mensal) : Number(conv?.valor_mensal ?? 0);
    if (auto > 0) setValor(auto.toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convenioId, faixaAtual, criarContrato]);

  const resumo = useMemo(() => {
    if (!criarContrato) return null;
    const dia = Math.max(1, Math.min(31, Number(diaVenc) || 10));
    return {
      primeiro: vencimentoDe(refMes, -pagasNum, dia),
      ultimo: vencimentoDe(refMes, TOTAL_PARCELAS - 1 - pagasNum, dia),
      pendentes: TOTAL_PARCELAS - 1 - pagasNum,
      numeroAtual: pagasNum + 1,
    };
  }, [criarContrato, refMes, diaVenc, pagasNum]);

  const podeAvancar =
    !!paciente &&
    !!refMes &&
    valorNum > 0 &&
    (!criarContrato || (!!convenioId && dependentes.every((d) => !!d.paciente)));

  const escolherConvenio = (id: string) => {
    setConvenioId(id);
  };

  const addDependente = () =>
    setDependentes((d) => [...d, { key: crypto.randomUUID(), paciente: null, parentesco: "" }]);

  /** Cria contrato + 12 parcelas; devolve o id da parcela do mês de referência. */
  const criarContratoEParcelas = async (dadosPagamento: {
    valor: number;
    forma_pagamento?: string | null;
    lancamento_id?: string | null;
    data?: string | null;
  }) => {
    if (!paciente) return null;
    const dia = Math.max(1, Math.min(31, Number(diaVenc) || 10));
    const inicio = vencimentoDe(refMes, -pagasNum, 1);
    const { data: contrato, error: errC } = await supabase
      .from("contratos_assinatura")
      .insert({
        clinica_id: clinicaId,
        convenio_id: convenioId || null,
        paciente_id: paciente.id,
        paciente_nome: paciente.nome,
        data_inicio: inicio,
        data_fim: vencimentoDe(refMes, TOTAL_PARCELAS - pagasNum, 1),
        dia_vencimento: dia,
        valor_mensal: valorNum,
        num_parcelas: TOTAL_PARCELAS,
        status: "ativo",
        criado_por: usuario?.id ?? null,
        observacoes:
          `Contrato criado pelo pagamento avulso (regularização) — mês de referência ${rotuloMes(refMes)}.` +
          (pagasNum > 0 ? ` ${pagasNum} parcela(s) informada(s) como já paga(s) antes do sistema.` : ""),
      } as never)
      .select("id, numero")
      .single();
    if (errC) throw errC;

    const contratoId = (contrato as { id: string }).id;

    const rows = Array.from({ length: TOTAL_PARCELAS }, (_, i) => {
      const venc = vencimentoDe(refMes, i - pagasNum, dia);
      const paga = i === pagasNum;
      const historico = i < pagasNum;
      return {
        contrato_id: contratoId,
        clinica_id: clinicaId,
        numero_parcela: i + 1,
        vencimento: venc,
        valor: valorNum,
        status: paga || historico ? "pago" : "pendente",
        pago_em: paga ? (dadosPagamento.data || new Date().toISOString().slice(0, 10)) : historico ? venc : null,
        valor_pago: paga ? dadosPagamento.valor : historico ? valorNum : null,
        forma_pagamento: paga ? (dadosPagamento.forma_pagamento ?? "misto") : null,
        lancamento_id: paga ? (dadosPagamento.lancamento_id ?? null) : null,
        observacoes: paga
          ? "Recebida no pagamento avulso (regularização)"
          : historico
            ? "Regularização — parcela informada como paga anteriormente"
            : "Gerada na regularização do avulso",
      };
    });
    const { data: inseridas, error: errM } = await supabase
      .from("contrato_mensalidades")
      .insert(rows as never)
      .select("id, numero_parcela");
    if (errM) throw errM;
    const atual = ((inseridas ?? []) as Array<{ id: string; numero_parcela: number }>).find(
      (m) => m.numero_parcela === pagasNum + 1,
    );

    // Dependentes informados na hora.
    if (dependentesValidos.length) {
      const { error: errD } = await supabase.from("contrato_dependentes").insert(
        dependentesValidos.map((d) => ({
          contrato_id: contratoId,
          paciente_id: d.paciente!.id,
          paciente_nome: d.paciente!.nome,
          parentesco: d.parentesco || null,
          tipo: "dependente",
        })) as never,
      );
      if (errD) mostrarErro(errD, "contrato criado, mas os dependentes não foram vinculados");
    }

    return { contratoId, mensalidadeId: atual?.id ?? null };
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Pagamento avulso — Mensalidade do Cartão
            </DialogTitle>
            <DialogDescription>
              Para pacientes sem contrato no sistema. Informe o mês de referência do pagamento; se quiser,
              o sistema já cria o contrato e as mensalidades faltantes até completar 12 meses.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Paciente</Label>
              <PatientSearchInput
                value={paciente}
                onSelect={setPaciente}
                clinicaIdsOverride={[clinicaId]}
                onRequestCreate={(q) => setQuickOpen({ alvo: "titular", nome: q })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Mês de referência</Label>
                <Input type="month" value={refMes} onChange={(e) => setRefMes(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Parcelas já pagas</Label>
                <Input
                  type="number"
                  min={0}
                  max={TOTAL_PARCELAS - 1}
                  placeholder="0"
                  value={parcelasPagas}
                  onChange={(e) => setParcelasPagas(e.target.value)}
                />
              </div>
            </div>

            {criarContrato && pagasNum === 0 && (
              <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Nenhuma parcela paga informada: será criado um novo contrato com as 12 mensalidades, sendo a do
                mês de referência baixada agora.
              </p>
            )}

            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <Checkbox checked={criarContrato} onCheckedChange={(v) => setCriarContrato(!!v)} />
              <span>
                Criar o contrato e gerar as mensalidades faltantes até 12 meses
                <span className="block text-xs text-muted-foreground">
                  Desmarque para apenas registrar o valor no caixa, sem criar contrato.
                </span>
              </span>
            </label>

            {criarContrato && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-1">
                    <Label>Convênio</Label>
                    <Select value={convenioId} onValueChange={escolherConvenio} disabled={loading}>
                      <SelectTrigger>
                        <SelectValue placeholder={loading ? "Carregando…" : "Selecione o convênio"} />
                      </SelectTrigger>
                      <SelectContent>
                        {convenios.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2 rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      Dependentes ({dependentesValidos.length}) · {vidas} vida(s) no contrato
                    </Label>
                    <Button type="button" size="sm" variant="outline" onClick={addDependente}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar dependente
                    </Button>
                  </div>
                  {dependentes.map((d) => (
                    <div key={d.key} className="grid grid-cols-[1fr_120px_32px] items-center gap-2">
                      <PatientSearchInput
                        value={d.paciente}
                        onSelect={(p) =>
                          setDependentes((arr) =>
                            arr.map((x) => (x.key === d.key ? { ...x, paciente: p } : x)),
                          )
                        }
                        clinicaIdsOverride={[clinicaId]}
                        placeholder="Nome ou CPF do dependente"
                        onRequestCreate={(q) => setQuickOpen({ alvo: d.key, nome: q })}
                      />
                      <Input
                        placeholder="Parentesco"
                        value={d.parentesco}
                        onChange={(e) =>
                          setDependentes((arr) =>
                            arr.map((x) => (x.key === d.key ? { ...x, parentesco: e.target.value } : x)),
                          )
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setDependentes((arr) => arr.filter((x) => x.key !== d.key))}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {dependentes.length === 0 && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <UserPlus className="h-3.5 w-3.5" /> Somente o titular. Adicione dependentes para
                      recalcular o valor por faixa de vidas.
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Valor da mensalidade</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="Selecione o convênio e as pessoas do contrato"
                    value={valor}
                    readOnly
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    {faixaAtual
                      ? `Faixa ${faixaAtual.vidas_de} a ${faixaAtual.vidas_ate ?? "+"} vidas — ${Number(
                          faixaAtual.valor_mensal,
                        ).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} — definido pela tabela do convênio.`
                      : "Valor definido automaticamente pelo convênio e pelo número de vidas do contrato."}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label>Dia de vencimento</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={diaVenc}
                    onChange={(e) => setDiaVenc(e.target.value)}
                  />
                </div>

                {resumo && (
                  <p className="text-xs text-muted-foreground">
                    Parcela {resumo.numeroAtual}/12 = {rotuloMes(refMes)} (será baixada como paga agora)
                    {pagasNum > 0 ? ` · ${pagasNum} parcela(s) anterior(es) já marcada(s) como paga(s)` : ""} · demais{" "}
                    {resumo.pendentes} parcelas ficam pendentes até{" "}
                    {new Date(`${resumo.ultimo}T00:00:00`).toLocaleDateString("pt-BR")}.
                  </p>
                )}
              </div>
            )}

            {!criarContrato && (
              <div className="space-y-1">
                <Label>Valor da mensalidade</Label>
                <Input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={!podeAvancar} onClick={() => setLancOpen(true)}>
              Continuar para o recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LancamentoDialog
        open={lancOpen}
        onOpenChange={setLancOpen}
        tipo="receita"
        categoriaFixaNome="MENSALIDADE CARTAO CONSULTA"
        initialDescricao={
          paciente
            ? `Mensalidade Cartão ${rotuloMes(refMes)} (avulso) - ${paciente.nome}`
            : `Mensalidade Cartão ${rotuloMes(refMes)} (avulso)`
        }
        initialValor={valorNum ? valorNum.toFixed(2) : ""}
        onSavedWithData={async (dados) => {
          setLancOpen(false);
          if (!criarContrato) {
            toast.success("Pagamento avulso registrado no caixa.");
            onOpenChange(false);
            onPago?.();
            return;
          }
          try {
            const res = await criarContratoEParcelas(dados);
            if (res?.mensalidadeId) {
              await printGuiaMensalidade({
                mensalidadeId: res.mensalidadeId,
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
            toast.success(
              `Pagamento registrado. Contrato criado com 12 parcelas — ${rotuloMes(refMes)} baixada como paga.`,
            );
          } catch (err) {
            mostrarErro(err, "pagamento registrado no caixa, mas o contrato não foi criado");
          }
          onOpenChange(false);
          onPago?.();
        }}
      />

      <QuickPatientDialog
        open={!!quickOpen}
        onOpenChange={(v) => !v && setQuickOpen(null)}
        clinicaId={clinicaId}
        nomeInicial={quickOpen?.nome}
        onCreated={(p) => {
          const alvo = quickOpen?.alvo;
          if (alvo && alvo !== "titular") {
            setDependentes((arr) => arr.map((x) => (x.key === alvo ? { ...x, paciente: p } : x)));
          } else {
            setPaciente(p);
          }
          setQuickOpen(null);
        }}
      />
    </>
  );
}