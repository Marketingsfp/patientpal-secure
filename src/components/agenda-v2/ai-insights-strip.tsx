import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarPlus,
  DoorOpen,
  ArrowRight,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionCardData } from "./session-card";

/**
 * Faixa de sugestões operacionais (Fase A: apenas visual, lê dados existentes).
 * Nenhuma regra de negócio nova. Colapsa após primeira sessão.
 */
export function AiInsightsStrip({
  sessoes,
  livresPorHora,
}: {
  sessoes: SessionCardData[];
  livresPorHora: Map<number, number>;
}) {
  const [open, setOpen] = useState(true);

  const insights = useMemo(() => {
    const now = new Date();
    const currentH = now.getHours();
    const currentMin = now.getMinutes();

    // Atrasos previstos: sessões cujo início já passou e ainda estão em "agendado"/"confirmado".
    const atrasos = sessoes.filter((s) => {
      const t = new Date(s.inicio);
      if (t.toDateString() !== now.toDateString()) return false;
      if (t.getTime() > now.getTime() - 5 * 60 * 1000) return false;
      return s.status === "agendado" || s.status === "confirmado";
    });

    // Encaixe possível: primeira hora com >= 1 slot livre a partir de agora.
    let encaixeH: number | null = null;
    for (const [h, n] of Array.from(livresPorHora.entries()).sort((a, b) => a[0] - b[0])) {
      if (h >= currentH && n > 0) {
        encaixeH = h;
        break;
      }
    }

    // Sala ociosa: recurso com 0 sessões no dia mas outras têm.
    const usoRecursos = new Map<string, number>();
    const nomesRecursos = new Map<string, string>();
    for (const s of sessoes) {
      if (s.recurso_id && s.recurso_nome) {
        usoRecursos.set(s.recurso_id, (usoRecursos.get(s.recurso_id) ?? 0) + 1);
        nomesRecursos.set(s.recurso_id, s.recurso_nome);
      }
    }
    const salaOciosa =
      Array.from(nomesRecursos.entries()).find(([id]) => (usoRecursos.get(id) ?? 0) <= 1)?.[1] ??
      null;

    // Próximo atendimento após "agora".
    const proximo = sessoes.find((s) => {
      const t = new Date(s.inicio);
      return t.toDateString() === now.toDateString() && t.getTime() > now.getTime();
    });

    return { atrasos, encaixeH, salaOciosa, proximo, currentMin };
  }, [sessoes, livresPorHora]);

  const chips: Array<{
    key: string;
    icon: React.ElementType;
    tone: string;
    label: string;
    detail: string;
  }> = [];

  if (insights.atrasos.length > 0) {
    chips.push({
      key: "atrasos",
      icon: AlertTriangle,
      tone: "text-amber-700 bg-amber-50/70 border-amber-200/70",
      label: `${insights.atrasos.length} atraso${insights.atrasos.length > 1 ? "s" : ""} previsto${insights.atrasos.length > 1 ? "s" : ""}`,
      detail: insights.atrasos
        .slice(0, 2)
        .map((a) => a.paciente_nome.split(" ")[0])
        .join(", "),
    });
  }
  if (insights.encaixeH !== null) {
    chips.push({
      key: "encaixe",
      icon: CalendarPlus,
      tone: "text-indigo-700 bg-indigo-50/70 border-indigo-200/70",
      label: "Encaixe possível",
      detail: `${String(insights.encaixeH).padStart(2, "0")}:00 disponível`,
    });
  }
  if (insights.salaOciosa) {
    chips.push({
      key: "ociosa",
      icon: DoorOpen,
      tone: "text-slate-700 bg-slate-50 border-slate-200",
      label: "Sala ociosa",
      detail: insights.salaOciosa,
    });
  }
  if (insights.proximo) {
    const t = new Date(insights.proximo.inicio);
    const mins = Math.round((t.getTime() - Date.now()) / 60000);
    chips.push({
      key: "proximo",
      icon: ArrowRight,
      tone: "text-emerald-700 bg-emerald-50/70 border-emerald-200/70",
      label: "Próximo atendimento",
      detail: `${insights.proximo.paciente_nome.split(" ").slice(0, 2).join(" ")} · em ${mins}min`,
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="px-6 pt-3">
      <div
        className="rounded-2xl border bg-white/80 backdrop-blur-sm shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
        style={{
          borderColor: "color-mix(in oklab, var(--clinic-accent) 14%, transparent)",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
          aria-expanded={open}
        >
          <span
            aria-hidden
            className="inline-flex h-5 w-5 items-center justify-center rounded-md"
            style={{
              background: "var(--clinic-accent-soft)",
              color: "var(--clinic-accent-strong)",
            }}
          >
            <Sparkles className="h-3 w-3" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Sugestões da IA
          </span>
          <span className="text-[11px] text-slate-400">· {chips.length}</span>
          <span className="ml-auto text-slate-400">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        </button>
        {open && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {chips.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.key}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs",
                    c.tone,
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-semibold">{c.label}</span>
                  <span className="opacity-70">·</span>
                  <span className="opacity-80 truncate max-w-[220px]">{c.detail}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
