import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { cn } from "@/lib/utils";
import { ptBR } from "date-fns/locale";
import { Zap, User, Stethoscope, CalendarDays, Clock, UserRound, Loader2, CalendarX, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/agenda_/express")({
  component: AgendaExpressPage,
  head: () => ({
    meta: [
      { title: "Agenda Express — ClinicaOS" },
      { name: "description", content: "Agendamento rápido e simplificado em poucos cliques." },
    ],
  }),
});

type Especialidade = { id: string; nome: string };
type Medico = { id: string; nome: string; especialidade_id: string | null };
type Slot = {
  medico_id: string;
  medico_nome: string;
  especialidade_id: string | null;
  especialidade_nome: string | null;
  agenda_id: string | null;
  agenda_nome: string | null;
  inicio: string;
  fim: string;
  ocupados: number;
  capacidade: number;
};

const LABEL = "block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5";
const CARD = "bg-white rounded-xl shadow-sm border border-slate-200";

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function slotKey(s: Slot) {
  return `${s.inicio}|${s.medico_id}|${s.agenda_id ?? "-"}|${s.especialidade_id ?? "-"}`;
}

function AgendaExpressPage() {
  const { clinicaAtual, modoTodas } = useClinica();
  const navigate = useNavigate();
  const clinicaId = clinicaAtual?.clinica_id ?? null;

  const [paciente, setPaciente] = useState<PatientOption | null>(null);
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [especialidadeId, setEspecialidadeId] = useState<string>("");
  const [medicoId, setMedicoId] = useState<string>("");
  const [data, setData] = useState<Date>(new Date());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [busca, setBusca] = useState("");

  // Especialidades + médicos ativos da clínica
  useEffect(() => {
    if (!clinicaId) return;
    (async () => {
      const { data: rows } = await supabase
        .from("medicos")
        .select("id, nome, especialidade_id, especialidades:especialidade_id(id,nome)")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true);
      const map = new Map<string, Especialidade>();
      const meds: Medico[] = [];
      for (const row of (rows ?? []) as any[]) {
        if (row.especialidades?.id) map.set(row.especialidades.id, { id: row.especialidades.id, nome: row.especialidades.nome });
        meds.push({ id: row.id, nome: row.nome, especialidade_id: row.especialidade_id ?? null });
      }
      setEspecialidades(Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome)));
      setMedicos(meds.sort((a, b) => a.nome.localeCompare(b.nome)));
    })();
  }, [clinicaId]);

  const medicosFiltrados = useMemo(
    () => (especialidadeId ? medicos.filter((m) => m.especialidade_id === especialidadeId) : medicos),
    [medicos, especialidadeId],
  );

  // Horários disponíveis
  useEffect(() => {
    if (!clinicaId) return;
    let cancelado = false;
    setCarregando(true);
    setSlot(null);
    (async () => {
      const { data: rows, error } = await supabase.rpc("get_horarios_disponiveis", {
        _clinica_id: clinicaId,
        _especialidade_id: especialidadeId || undefined,
        _medico_id: medicoId || undefined,
        _dias: 30,
        _limite: 400,
      });
      if (cancelado) return;
      if (error) mostrarErro(error);
      setSlots(((rows ?? []) as Slot[]));
      setCarregando(false);
    })();
    return () => { cancelado = true; };
  }, [clinicaId, especialidadeId, medicoId]);

  const alvo = ymd(data);
  const slotsDoDia = useMemo(
    () => slots.filter((s) => ymd(new Date(s.inicio)) === alvo).sort((a, b) => a.inicio.localeCompare(b.inicio)),
    [slots, alvo],
  );
  const diasComVaga = useMemo(() => new Set(slots.map((s) => ymd(new Date(s.inicio)))), [slots]);

  const termoNorm = busca.trim().toLowerCase();
  const slotsFiltrados = useMemo(() => {
    if (!termoNorm) return slotsDoDia;
    return slotsDoDia.filter((s) =>
      [hhmm(s.inicio), s.medico_nome, s.especialidade_nome ?? "", s.agenda_nome ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(termoNorm),
    );
  }, [slotsDoDia, termoNorm]);

  const podeConfirmar = !!clinicaId && !!paciente && !!slot && !confirmando;

  async function confirmar() {
    if (!clinicaId || !paciente || !slot) return;
    setConfirmando(true);
    try {
      const { error } = await supabase.from("agendamentos").insert({
        clinica_id: clinicaId,
        paciente_id: paciente.id,
        paciente_nome: paciente.nome,
        medico_id: slot.medico_id,
        agenda_id: slot.agenda_id ?? undefined,
        inicio: slot.inicio,
        fim: slot.fim,
        tipo_atendimento: "particular",
        status: "agendado",
      });
      if (error) throw error;
      toast.success("Agendamento confirmado!");
      navigate({ to: "/app/agenda" });
    } catch (e) {
      mostrarErro(e);
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" /> Agenda Express
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Agendamento rápido e simplificado.</p>
          </div>
          <Button variant="outline" asChild className="h-10 rounded-lg">
            <Link to="/app/agenda">Agenda completa</Link>
          </Button>
        </header>

        {modoTodas && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Selecione uma unidade específica (não "Todas") para usar o Express.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Coluna esquerda — formulário */}
          <div className={cn(CARD, "p-6 lg:col-span-5 h-fit space-y-5")}>
            <div>
              <label className={LABEL}>Paciente</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10 pointer-events-none" />
                <div className="[&_input]:h-10 [&_input]:rounded-lg [&_input]:pl-9 [&_input]:outline-none [&_input:focus-visible]:ring-2 [&_input:focus-visible]:ring-primary/20 [&_input:focus-visible]:border-primary [&_input:focus-visible]:ring-offset-0">
                  <PatientSearchInput
                    autoFocus
                    clinicaIdsOverride={clinicaId ? [clinicaId] : undefined}
                    value={paciente}
                    onSelect={setPaciente}
                    placeholder="Nome, CPF ou telefone…"
                    enableVoice
                  />
                </div>
              </div>
              {paciente && (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <Badge variant="secondary" className="rounded-md">{paciente.nome}</Badge>
                  <span>{paciente.telefone ?? "sem telefone"}</span>
                </div>
              )}
            </div>

            <div>
              <label className={LABEL}>Especialidade / Serviço</label>
              <Select
                value={especialidadeId || "todas"}
                onValueChange={(v) => { setEspecialidadeId(v === "todas" ? "" : v); setMedicoId(""); }}
              >
                <SelectTrigger className="h-10 rounded-lg pl-9 relative">
                  <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as especialidades</SelectItem>
                  {especialidades.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className={LABEL}>Profissional</label>
              <Select value={medicoId || "todos"} onValueChange={(v) => setMedicoId(v === "todos" ? "" : v)}>
                <SelectTrigger className="h-10 rounded-lg pl-9 relative">
                  <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os profissionais</SelectItem>
                  {medicosFiltrados.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Resumo */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 mt-4 space-y-3">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-slate-400 shrink-0" />
                <span className="text-sm font-medium text-slate-800 capitalize">
                  {data.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-slate-400 shrink-0" />
                <span className="text-sm font-medium text-slate-800 truncate">
                  {slot ? `${hhmm(slot.inicio)} · ${slot.medico_nome}` : "Selecione um horário"}
                </span>
              </div>
            </div>
          </div>

          {/* Coluna direita — data e horários */}
          <div className={cn(CARD, "lg:col-span-7 p-3 sm:p-6 space-y-5")}>
            <div className="border-b border-slate-100 pb-4 mb-4 sm:pb-6 sm:mb-6">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Data</span>
              <div className="rounded-2xl border border-slate-200/60 bg-gradient-to-b from-slate-50/60 to-white p-2 shadow-sm sm:p-4">
                <Calendar
                  mode="single"
                  fullWidth
                  locale={ptBR}
                  selected={data}
                  onSelect={(d) => d && setData(d)}
                  modifiers={{ comVaga: (d: Date) => diasComVaga.has(ymd(d)) }}
                  modifiersClassNames={{ comVaga: "font-semibold text-primary" }}
                  className="w-full pointer-events-auto"
                />
              </div>
            </div>

            <div>
              <label className={LABEL}>Horários disponíveis</label>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value.slice(0, 60))}
                  placeholder="Filtrar por horário, especialidade ou médico..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 pl-9 text-sm shadow-sm outline-none placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                />
              </div>
              <div className="grid w-full grid-cols-1 gap-2.5 max-h-72 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                {carregando ? (
                  <div className="col-span-full flex items-center gap-2 py-8 justify-center text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Buscando horários…
                  </div>
                ) : slotsFiltrados.length === 0 ? (
                  <div className="col-span-full bg-slate-50 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-2">
                    <CalendarX className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-slate-500">
                      {termoNorm ? "Nenhum horário encontrado para essa busca" : "Nenhum horário livre nesta data."}
                    </p>
                  </div>
                ) : (
                  slotsFiltrados.map((s) => {
                    const chave = slotKey(s);
                    const ativo = slot ? slotKey(slot) === chave : false;
                    const legenda = s.especialidade_nome ?? s.medico_nome ?? s.agenda_nome ?? "";
                    return (
                      <button
                        key={chave}
                        type="button"
                        onClick={() => setSlot(s)}
                        title={`${hhmm(s.inicio)} · ${s.medico_nome}${s.agenda_nome ? ` · ${s.agenda_nome}` : ""}`}
                        className={cn(
                          "flex w-full min-w-0 flex-col items-start gap-0.5 rounded-xl border-2 px-3 py-2 text-left transition-colors",
                          ativo
                            ? "border-[#1e1b6b] bg-[#1e1b6b] text-white shadow-md"
                            : "border-slate-200 bg-slate-50 hover:border-[#1e1b6b]/40 hover:bg-white",
                        )}
                      >
                        <span className={cn("text-base font-bold tabular-nums leading-none", ativo ? "text-white" : "text-slate-900")}>
                          {hhmm(s.inicio)}
                        </span>
                        <span className={cn("w-full truncate text-[10px] font-medium leading-tight", ativo ? "text-white/75" : "text-slate-500")}>
                          {legenda}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé de ação */}
        <div className={cn(CARD, "px-4 py-3")}>
          <div className="flex items-center gap-3">
          <div className="hidden sm:block text-sm font-medium text-slate-700 flex-1 truncate">
            {paciente ? paciente.nome : "Selecione o paciente"} · {slot ? `${hhmm(slot.inicio)} — ${slot.medico_nome}` : "sem horário"}
          </div>
          <Button
            size="lg"
            disabled={!podeConfirmar}
            onClick={confirmar}
            className="w-full sm:w-auto h-11 rounded-lg shadow-md gap-2"
          >
            {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Confirmar Agendamento Express
          </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
