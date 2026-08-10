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
  agendado: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  confirmado: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  realizado: "bg-green-50 text-green-700 ring-1 ring-green-200",
  cancelado: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  faltou: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
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
}: {
  dataRef: string;
  medicos: AgendaMedicoColuna[];
  items: AgendaMedicoItem[];
  fmtHora: (iso: string) => string;
  onAgClick: (a: AgendaMedicoItem) => void;
  onSlotClick: (a: AgendaMedicoItem) => void;
  ocultarPaciente?: boolean;
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
          {dataLabel}
        </span>
        <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
          {colunas.length} profissiona{colunas.length === 1 ? "l" : "is"}
        </span>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-full gap-3">
          {colunas.map((m) => {
            const ags = porMedico.get(m.id) ?? [];
            const ocupados = ags.filter((a) => !a.livre);
            const livres = ags.filter((a) => a.livre);
            return (
              <section
                key={m.id}
                className="flex w-[264px] shrink-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-xs"
              >
                <header className="flex items-center gap-2.5 border-b border-slate-100 px-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-[11px] font-bold text-indigo-700">
                    {iniciais(m.nome)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-900">{m.nome}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {m.especialidade_nome || "Profissional"}
                    </p>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {ocupados.length}
                  </span>
                </header>

                <div className="flex-1 space-y-1.5 overflow-y-auto p-2 max-h-[62vh]">
                  {ags.length === 0 && (
                    <p className="px-2 py-6 text-center text-[11px] text-slate-400">Sem horários</p>
                  )}
                  {ags.map((a) => {
                    const livre = !!a.livre;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => (livre ? onSlotClick(a) : onAgClick(a))}
                        className={`w-full rounded-xl border px-2.5 py-2 text-left transition-colors ${
                          livre
                            ? "border-dashed border-slate-200 bg-slate-50/60 hover:border-emerald-300 hover:bg-emerald-50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-slate-700">
                            <Clock className="h-3 w-3 text-slate-400" />
                            {fmtHora(a.inicio)}
                            <span className="text-slate-300">–</span>
                            {fmtHora(a.fim)}
                          </span>
                          {!livre && (
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                STATUS_BADGE[a.status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                              }`}
                            >
                              {STATUS_LABEL[a.status] ?? a.status}
                            </span>
                          )}
                        </div>
                        <p
                          className={`mt-1 truncate text-[12px] font-semibold ${
                            livre ? "text-emerald-700" : "text-slate-900"
                          }`}
                        >
                          {livre ? (
                            "Disponível"
                          ) : ocultarPaciente ? (
                            "—"
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <UserRound className="h-3 w-3 text-slate-400" />
                              {a.paciente_nome}
                            </span>
                          )}
                        </p>
                        {!livre && (
                          <p className="mt-0.5 inline-flex items-center gap-1 truncate text-[11px] text-slate-500">
                            <Stethoscope className="h-3 w-3 text-slate-400" />
                            {a.procedimento || "Consulta"}
                          </p>
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
