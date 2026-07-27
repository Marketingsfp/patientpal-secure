import { useEffect, useMemo, useState } from "react";
import { Loader2, Receipt } from "lucide-react";
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
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import { printGuiaMensalidade } from "@/lib/print-gr";

type Convenio = { id: string; nome: string; valor_mensal: number | null; num_parcelas: number | null };

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
  const [convenioId, setConvenioId] = useState<string>("");
  const [refMes, setRefMes] = useState<string>(mesAtual);
  const [valor, setValor] = useState<string>("");
  const [diaVenc, setDiaVenc] = useState<string>("10");
  const [criarContrato, setCriarContrato] = useState(true);
  const [loading, setLoading] = useState(false);
  const [lancOpen, setLancOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPaciente(pacienteInicial ?? null);
    setRefMes(mesAtual);
    setCriarContrato(true);
    (async () => {
      setLoading(true);
      const { data: cv } = await supabase
        .from("cb_convenios")
        .select("id, nome, valor_mensal, num_parcelas")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .order("nome");
      setConvenios((cv ?? []) as Convenio[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clinicaId]);

  const valorNum = Number(String(valor).replace(/\./g, "").replace(",", ".")) || 0;

  const resumo = useMemo(() => {
    if (!criarContrato) return null;
    const dia = Math.max(1, Math.min(31, Number(diaVenc) || 10));
    return {
      primeiro: vencimentoDe(refMes, 0, dia),
      ultimo: vencimentoDe(refMes, TOTAL_PARCELAS - 1, dia),
      pendentes: TOTAL_PARCELAS - 1,
    };
  }, [criarContrato, refMes, diaVenc]);

  const podeAvancar = !!paciente && !!refMes && valorNum > 0 && (!criarContrato || !!convenioId);

  const escolherConvenio = (id: string) => {
    setConvenioId(id);
    const p = convenios.find((x) => x.id === id);
    if (p && Number(p.valor_mensal) > 0 && !valorNum) setValor(String(Number(p.valor_mensal).toFixed(2)));
  };

  /** Cria contrato + 12 parcelas; devolve o id da parcela do mês de referência. */
  const criarContratoEParcelas = async (dadosPagamento: {
    valor: number;
    forma_pagamento?: string | null;
    lancamento_id?: string | null;
    data?: string | null;
  }) => {
    if (!paciente) return null;
    const dia = Math.max(1, Math.min(31, Number(diaVenc) || 10));
    const inicio = vencimentoDe(refMes, 0, 1);
    const { data: contrato, error: errC } = await supabase
      .from("contratos_assinatura")
      .insert({
        clinica_id: clinicaId,
        convenio_id: convenioId || null,
        paciente_id: paciente.id,
        paciente_nome: paciente.nome,
        data_inicio: inicio,
        data_fim: vencimentoDe(refMes, TOTAL_PARCELAS, 1),
        dia_vencimento: dia,
        valor_mensal: valorNum,
        num_parcelas: TOTAL_PARCELAS,
        status: "ativo",
        criado_por: usuario?.id ?? null,
        observacoes: `Contrato criado pelo pagamento avulso (regularização) — mês de referência ${rotuloMes(refMes)}.`,
      } as never)
      .select("id, numero")
      .single();
    if (errC) throw errC;

    const rows = Array.from({ length: TOTAL_PARCELAS }, (_, i) => {
      const venc = vencimentoDe(refMes, i, dia);
      const paga = i === 0;
      return {
        contrato_id: (contrato as { id: string }).id,
        clinica_id: clinicaId,
        numero_parcela: i + 1,
        vencimento: venc,
        valor: valorNum,
        status: paga ? "pago" : "pendente",
        pago_em: paga ? (dadosPagamento.data || new Date().toISOString().slice(0, 10)) : null,
        valor_pago: paga ? dadosPagamento.valor : null,
        forma_pagamento: paga ? (dadosPagamento.forma_pagamento ?? "misto") : null,
        lancamento_id: paga ? (dadosPagamento.lancamento_id ?? null) : null,
        observacoes: paga ? "Recebida no pagamento avulso (regularização)" : "Gerada na regularização do avulso",
      };
    });
    const { data: inseridas, error: errM } = await supabase
      .from("contrato_mensalidades")
      .insert(rows as never)
      .select("id, numero_parcela");
    if (errM) throw errM;
    const primeira = ((inseridas ?? []) as Array<{ id: string; numero_parcela: number }>).find(
      (m) => m.numero_parcela === 1,
    );
    return { contratoId: (contrato as { id: string }).id, mensalidadeId: primeira?.id ?? null };
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
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
              <PatientSearchInput value={paciente} onSelect={setPaciente} clinicaIdsOverride={[clinicaId]} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Mês de referência</Label>
                <Input type="month" value={refMes} onChange={(e) => setRefMes(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Valor da mensalidade</Label>
                <Input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                />
              </div>
            </div>

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
                <div className="grid grid-cols-2 gap-3">
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
                </div>
                {resumo && (
                  <p className="text-xs text-muted-foreground">
                    Parcela 1/12 = {rotuloMes(refMes)} (será baixada como paga agora) · demais{" "}
                    {resumo.pendentes} parcelas ficam pendentes até{" "}
                    {new Date(`${resumo.ultimo}T00:00:00`).toLocaleDateString("pt-BR")}.
                  </p>
                )}
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
    </>
  );
}