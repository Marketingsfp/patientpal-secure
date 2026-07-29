import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClinica } from "@/hooks/use-clinica";
import { marcarAtendimentoExterno } from "@/lib/agenda/atendimento-externo.functions";
import { supabase } from "@/integrations/supabase/client";
import { buscarVinculoConvenio, type ModalidadeConvenio } from "@/lib/convenio/modalidade";
import { calcularRepasseExterno, listarConveniosClinica } from "@/lib/agenda/atendimento-externo-repasse";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agendamentoId: string | null;
  clinicaId: string | null;
  pacienteNome?: string | null;
  procedimento?: string | null;
  onDone?: () => void;
};

type ConvenioOpt = { id: string; nome: string; modalidade: ModalidadeConvenio };

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

/**
 * Registra um atendimento que foi faturado em outra clínica parceira:
 * não gera caixa nem NFS-e aqui, apenas marca a origem no agendamento e
 * cria o fin_atendimentos com valor_clinica = 0 para o repasse do médico.
 */
export function AtendimentoExternoDialog({
  open,
  onOpenChange,
  agendamentoId,
  clinicaId,
  pacienteNome,
  procedimento,
  onDone,
}: Props) {
  const marcarFn = useServerFn(marcarAtendimentoExterno);
  const { memberships } = useClinica();
  const [origemId, setOrigemId] = useState<string>("");
  const [clinicaNome, setClinicaNome] = useState("");
  const [temConvenio, setTemConvenio] = useState(false);
  const [convenios, setConvenios] = useState<ConvenioOpt[]>([]);
  const [convenioId, setConvenioId] = useState<string>("");
  const [valorTabela, setValorTabela] = useState(0);
  const [repasse, setRepasse] = useState<number | null>(null);
  const [medicoId, setMedicoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [calculando, setCalculando] = useState(false);

  const unidades = memberships
    .filter((m) => m.clinica_id !== clinicaId)
    .map((m) => ({ id: m.clinica_id, nome: m.clinica.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

  const modalidade: ModalidadeConvenio | null =
    temConvenio ? convenios.find((c) => c.id === convenioId)?.modalidade ?? null : null;

  useEffect(() => {
    if (open) {
      setOrigemId("");
      setClinicaNome("");
      setTemConvenio(false);
      setConvenioId("");
      setRepasse(null);
      setValorTabela(0);
    }
  }, [open]);

  // Carrega médico/paciente do agendamento, convênios da clínica e detecta
  // se o paciente já tem contrato ativo (pré-marca a flag).
  useEffect(() => {
    if (!open || !clinicaId || !agendamentoId) return;
    let cancelado = false;
    void (async () => {
      const [{ data: ag }, lista] = await Promise.all([
        supabase
          .from("agendamentos")
          .select("medico_id,paciente_id")
          .eq("id", agendamentoId)
          .maybeSingle(),
        listarConveniosClinica(clinicaId),
      ]);
      if (cancelado) return;
      setMedicoId((ag?.medico_id as string | null) ?? null);
      setConvenios(lista);
      const vinculo = await buscarVinculoConvenio(clinicaId, (ag?.paciente_id as string | null) ?? null);
      if (cancelado || !vinculo) return;
      setTemConvenio(true);
      setConvenioId(vinculo.convenioId);
    })();
    return () => { cancelado = true; };
  }, [open, clinicaId, agendamentoId]);

  // Repasse do médico conforme o cadastro (muda com a flag/convênio).
  useEffect(() => {
    if (!open || !clinicaId || !procedimento?.trim()) return;
    if (temConvenio && !convenioId) { setRepasse(null); return; }
    let cancelado = false;
    setCalculando(true);
    void (async () => {
      const r = await calcularRepasseExterno({
        clinicaId,
        medicoId,
        procedimento,
        modalidade,
      });
      if (cancelado) return;
      setValorTabela(r.valorTabela);
      setRepasse(r.repasse);
      setCalculando(false);
    })();
    return () => { cancelado = true; };
  }, [open, clinicaId, procedimento, medicoId, temConvenio, convenioId, modalidade]);

  const salvar = async () => {
    if (!agendamentoId || !clinicaId) return;
    const unidade = unidades.find((u) => u.id === origemId);
    const nomeOrigem = unidade ? unidade.nome : clinicaNome.trim();
    if (!nomeOrigem) return toast.error("Informe a clínica de origem.");
    if (temConvenio && !convenioId) return toast.error("Selecione o convênio do paciente.");
    setSalvando(true);
    const res = await marcarFn({
      data: {
        agendamento_id: agendamentoId,
        clinica_id: clinicaId,
        origem_clinica_id: unidade ? unidade.id : null,
        origem_clinica_nome: nomeOrigem,
        origem_valor: valorTabela > 0 ? valorTabela : null,
        repasse_medico: repasse != null ? repasse : null,
        convenio_id: temConvenio ? convenioId : null,
      },
    });
    setSalvando(false);
    if (!res.ok) return toast.error(res.message);
    toast.success("Atendimento externo registrado — sem lançamento em caixa.");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-orange-600" /> Atendimento externo
          </DialogTitle>
          <DialogDescription>
            Paciente atendido aqui, mas faturado em outra clínica. Não entra no caixa
            nem gera nota fiscal — apenas alimenta o repasse do médico e o acerto entre clínicas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(pacienteNome || procedimento) && (
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">{pacienteNome ?? "—"}</div>
              <div className="text-muted-foreground text-xs">{procedimento ?? "—"}</div>
            </div>
          )}
          <div>
            <Label>Clínica de origem</Label>
            <Select value={origemId} onValueChange={setOrigemId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a unidade" />
              </SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
                <SelectItem value="outra">Outra clínica (digitar)</SelectItem>
              </SelectContent>
            </Select>
            {origemId === "outra" && (
              <Input
                className="mt-2"
                value={clinicaNome}
                onChange={(e) => setClinicaNome(e.target.value)}
                placeholder="Ex.: Policlínica São Francisco de Paula"
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={temConvenio}
                onCheckedChange={(v) => {
                  const on = v === true;
                  setTemConvenio(on);
                  if (!on) setConvenioId("");
                }}
              />
              <span>Paciente tem convênio</span>
            </label>
            {temConvenio && (
              <Select value={convenioId} onValueChange={setConvenioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o convênio" />
                </SelectTrigger>
                <SelectContent>
                  {convenios.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label>Repasse do médico</Label>
            <div className="mt-1 rounded-md border bg-muted/40 px-3 py-2 text-lg font-semibold tabular-nums">
              {calculando
                ? <span className="text-sm font-normal text-muted-foreground">Calculando…</span>
                : temConvenio && !convenioId
                ? <span className="text-sm font-normal text-muted-foreground">Selecione o convênio</span>
                : repasse != null && repasse > 0
                ? brl(repasse)
                : <span className="text-sm font-normal text-muted-foreground">Sem regra de repasse cadastrada (R$ 0,00)</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Calculado pelo cadastro de repasse do médico
              {temConvenio ? " (regras de convênio)" : " (particular)"} — não editável.
            </p>
            <div className="mt-2 flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Este valor é usado <b>apenas para o repasse do médico</b>. Não entra no
                movimento de caixa da atendente e não gera nota fiscal.
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Registrar externo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
