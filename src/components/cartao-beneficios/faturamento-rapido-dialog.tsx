import { useEffect, useState } from "react";
import { Loader2, Search, Receipt, BadgePercent } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import { printGuiaMensalidade } from "@/lib/print-gr";

const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Tolerância de 5 dias corridos; a partir do 6º dia: multa 10% + 0,33% ao dia. */
export function calcularValorMensalidade(valor: number, vencimento: string) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(`${vencimento}T00:00:00`);
  const diasAtraso = Math.floor((hoje.getTime() - venc.getTime()) / 86400000);
  if (diasAtraso <= 5) return { valorFinal: valor, juros: 0, multa: 0, diasAtraso: Math.max(0, diasAtraso) };
  const multa = +(valor * 0.1).toFixed(2);
  const juros = +(valor * 0.0033 * diasAtraso).toFixed(2);
  return { valorFinal: +(valor + multa + juros).toFixed(2), juros, multa, diasAtraso };
}

type MensalidadeAberta = {
  id: string;
  contrato_id: string;
  contrato_numero: number;
  numero_parcela: number;
  total_parcelas: number;
  valor: number;
  vencimento: string;
  titular_nome: string;
  paciente_id: string | null;
};

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

  useEffect(() => {
    if (!open) {
      setPaciente(null);
      setItens([]);
      setIsentar(false);
      setPagando(null);
    }
  }, [open]);

  const buscar = async (pac: PatientOption | null) => {
    setPaciente(pac);
    setItens([]);
    if (!pac || !clinicaId) return;
    setLoading(true);
    try {
      // Contratos onde é titular
      const { data: tit } = await supabase
        .from("contratos_assinatura")
        .select("id, numero, paciente_id, pacientes:paciente_id(nome)")
        .eq("clinica_id", clinicaId)
        .eq("status", "ativo")
        .eq("paciente_id", pac.id);
      // Contratos onde é dependente ativo
      const { data: dep } = await supabase
        .from("contrato_dependentes")
        .select("contrato_id, contratos_assinatura!inner(id, numero, status, clinica_id, paciente_id, pacientes:paciente_id(nome))")
        .eq("paciente_id", pac.id)
        .eq("ativo", true);

      const contratos = new Map<string, { numero: number; titular: string; paciente_id: string | null }>();
      for (const c of (tit ?? []) as Array<Record<string, unknown>>) {
        contratos.set(String(c.id), {
          numero: Number(c.numero),
          titular: (c.pacientes as { nome?: string } | null)?.nome ?? pac.nome,
          paciente_id: (c.paciente_id as string) ?? null,
        });
      }
      for (const d of (dep ?? []) as Array<Record<string, unknown>>) {
        const c = d.contratos_assinatura as Record<string, unknown> | null;
        if (!c || c.clinica_id !== clinicaId || c.status !== "ativo") continue;
        contratos.set(String(c.id), {
          numero: Number(c.numero),
          titular: (c.pacientes as { nome?: string } | null)?.nome ?? "Titular",
          paciente_id: (c.paciente_id as string) ?? null,
        });
      }
      if (!contratos.size) {
        setItens([]);
        return;
      }
      const { data: mens, error } = await supabase
        .from("contrato_mensalidades")
        .select("id, contrato_id, numero_parcela, valor, vencimento, status")
        .in("contrato_id", Array.from(contratos.keys()))
        .neq("status", "pago")
        .order("vencimento");
      if (error) throw error;

      const totalPorContrato = new Map<string, number>();
      for (const m of (mens ?? []) as Array<{ contrato_id: string; numero_parcela: number }>) {
        if (m.numero_parcela > 0) {
          totalPorContrato.set(m.contrato_id, Math.max(totalPorContrato.get(m.contrato_id) ?? 0, m.numero_parcela));
        }
      }
      const lista: MensalidadeAberta[] = ((mens ?? []) as Array<Record<string, unknown>>)
        .filter((m) => Number(m.numero_parcela) > 0)
        .map((m) => {
          const c = contratos.get(String(m.contrato_id))!;
          return {
            id: String(m.id),
            contrato_id: String(m.contrato_id),
            contrato_numero: c.numero,
            numero_parcela: Number(m.numero_parcela),
            total_parcelas: totalPorContrato.get(String(m.contrato_id)) ?? Number(m.numero_parcela),
            valor: Number(m.valor) || 0,
            vencimento: String(m.vencimento),
            titular_nome: c.titular,
            paciente_id: c.paciente_id,
          };
        });
      setItens(lista);
    } catch (err) {
      mostrarErro(err, "falha ao buscar mensalidades");
    } finally {
      setLoading(false);
    }
  };

  const calc = pagando ? calcularValorMensalidade(pagando.valor, pagando.vencimento) : null;
  const valorCobrar = pagando ? (isentar ? pagando.valor : (calc?.valorFinal ?? pagando.valor)) : 0;

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
            <PatientSearchInput value={paciente} onSelect={buscar} clinicaIdsOverride={[clinicaId]} autoFocus />

            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando mensalidades…
              </div>
            )}

            {!loading && paciente && !itens.length && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Search className="h-4 w-4" /> Nenhuma mensalidade em aberto para este paciente.
              </p>
            )}

            <div className="space-y-2 max-h-[50vh] overflow-auto">
              {itens.map((m) => {
                const c = calcularValorMensalidade(m.valor, m.vencimento);
                const atrasada = c.diasAtraso > 5;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        Contrato #{m.contrato_numero} — parcela {m.numero_parcela}/{m.total_parcelas}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        Titular: {m.titular_nome} · Vence em{" "}
                        {new Date(`${m.vencimento}T00:00:00`).toLocaleDateString("pt-BR")}
                      </div>
                      <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
                        <span>{BRL(m.valor)}</span>
                        {atrasada && (
                          <Badge variant="destructive">
                            {c.diasAtraso} dias em atraso · total {BRL(c.valorFinal)}
                          </Badge>
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
        categoriaFixaNome="MENSALIDADE CARTAO CONSULTA"
        initialDescricao={
          pagando
            ? `Mensalidade ${pagando.numero_parcela}/${pagando.total_parcelas} - Contrato #${pagando.contrato_numero} - ${pagando.titular_nome}`
            : ""
        }
        initialValor={pagando ? valorCobrar.toFixed(2) : ""}
        onSavedWithData={async (dados) => {
          if (!pagando) return;
          const m = pagando;
          const { error } = await supabase
            .from("contrato_mensalidades")
            .update({
              status: "pago",
              pago_em: dados.data || new Date().toISOString().slice(0, 10),
              forma_pagamento: dados.forma_pagamento ?? "misto",
              lancamento_id: dados.lancamento_id ?? null,
              valor_pago: dados.valor,
            })
            .eq("id", m.id);
          if (error) {
            mostrarErro(error, "pagamento salvo, mas a mensalidade não foi baixada");
            return;
          }
          try {
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
          } catch (err) {
            mostrarErro(err);
          }
          toast.success("Mensalidade recebida e GR enviada para impressão.");
          setItens((prev) => prev.filter((x) => x.id !== m.id));
          setPagando(null);
          onPago?.();
        }}
      />
    </>
  );
}
