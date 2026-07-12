import { useMemo, useState } from "react";
import { Loader2, CalendarClock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { reagendarAgendamento } from "@/lib/agenda/reagendar-agendamento.functions";

import { DateInputBR } from "@/components/ui/date-input-br";
/**
 * Sprint 3 · S3-C — Modal compacto de reagendamento (Agenda V2).
 * NÃO reusa o Wizard de criação. Só altera 2-3 campos do agendamento
 * (inicio, fim, medico_id opcional) via `reagendarAgendamento`.
 * Preserva o mesmo `agendamento.id`. Não move irmãos do pacote.
 */
export interface ReagendarModalSessao {
  agendamento_id: string;
  paciente_nome: string;
  procedimento: string | null;
  inicio: string;   // ISO
  fim: string;      // ISO
  medico_id: string | null;
  medico_nome: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessao: ReagendarModalSessao | null;
  clinicaId: string;
  medicoOptions: SearchableOption[];
  onSuccess?: () => void;
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ReagendarModal({ open, onOpenChange, sessao, clinicaId, medicoOptions, onSuccess }: Props) {
  const reagendarFn = useServerFn(reagendarAgendamento);
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [novaData, setNovaData] = useState<string>("");
  const [novaHora, setNovaHora] = useState<string>("");
  const [novoMedicoId, setNovoMedicoId] = useState<string>("");

  // Reseta os campos ao (re)abrir com uma nova sessão.
  useMemo(() => {
    if (open && sessao) {
      setNovaData(toDateInputValue(sessao.inicio));
      setNovaHora(toTimeInputValue(sessao.inicio));
      setNovoMedicoId(sessao.medico_id ?? "");
    }
  }, [open, sessao]);

  if (!sessao) return null;

  const duracaoMin = Math.max(1, Math.round((new Date(sessao.fim).getTime() - new Date(sessao.inicio).getTime()) / 60000));
  const trocouMedico = novoMedicoId && novoMedicoId !== sessao.medico_id;

  const handleConfirmar = async () => {
    if (!novaData || !novaHora) {
      toast.error("Escolha data e hora.");
      return;
    }
    const [hh, mm] = novaHora.split(":").map((x) => Number(x));
    const [yyyy, mmm, dd] = novaData.split("-").map((x) => Number(x));
    const novoInicio = new Date(yyyy, (mmm ?? 1) - 1, dd ?? 1, hh ?? 0, mm ?? 0, 0);
    if (Number.isNaN(novoInicio.getTime())) {
      toast.error("Horário inválido.");
      return;
    }
    const novoFim = new Date(novoInicio.getTime() + duracaoMin * 60000);
    setSaving(true);
    try {
      const res = await reagendarFn({
        data: {
          clinica_id: clinicaId,
          agendamento_id: sessao.agendamento_id,
          novo_inicio: novoInicio.toISOString(),
          novo_fim: novoFim.toISOString(),
          novo_medico_id: trocouMedico ? novoMedicoId : null,
        },
      });
      if (!res.ok) {
        if ("validation_error" in res) {
          toast.error(res.validation_error.message, { duration: res.validation_error.toast_duration });
        } else {
          toast.error(res.pg_error.message);
        }
        return;
      }
      toast.success(`Reagendado para ${novoInicio.toLocaleString("pt-BR")}.`);
      await queryClient.invalidateQueries({ queryKey: ["agenda-v2", "ags"] });
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reagendar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-indigo-600" />
            Reagendar sessão
          </DialogTitle>
          <DialogDescription className="text-xs">
            <span className="uppercase font-semibold text-slate-700">{sessao.paciente_nome}</span>
            {sessao.procedimento ? <> · {sessao.procedimento}</> : null}
            <br />
            Atual: {new Date(sessao.inicio).toLocaleString("pt-BR")}
            {sessao.medico_nome ? <> · {sessao.medico_nome}</> : null}
            <> · duração {duracaoMin} min</>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="reag-data" className="text-xs">Nova data</Label>
              <DateInputBR id="reag-data" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reag-hora" className="text-xs">Novo horário</Label>
              <Input id="reag-hora" type="time" step={60 * 5} value={novaHora} onChange={(e) => setNovaHora(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Médico (opcional — deixe como está para manter)</Label>
            <SearchableSelect
              options={medicoOptions}
              value={novoMedicoId}
              onChange={setNovoMedicoId}
              placeholder="Selecione um médico"
              searchPlaceholder="Buscar médico..."
              emptyText="Nenhum médico encontrado."
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Apenas ESTA sessão será movida. Se pertencer a um pacote, os demais itens permanecem no horário original.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirmar} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Reagendando…</> : "Confirmar reagendamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
