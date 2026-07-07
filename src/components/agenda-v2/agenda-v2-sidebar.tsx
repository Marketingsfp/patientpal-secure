import { useMemo } from "react";
import { Clock, Sun, Moon, Sunrise, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIPO_SESSAO_ESTILO, TIPO_SESSAO_LABEL, type TipoSessao } from "@/lib/agenda-v2/session-detect";
import type { SessionCardData } from "./session-card";

interface RecursoOcup {
  id: string;
  nome: string;
  usados: number;
  total: number;
}

interface Props {
  clinicaNome: string;
  dia: Date;
  sessoes: SessionCardData[];
  recursos: RecursoOcup[];
  equipeOnline: { id: string; nome: string }[];
}

function turnoInfo(d: Date) {
  const h = d.getHours();
  if (h < 12) return { label: "Manhã", Icon: Sunrise, tone: "text-amber-500" };
  if (h < 18) return { label: "Tarde", Icon: Sun, tone: "text-orange-500" };
  return { label: "Noite", Icon: Moon, tone: "text-indigo-500" };
}

function initials(n: string) {
  return n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function AgendaV2Sidebar({ clinicaNome, dia, sessoes, recursos, equipeOnline }: Props) {
  const turno = turnoInfo(new Date());
  const TurnoIcon = turno.Icon;

  const porTipo = useMemo(() => {
    const m = new Map<TipoSessao, number>();
    for (const s of sessoes) m.set(s.tipo, (m.get(s.tipo) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [sessoes]);

  const totalRecursos = recursos.reduce((a, r) => a + r.total, 0);
  const usadosRecursos = recursos.reduce((a, r) => a + r.usados, 0);
  const ocupacao = totalRecursos > 0 ? Math.round((usadosRecursos / totalRecursos) * 100) : 0;

  const cardCls = "rounded-2xl border border-slate-200/70 bg-white/80 backdrop-blur-sm px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]";
  const labelCls = "text-[10px] font-semibold uppercase tracking-widest text-slate-400";

  return (
    <aside className="w-64 shrink-0 bg-gradient-to-b from-[#FAFBFC] to-[#F5F6F8] border-r border-slate-200/60 flex flex-col overflow-y-auto">
      {/* Header clínica — leve, sem bloco escuro */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl border flex items-center justify-center text-[11px] font-bold shadow-sm text-[color:var(--clinic-accent-strong)]"
            style={{
              background: "var(--clinic-accent-soft)",
              borderColor: "color-mix(in oklab, var(--clinic-accent) 25%, transparent)",
            }}
          >
            {initials(clinicaNome)}
          </div>
          <div className="min-w-0">
            <div
              className="text-sm font-semibold text-slate-800 truncate"
              style={{ fontFamily: "var(--hhp-font-display)", letterSpacing: "-0.01em" }}
            >
              {clinicaNome}
            </div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">
              {dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-5 space-y-3">
        {/* Card — Turno */}
        <section className={cardCls}>
          <div className="flex items-center justify-between mb-3">
            <span className={labelCls}>Turno</span>
            <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", turno.tone)}>
              <TurnoIcon className="h-3 w-3" /> {turno.label}
            </span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div
                className="text-3xl font-bold text-slate-900 tabular-nums leading-none"
                style={{ fontFamily: "var(--hhp-font-display)", letterSpacing: "-0.02em" }}
              >
                {sessoes.length}
              </div>
              <div className="text-[10px] text-slate-400 mt-1.5">sessões</div>
            </div>
            <div className="text-right">
              <div
                className="text-2xl font-bold tabular-nums leading-none"
                style={{
                  fontFamily: "var(--hhp-font-display)",
                  letterSpacing: "-0.02em",
                  color: "var(--clinic-accent-strong)",
                }}
              >
                {ocupacao}%
              </div>
              <div className="text-[10px] text-slate-400 mt-1.5">ocupação</div>
            </div>
          </div>
          <div className="mt-3 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full transition-all"
              style={{ width: `${ocupacao}%`, background: "var(--clinic-accent)" }}
            />
          </div>
        </section>

        {/* Card — Sessões por tipo */}
        <section className={cardCls}>
          <div className={cn(labelCls, "mb-3")}>Sessões</div>
          <ul className="space-y-2">
            {porTipo.length === 0 && (
              <li className="text-xs text-slate-400">Nenhuma sessão</li>
            )}
            {porTipo.map(([tipo, n]) => {
              const est = TIPO_SESSAO_ESTILO[tipo];
              return (
                <li key={tipo} className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: est.accent }} />
                    {TIPO_SESSAO_LABEL[tipo]}
                  </span>
                  <span className="tabular-nums font-semibold text-slate-700">{n}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Card — Recursos */}
        <section className={cardCls}>
          <div className={cn(labelCls, "mb-3")}>Recursos</div>
          <ul className="space-y-3">
            {recursos.length === 0 && (
              <li className="text-xs text-slate-400">Sem recursos cadastrados</li>
            )}
            {recursos.slice(0, 6).map((r) => {
              const pct = r.total > 0 ? Math.round((r.usados / r.total) * 100) : 0;
              const tone = pct >= 90 ? "bg-rose-400" : pct >= 60 ? "bg-amber-400" : "bg-emerald-400";
              return (
                <li key={r.id}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-600 truncate mr-2">{r.nome}</span>
                    <span className="tabular-nums text-slate-400 shrink-0">{r.usados}/{r.total}</span>
                  </div>
                  <div className="h-[3px] rounded-full bg-slate-100 overflow-hidden">
                    <div className={cn("h-full transition-all", tone)} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Card — Equipe on-line */}
        <section className={cardCls}>
          <div className="flex items-center justify-between mb-3">
            <span className={labelCls}>Escala do dia</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
              <Users className="h-3 w-3" /> {equipeOnline.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {equipeOnline.slice(0, 8).map((m) => (
              <div
                key={m.id}
                className="relative h-7 w-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-semibold text-slate-600 shadow-sm"
                title={m.nome}
              >
                {initials(m.nome)}
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-white"
                  style={{ background: "var(--clinic-accent)" }}
                />
              </div>
            ))}
            {equipeOnline.length > 8 && (
              <div className="h-7 w-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-semibold border border-slate-200">
                +{equipeOnline.length - 8}
              </div>
            )}
            {equipeOnline.length === 0 && (
              <div className="text-xs text-slate-400 inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> sem escala hoje
              </div>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}