import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { janelaDiaClinica, hojeBR } from "@/lib/date-utils";
import {
  AgendaPorMedicoDia,
  type AgendaMedicoItem,
} from "@/components/agenda/agenda-por-medico-dia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInputBR } from "@/components/ui/date-input-br";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Columns3, Loader2, Search, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/agenda-medicos")({
  component: AgendaMedicosPage,
  head: () => ({
    meta: [
      { title: "Escala e Horários — disponibilidade por profissional" },
      {
        name: "description",
        content:
          "Visualização rápida de disponibilidade para consultas, médicos e exames, em colunas por profissional.",
      },
      { property: "og:title", content: "Escala e Horários — disponibilidade por profissional" },
      {
        property: "og:description",
        content:
          "Grade somente leitura com horários livres e ocupados por profissional e sala de exame.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Status = "agendado" | "confirmado" | "realizado" | "cancelado" | "faltou";

const STATUS_OPCOES: ReadonlyArray<{ value: Status; label: string }> = [
  { value: "agendado", label: "Aguardando" },
  { value: "confirmado", label: "Confirmado" },
  { value: "realizado", label: "Atendido" },
  { value: "faltou", label: "Falta" },
  { value: "cancelado", label: "Cancelado" },
];

type MedicoRow = { id: string; nome: string; especialidade_id: string | null };
type AgRow = {
  id: string;
  paciente_nome: string | null;
  medico_id: string | null;
  inicio: string;
  fim: string;
  procedimento: string | null;
  status: Status;
};

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const isSlotLivre = (nome: string | null | undefined) => {
  const n = normalizar(nome ?? "");
  return n === "disponivel" || n === "bloqueio";
};

const fmtHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const somaDias = (data: string, dias: number) => {
  const [y, m, d] = data.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
};

const EXAME_KEYS = [
  "eletrocardiograma",
  "eletroencefalograma",
  "ecocardiograma",
  "ultrassom",
  "ultrassonografia",
  "raio",
  "raio-x",
  "rx",
  "tomografia",
  "ressonancia",
  "laboratorio",
  "exame",
  "eeg",
  "ecg",
  "endoscopia",
  "colonoscopia",
  "densitometria",
  "mamografia",
  "holter",
  "mapa",
  "espirometria",
  "teste ergometrico",
];

/** Heurística: especialidades de exame representam "salas", não consultas. */
const isSalaExame = (especialidade: string | null | undefined, nome?: string) => {
  const alvo = `${normalizar(especialidade ?? "")} ${normalizar(nome ?? "")}`;
  return EXAME_KEYS.some((k) => alvo.includes(k));
};

function AgendaMedicosPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("agenda");
  const navigate = useNavigate();

  const [dataRef, setDataRef] = useState(() => hojeBR());
  const [busca, setBusca] = useState("");
  const [medicoFiltro, setMedicoFiltro] = useState<string>("todos");
  const [espFiltro, setEspFiltro] = useState<string>("todas");
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "consultas" | "exames">("todos");
  const [loading, setLoading] = useState(false);
  const [medicos, setMedicos] = useState<
    Array<{ id: string; nome: string; especialidade_nome: string | null }>
  >([]);
  const [ags, setAgs] = useState<AgRow[]>([]);
  const [detalhe, setDetalhe] = useState<AgRow | null>(null);
  const [salvando, setSalvando] = useState(false);

  const clinicaId = clinicaAtual?.clinica_id ?? null;

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setLoading(true);
    const { inicio, fimExclusivo } = janelaDiaClinica(dataRef);
    const [medRes, espRes, agRes] = await Promise.all([
      supabase
        .from("medicos")
        .select("id,nome,especialidade_id")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .order("nome"),
      supabase.from("especialidades").select("id,nome"),
      supabase
        .from("agendamentos")
        .select("id,paciente_nome,medico_id,inicio,fim,procedimento,status")
        .eq("clinica_id", clinicaId)
        .gte("inicio", inicio)
        .lt("inicio", fimExclusivo)
        .order("inicio", { ascending: true }),
    ]);
    const espMap = new Map<string, string>(
      ((espRes.data ?? []) as Array<{ id: string; nome: string }>).map((e) => [e.id, e.nome]),
    );
    setMedicos(
      ((medRes.data ?? []) as MedicoRow[]).map((m) => ({
        id: m.id,
        nome: m.nome,
        especialidade_nome: m.especialidade_id ? (espMap.get(m.especialidade_id) ?? null) : null,
      })),
    );
    setAgs((agRes.data ?? []) as AgRow[]);
    setLoading(false);
  }, [clinicaId, dataRef]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const medicosFiltrados = useMemo(() => {
    const q = normalizar(busca);
    return medicos.filter((m) => {
      if (medicoFiltro !== "todos" && m.id !== medicoFiltro) return false;
      if (espFiltro !== "todas" && (m.especialidade_nome ?? "—") !== espFiltro) return false;
      const sala = isSalaExame(m.especialidade_nome, m.nome);
      if (tipoFiltro === "consultas" && sala) return false;
      if (tipoFiltro === "exames" && !sala) return false;
      if (!q) return true;
      return normalizar(m.nome).includes(q) || normalizar(m.especialidade_nome ?? "").includes(q);
    });
  }, [medicos, busca, medicoFiltro, espFiltro, tipoFiltro]);

  const especialidadesOpcoes = useMemo(() => {
    const set = new Set<string>();
    for (const m of medicos) if (m.especialidade_nome) set.add(m.especialidade_nome);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [medicos]);

  const items: AgendaMedicoItem[] = useMemo(() => {
    const ids = new Set(medicosFiltrados.map((m) => m.id));
    return ags
      .filter((a) => a.medico_id && ids.has(a.medico_id))
      .map((a) => ({
        id: a.id,
        paciente_nome: a.paciente_nome ?? "—",
        medico_id: a.medico_id,
        inicio: a.inicio,
        fim: a.fim,
        procedimento: a.procedimento,
        status: a.status,
        livre: isSlotLivre(a.paciente_nome),
      }));
  }, [ags, medicosFiltrados]);

  const totalAgendados = items.filter((i) => !i.livre).length;

  const alterarStatus = async (novo: Status) => {
    if (!detalhe) return;
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição na Agenda.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase
      .from("agendamentos")
      .update({ status: novo })
      .eq("id", detalhe.id);
    setSalvando(false);
    if (error) {
      toast.error("Não foi possível alterar o status.");
      return;
    }
    setAgs((prev) => prev.map((a) => (a.id === detalhe.id ? { ...a, status: novo } : a)));
    setDetalhe((d) => (d ? { ...d, status: novo } : d));
    toast.success("Status atualizado.");
  };

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto w-full max-w-[1600px] space-y-4 overflow-x-hidden p-4 sm:p-6">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Columns3 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900">Escala e Horários</h1>
              <p className="text-xs text-slate-500">
                Visualização rápida de disponibilidade para consultas, médicos e exames
              </p>
            </div>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {totalAgendados} agendamento{totalAgendados === 1 ? "" : "s"}
            </span>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {medicosFiltrados.length} profissiona{medicosFiltrados.length === 1 ? "l" : "is"}
            </span>
            <span className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                Horários livres
              </span>
              <span className="text-slate-300">|</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-600" aria-hidden />
                Ocupados
              </span>
            </span>
          </div>

          <div className="mt-3 flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
            <div className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold">
              <button
                type="button"
                aria-label="Dia anterior"
                className="grid h-7 w-7 place-items-center rounded-md text-slate-600 hover:bg-white"
                onClick={() => setDataRef((d) => somaDias(d, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
                onClick={() => setDataRef(hojeBR())}
              >
                Hoje
              </button>
              <button
                type="button"
                aria-label="Próximo dia"
                className="grid h-7 w-7 place-items-center rounded-md text-slate-600 hover:bg-white"
                onClick={() => setDataRef((d) => somaDias(d, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <DateInputBR
                value={dataRef}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setDataRef(v);
                }}
                className="h-7 w-[130px] border-0 bg-transparent px-1 text-xs font-semibold shadow-none focus-visible:ring-0"
              />
            </div>

            <Select value={medicoFiltro} onValueChange={setMedicoFiltro}>
              <SelectTrigger className="h-9 w-[200px] rounded-lg border-slate-200 bg-white text-xs">
                <SelectValue placeholder="Todos os médicos" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="todos">Todos os médicos</SelectItem>
                {medicos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={espFiltro} onValueChange={setEspFiltro}>
              <SelectTrigger className="h-9 w-[200px] rounded-lg border-slate-200 bg-white text-xs">
                <SelectValue placeholder="Todas as especialidades" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="todas">Todas as especialidades</SelectItem>
                {especialidadesOpcoes.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as typeof tipoFiltro)}>
              <SelectTrigger className="h-9 w-[180px] rounded-lg border-slate-200 bg-white text-xs">
                <SelectValue placeholder="Salas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as salas</SelectItem>
                <SelectItem value="consultas">Consultas</SelectItem>
                <SelectItem value="exames">Salas de exame</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative w-full max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar médico, exame ou especialidade…"
                className="h-9 w-full rounded-lg border-slate-200 bg-white pl-9 text-xs"
              />
            </div>

            <button
              type="button"
              onClick={() => void carregar()}
              disabled={loading}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Atualizar
            </button>
          </div>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center text-sm text-slate-500">
            Carregando agenda…
          </div>
        ) : (
          <AgendaPorMedicoDia
            dataRef={dataRef}
            medicos={medicosFiltrados}
            items={items}
            fmtHora={fmtHora}
            mostrarResumo={false}
            somenteLeitura
            onAgClick={(a) => {
              const orig = ags.find((x) => x.id === a.id);
              if (orig) setDetalhe(orig);
            }}
            onSlotClick={() => {}}
          />
        )}
      </div>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{detalhe?.paciente_nome ?? "Agendamento"}</DialogTitle>
            <DialogDescription>
              {detalhe
                ? `${fmtHora(detalhe.inicio)} – ${fmtHora(detalhe.fim)} · ${detalhe.procedimento || "Consulta"}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Alterar status
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPCOES.map((s) => (
                <Button
                  key={s.value}
                  size="sm"
                  variant={detalhe?.status === s.value ? "default" : "outline"}
                  disabled={salvando || !podeEscrever}
                  onClick={() => void alterarStatus(s.value)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => navigate({ to: "/app/checkin" })}>
              Ir para Check-in
            </Button>
            <Button onClick={() => navigate({ to: "/app/agenda" })}>Abrir na Agenda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
