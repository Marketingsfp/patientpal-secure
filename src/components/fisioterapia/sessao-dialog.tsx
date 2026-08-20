import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SESSAO_LABEL, type FisioSessaoStatus } from "@/lib/fisio";

export interface SessaoRow {
  id: string;
  numero: number;
  agendamento_id: string | null;
  data_prevista: string | null;
  status: FisioSessaoStatus;
  evolucao: string | null;
  dor_antes: number | null;
  dor_depois: number | null;
  realizada_em: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clinicaId: string;
  pacienteId: string;
  sessao: SessaoRow;
  userId: string | null;
  readOnly?: boolean;
  onSaved: () => void;
}

interface AgendaOpcao {
  id: string;
  inicio: string;
  procedimento: string | null;
  status: string;
}

const SEM = "nenhum";

/** Status da sessão que corresponde ao estado atual do agendamento. */
function statusDoAgendamento(s: string): FisioSessaoStatus {
  if (s === "realizado") return "realizada";
  if (s === "faltou") return "faltou";
  if (s === "cancelado") return "pendente";
  return "agendada";
}

const fmtAgenda = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Edição de uma sessão do pacote.
 *
 * Ao vincular um agendamento, o status da sessão passa a ser espelho do que
 * está na agenda — inclusive daí para frente, por um gatilho no banco. Isso
 * evita a situação clássica de a agenda dizer "faltou" e o pacote continuar
 * contando a sessão como usada.
 */
export function SessaoDialog({
  open,
  onClose,
  clinicaId,
  pacienteId,
  sessao,
  userId,
  readOnly = false,
  onSaved,
}: Props) {
  const [agendamentoId, setAgendamentoId] = useState(SEM);
  const [dataPrevista, setDataPrevista] = useState("");
  const [status, setStatus] = useState<FisioSessaoStatus>("pendente");
  const [evolucao, setEvolucao] = useState("");
  const [dorAntes, setDorAntes] = useState("");
  const [dorDepois, setDorDepois] = useState("");
  const [agenda, setAgenda] = useState<AgendaOpcao[]>([]);
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAgendamentoId(sessao.agendamento_id ?? SEM);
    setDataPrevista(sessao.data_prevista ?? "");
    setStatus(sessao.status);
    setEvolucao(sessao.evolucao ?? "");
    setDorAntes(sessao.dor_antes === null ? "" : String(sessao.dor_antes));
    setDorDepois(sessao.dor_depois === null ? "" : String(sessao.dor_depois));
  }, [open, sessao]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [{ data: ag }, { data: usadas }] = await Promise.all([
        supabase
          .from("agendamentos")
          .select("id, inicio, procedimento, status")
          .eq("clinica_id", clinicaId)
          .eq("paciente_id", pacienteId)
          .order("inicio", { ascending: false })
          .limit(60),
        supabase.from("fisio_sessoes").select("agendamento_id").not("agendamento_id", "is", null),
      ]);
      setAgenda((ag as AgendaOpcao[]) ?? []);
      // Um agendamento já usado por outra sessão não pode aparecer como opção:
      // o banco recusaria (índice único) e o usuário levaria um erro cru.
      const s = new Set<string>();
      for (const r of (usadas ?? []) as Array<{ agendamento_id: string | null }>) {
        if (r.agendamento_id && r.agendamento_id !== sessao.agendamento_id) s.add(r.agendamento_id);
      }
      setOcupados(s);
    })();
  }, [open, clinicaId, pacienteId, sessao.agendamento_id]);

  function escolherAgendamento(id: string) {
    setAgendamentoId(id);
    if (id === SEM) return;
    const a = agenda.find((x) => x.id === id);
    if (!a) return;
    setStatus(statusDoAgendamento(a.status));
    setDataPrevista(a.inicio.slice(0, 10));
  }

  async function salvar() {
    if (readOnly) return;
    if (salvando) return;
    setSalvando(true);
    const { error } = await supabase
      .from("fisio_sessoes")
      .update({
        agendamento_id: agendamentoId === SEM ? null : agendamentoId,
        data_prevista: dataPrevista || null,
        status,
        evolucao: evolucao.trim() || null,
        dor_antes: dorAntes === "" ? null : Number(dorAntes),
        dor_depois: dorDepois === "" ? null : Number(dorDepois),
        realizada_em:
          status === "realizada" ? (sessao.realizada_em ?? new Date().toISOString()) : null,
        registrado_por: userId,
      })
      .eq("id", sessao.id);
    setSalvando(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success(`Sessão ${sessao.numero} atualizada`);
    onSaved();
    onClose();
  }

  const opcoes = agenda.filter((a) => !ocupados.has(a.id));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sessão {sessao.numero}</DialogTitle>
          <DialogDescription>
            Vincule o agendamento da agenda para que a presença seja marcada sozinha.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Agendamento na agenda</Label>
            <Select value={agendamentoId} onValueChange={escolherAgendamento} disabled={readOnly}>
              <SelectTrigger>
                <SelectValue placeholder="Não vinculado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Não vinculado</SelectItem>
                {opcoes.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {fmtAgenda(a.inicio)} · {a.procedimento ?? "sem procedimento"} ({a.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {opcoes.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Nenhum agendamento disponível deste paciente. Marque na Agenda primeiro.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data prevista</Label>
              <Input
                type="date"
                value={dataPrevista}
                onChange={(e) => setDataPrevista(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>Situação</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as FisioSessaoStatus)}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SESSAO_LABEL) as FisioSessaoStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SESSAO_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Dor antes (0–10)</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={dorAntes}
                onChange={(e) => setDorAntes(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>Dor depois (0–10)</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={dorDepois}
                onChange={(e) => setDorDepois(e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>

          <div>
            <Label>Evolução da sessão</Label>
            <Textarea
              value={evolucao}
              onChange={(e) => setEvolucao(e.target.value)}
              rows={4}
              disabled={readOnly}
              placeholder="o que foi feito, resposta do paciente, orientações"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {readOnly ? "Fechar" : "Cancelar"}
          </Button>
          {!readOnly && (
            <Button onClick={() => void salvar()} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar sessão"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
