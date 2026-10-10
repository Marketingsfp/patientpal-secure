import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { ehBloqueioAgenda, NOME_BLOQUEIO, observacaoDoBloqueio } from "@/lib/agenda/bloqueio";

// "Médico ausente" pela Agenda — substitui o paciente fictício "NAO MARCAR".
// Só transforma em BLOQUEIO as fichas LIVRES do período; ficha com paciente
// nunca é tocada (a tela avisa quantas sobraram, para a recepção remarcar).
// O motivo é obrigatório: é ele que a recepcionista lê na faixa da Agenda.

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clinicaId: string | null;
  medicos: Array<{ id: string; nome: string }>;
  medicoInicial: string | null;
  dataInicial: string;
  onConcluido: () => void;
};

// Horário de Brasília fixo (sem horário de verão desde 2019) — o mesmo dia
// que a recepção vê na tela, independente do relógio do computador.
const isoBR = (dia: string, hora: string, seg: string) => `${dia}T${hora}:${seg}-03:00`;

export function BloqueioAgendaDialog({
  open,
  onOpenChange,
  clinicaId,
  medicos,
  medicoInicial,
  dataInicial,
  onConcluido,
}: Props) {
  const [medicoId, setMedicoId] = useState("");
  const [dataInicio, setDataInicio] = useState(dataInicial);
  const [dataFim, setDataFim] = useState(dataInicial);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMedicoId(medicoInicial ?? "");
    setDataInicio(dataInicial);
    setDataFim(dataInicial);
    setHoraInicio("");
    setHoraFim("");
    setMotivo("");
  }, [open, medicoInicial, dataInicial]);

  const aplicar = async () => {
    if (!clinicaId || salvando) return;
    if (!medicoId) return toast.error("Escolha o médico.");
    if (!dataInicio || !dataFim) return toast.error("Informe o período.");
    if (dataFim < dataInicio) return toast.error("A data final não pode ser antes da inicial.");
    if (horaInicio && horaFim && horaFim <= horaInicio)
      return toast.error("O horário final precisa ser depois do inicial.");
    const motivoLimpo = motivo.trim();
    if (!motivoLimpo) return toast.error("Escreva o motivo (ex.: FOLGA, CONGRESSO, IMPREVISTO).");

    setSalvando(true);
    try {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, paciente_nome, paciente_id, status")
        .eq("clinica_id", clinicaId)
        .eq("medico_id", medicoId)
        .neq("status", "cancelado")
        .gte("inicio", isoBR(dataInicio, horaInicio || "00:00", "00"))
        .lt("inicio", isoBR(dataFim, horaFim || "23:59", horaFim ? "00" : "59"))
        .limit(2000);
      if (error) throw error;
      const linhas = (data ?? []) as Array<{
        id: string;
        paciente_nome: string | null;
        paciente_id: string | null;
        status: string;
      }>;
      const livres = linhas.filter(
        (l) =>
          !l.paciente_id &&
          (l.paciente_nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase() ===
            "DISPONIVEL",
      );
      const jaBloqueados = linhas.filter((l) => ehBloqueioAgenda(l)).length;
      const comPaciente = linhas.length - livres.length - jaBloqueados;
      if (livres.length === 0) {
        toast.info(
          jaBloqueados > 0 && comPaciente === 0
            ? "Esse período já está bloqueado."
            : "Nenhum horário livre nesse período para bloquear. Se a agenda desse dia ainda não foi gerada, gere os horários antes.",
        );
        return;
      }
      const { error: eUpd } = await supabase
        .from("agendamentos")
        .update({
          paciente_nome: NOME_BLOQUEIO,
          observacoes: observacaoDoBloqueio(motivoLimpo),
        } as never)
        .in(
          "id",
          livres.map((l) => l.id),
        )
        // Só o que continua livre no banco: se alguém marcou paciente num
        // desses horários enquanto o diálogo estava aberto, ele fica intacto.
        .is("paciente_id", null)
        .in("paciente_nome", Array.from(new Set(livres.map((l) => l.paciente_nome ?? ""))));
      if (eUpd) throw eUpd;
      if (comPaciente > 0) {
        toast.warning(
          `${livres.length} horário(s) bloqueado(s). ${comPaciente} já tinham paciente e continuam marcados — avise esses pacientes e remarque.`,
          { duration: 12000 },
        );
      } else {
        toast.success(`${livres.length} horário(s) bloqueado(s).`);
      }
      onOpenChange(false);
      onConcluido();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-slate-600" />
            Médico ausente / bloquear horários
          </DialogTitle>
          <DialogDescription>
            Os horários livres do período ficam bloqueados e aparecem na Agenda como uma faixa cinza
            com o motivo. Ninguém consegue marcar paciente neles — nem a Nina nem o site. Horários
            que já têm paciente não são alterados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Médico</Label>
            <Select value={medicoId} onValueChange={setMedicoId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o médico" />
              </SelectTrigger>
              <SelectContent>
                {medicos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="bloq-data-ini">De</Label>
              <Input
                id="bloq-data-ini"
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value);
                  if (dataFim < e.target.value) setDataFim(e.target.value);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bloq-data-fim">Até</Label>
              <Input
                id="bloq-data-fim"
                type="date"
                value={dataFim}
                min={dataInicio}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bloq-hora-ini">Das (opcional)</Label>
              <Input
                id="bloq-hora-ini"
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bloq-hora-fim">Até as (opcional)</Label>
              <Input
                id="bloq-hora-fim"
                type="time"
                value={horaFim}
                onChange={(e) => setHoraFim(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Sem horário, o bloqueio vale para o dia inteiro.
          </p>
          <div className="space-y-1">
            <Label htmlFor="bloq-motivo">Motivo *</Label>
            <Textarea
              id="bloq-motivo"
              rows={2}
              placeholder="EX.: FOLGA, CONGRESSO, IMPREVISTO, ATENDIMENTO EXTERNO"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value.toUpperCase())}
              className="uppercase"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Voltar
          </Button>
          <Button onClick={() => void aplicar()} disabled={salvando || !clinicaId}>
            {salvando ? "Bloqueando..." : "Bloquear horários"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
