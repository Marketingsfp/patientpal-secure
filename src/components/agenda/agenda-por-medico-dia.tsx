import { useMemo } from "react";
import { Stethoscope, UserRound, Clock } from "lucide-react";

export type AgendaMedicoColuna = { id: string; nome: string; especialidade_nome?: string | null };

export type AgendaMedicoItem = {
  id: string;
  paciente_nome: string;
  medico_id: string | null;
  inicio: string;
  fim: string;
  procedimento: string | null;
  status: string;
  livre?: boolean;
};

const STATUS_BADGE: Record<string, string> = {
  agendado: "bg-indigo-50 text-indigo-700",
  confirmado: "bg-emerald-50 text-emerald-700",
  realizado: "bg-green-50 text-green-700",
  cancelado: "bg-rose-50 text-rose-700",
  faltou: "bg-amber-50 text-amber-700",
};

const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

const iniciais = (nome: string) =>
  nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("")
    .toUpperCase();

/**
 * Visão "Por médico": uma coluna por profissional na data escolhida.
 * Componente dinâmico e reutilizável — recebe a lista de profissionais e os
 * agendamentos já filtrados pela clínica/data ativa.
 */
export function AgendaPorMedicoDia({
  dataRef,
  medicos,
  items,
  fmtHora,
  onAgClick,
  onSlotClick,
  ocultarPaciente = false,
  mostrarResumo = true,
  somenteLeitura = false,
}: {
  dataRef: string;
  medicos: AgendaMedicoColuna[];
  items: AgendaMedicoItem[];
  fmtHora: (iso: string) => string;
  onAgClick: (a: AgendaMedicoItem) => void;
  onSlotClick: (a: AgendaMedicoItem) => void;
  ocultarPaciente?: boolean;
  mostrarResumo?: boolean;
  /** Modo leitura: sem "+ Agendar" e sem clique em horários livres. */
  somenteLeitura?: boolean;
}) {
  const porMedico = useMemo(() => {
    const map = new Map<string, AgendaMedicoItem[]>();
    for (const a of items) {
      const k = a.medico_id ?? "sem-medico";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    for (const arr of map.values()) arr.sort((x, y) => x.inicio.localeCompare(y.inicio));
    return map;
  }, [items]);

  const colunas = useMemo(() => {
    const base = medicos.filter((m) => (porMedico.get(m.id)?.length ?? 0) > 0);
    const lista = base.length > 0 ? base : medicos;
    return lista.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [medicos, porMedico]);

  const dataLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "UTC",
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(new Date(`${dataRef}T00:00:00Z`));
    } catch {
      return dataRef;
    }
  }, [dataRef]);

  if (colunas.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        Nenhum profissional com agenda nesta data.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mostrarResumo && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
            {dataLabel}
          </span>
          <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
            {colunas.length} profissiona{colunas.length === 1 ? "l" : "is"}
          </span>
        </div>
      )}

      <div className="w-full max-w-full overflow-x-hidden pb-10">
        <div className="grid w-full max-w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {colunas.map((m) => {
            const ags = porMedico.get(m.id) ?? [];
            const ocupados = ags.filter((a) => !a.livre);
            const livres = ags.filter((a) => a.livre);
            return (
              <section
                key={m.id}
                className="flex w-full min-w-0 flex-col rounded-xl border border-slate-200/80 bg-white shadow-xs"
              >
                <header className="flex items-center gap-2.5 rounded-t-xl border-b-2 border-b-indigo-500 bg-white p-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                    {iniciais(m.nome)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900">{m.nome}</p>
                    <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {m.especialidade_nome || "Profissional"}
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                    <span className="text-emerald-700">{livres.length} livres</span>
                    <span className="mx-1 text-slate-300">·</span>
                    <span className="text-indigo-700">{ocupados.length} agend.</span>
                  </span>
                </header>

                <div className="scrollbar-thin max-h-96 w-full min-w-0 flex-1 space-y-1.5 overflow-x-hidden overflow-y-auto p-2">
                  {ags.length === 0 && (
                    <p className="px-2 py-6 text-center text-[11px] text-slate-400">Sem horários</p>
                  )}
                  {ags.map((a) => {
                    const livre = !!a.livre;
                    const leituraLivre = livre && somenteLeitura;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={leituraLivre}
                        onClick={() => {
                          if (leituraLivre) return;
                          if (livre) onSlotClick(a);
                          else onAgClick(a);
                        }}
                        className={
                          livre
                            ? leituraLivre
                              ? "flex w-full min-w-0 flex-col rounded-lg border border-dashed border-emerald-200 bg-emerald-50/50 p-2 text-center"
                              : "flex w-full min-w-0 cursor-pointer flex-col rounded-lg border border-dashed border-slate-200/60 bg-slate-50/50 p-2 text-center transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
                            : "flex w-full min-w-0 flex-col rounded-lg border border-slate-200/80 border-l-4 border-l-indigo-600 bg-white p-2.5 text-left shadow-xs transition-colors hover:bg-slate-50"
                        }
                      >
                        {livre ? (
                          <>
                            <p
                              className={
                                somenteLeitura
                                  ? "text-[11px] font-semibold text-emerald-900"
                                  : "text-[11px] font-medium text-slate-400"
                              }
                            >
                              {fmtHora(a.inicio)} – {fmtHora(a.fim)}
                            </p>
                            <p
                              className={
                                somenteLeitura
                                  ? "text-[10px] font-semibold text-emerald-700"
                                  : "text-[10px] font-semibold text-slate-400"
                              }
                            >
                              {somenteLeitura ? "Livre" : "+ Agendar"}
                            </p>
                          </>
                        ) : (
                          <>
                            <div className="flex min-w-0 items-center justify-between gap-1 text-xs font-bold text-slate-800">
                              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                                <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                                {fmtHora(a.inicio)}
                                <span className="text-slate-300">–</span>
                                {fmtHora(a.fim)}
                              </span>
                              <span
                                className={`shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                  STATUS_BADGE[a.status] ?? "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {STATUS_LABEL[a.status] ?? a.status}
                              </span>
                            </div>
                            <p className="mt-1 block max-w-full truncate text-xs font-bold uppercase tracking-tight text-slate-900">
                              {ocultarPaciente ? (
                                "—"
                              ) : (
                                <span className="flex min-w-0 items-center gap-1">
                                  <UserRound className="h-3 w-3 shrink-0 text-slate-400" />
                                  <span className="truncate">{a.paciente_nome}</span>
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 flex min-w-0 max-w-full items-center gap-1 text-[11px] font-medium text-slate-500">
                              <Stethoscope className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="truncate">{a.procedimento || "Consulta"}</span>
                            </p>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>

                <footer className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
                  {livres.length} livre{livres.length === 1 ? "" : "s"} · {ocupados.length} agendado
                  {ocupados.length === 1 ? "" : "s"}
                </footer>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
