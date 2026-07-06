import { useState } from "react";
import {
  ChevronDown, ChevronRight, ArrowUpRight, CalendarClock, DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TIPO_SESSAO_ESTILO, TIPO_SESSAO_LABEL, type TipoSessao } from "@/lib/agenda-v2/session-detect";
import { HhpChip } from "@/design-system/hhp";

// Chips de status — tom baixo, editorial.
const STATUS_LABEL: Record<string, string> = {
  agendado: "Aguardando",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  realizado: "Realizado",
  cancelado: "Cancelado",
  faltou: "Faltou",
};
const STATUS_DOT: Record<string, string> = {
  agendado: "bg-slate-300",
  confirmado: "bg-blue-400",
  em_atendimento: "bg-indigo-500",
  realizado: "bg-emerald-500",
  cancelado: "bg-rose-400",
  faltou: "bg-rose-400",
};

export interface SessionItem {
  id: string;
  procedimento_nome: string;
  status?: string | null;
  preparo?: string | null;
}

export interface SessionCardData {
  pacote_id: string;
  paciente_nome: string;
  paciente_id: string | null;
  paciente_avatar_url?: string | null;
  medico_id?: string | null;
  recurso_id?: string | null;
  medico_nome: string | null;
  recurso_nome: string | null;
  inicio: string;
  fim: string;
  tipo: TipoSessao;
  status: string;
  is_encaixe?: boolean;
  confirmado?: boolean;
  checkin?: boolean;
  pago?: boolean;
  items: SessionItem[];
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Barra de jornada — 4 segmentos discretos: Confirmado · Check-in · Pago · Atendimento.
 */
function JourneyBar({
  steps,
  current,
}: {
  steps: ReadonlyArray<{ label: string; done: boolean }>;
  current: boolean;
}) {
  let lastDone = -1;
  for (let i = 0; i < steps.length; i++) if (steps[i].done) lastDone = i;
  return (
    <div className="w-full">
      <div className="flex items-center gap-1 h-[3px]">
        {steps.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "flex-1 rounded-full transition-all",
              s.done
                ? current && i === lastDone
                  ? "bg-indigo-500"
                  : "bg-emerald-400/80"
                : "bg-slate-200/60",
            )}
            title={s.label}
          />
        ))}
      </div>
    </div>
  );
}

export type SessionDensity = "confortavel" | "compacto" | "foco";

/**
 * Card rev.3 — paciente dominante, editorial calm:
 * - foto grande à esquerda (56-64px)
 * - nome em Inter Tight 600, dominante
 * - hora tabular, secundária
 * - procedimento + médico/sala em linha discreta
 * - barra de jornada 4 segmentos
 * - status como dot + texto slate
 */
export function SessionCard({
  data,
  onOpenTimeline,
  density = "confortavel",
}: {
  data: SessionCardData;
  onOpenTimeline: (pacoteId: string) => void;
  density?: SessionDensity;
}) {
  const [open, setOpen] = useState(false);
  const multi = data.items.length > 1;
  const isLab = data.tipo === "coleta_laboratorial";
  const est = TIPO_SESSAO_ESTILO[data.tipo];
  const isCurrent = data.status === "em_atendimento";

  const titulo = isLab
    ? `${data.items.length} ${data.items.length === 1 ? "exame" : "exames"} · coleta única`
    : data.items[0]?.procedimento_nome ?? TIPO_SESSAO_LABEL[data.tipo];

  // Densidades:
  // confortavel: card alto ~ 96px, foto 56, nome 20
  // compacto:    mesma lógica, ~64px, foto 40, nome 15
  // foco:        112px, foto 72, nome 24
  const dim = density === "compacto"
    ? { padY: "py-3", padX: "px-4", photo: 40, name: "text-[15px]", time: "text-[13px]", gap: "gap-3", radius: "rounded-2xl" }
    : density === "foco"
    ? { padY: "py-5", padX: "px-6", photo: 72, name: "text-2xl", time: "text-[16px]", gap: "gap-5", radius: "rounded-3xl" }
    : { padY: "py-4", padX: "px-5", photo: 56, name: "text-xl", time: "text-[14px]", gap: "gap-4", radius: "rounded-2xl" };

  return (
    <div
      className={cn(
        "group relative bg-white border border-slate-200/70 transition-all",
        "hover:border-slate-300 hover:shadow-[0_4px_20px_-8px_rgba(15,23,42,0.08)]",
        dim.radius, dim.padY, dim.padX,
        isCurrent && "ring-1 ring-indigo-300/70 shadow-[0_0_0_4px_rgba(99,102,241,0.06)]",
      )}
    >
      <div className={cn("flex items-center", dim.gap)}>
        {/* Foto do paciente — protagonista */}
        <button
          type="button"
          onClick={() => onOpenTimeline(data.pacote_id)}
          className="shrink-0 relative"
          aria-label={`Abrir ${data.paciente_nome}`}
        >
          <Avatar
            className="border border-slate-200/70 shadow-sm"
            style={{ width: dim.photo, height: dim.photo }}
          >
            {data.paciente_avatar_url && (
              <AvatarImage src={data.paciente_avatar_url} alt={data.paciente_nome} />
            )}
            <AvatarFallback
              className="font-semibold text-slate-500 bg-slate-50"
              style={{ fontSize: dim.photo > 60 ? 20 : 14 }}
            >
              {initials(data.paciente_nome)}
            </AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white",
              STATUS_DOT[data.status] ?? STATUS_DOT.agendado,
            )}
            aria-hidden
          />
        </button>

        {/* Corpo */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <button
              type="button"
              className={cn(
                "block max-w-full truncate text-left font-semibold text-slate-900 hover:text-slate-700",
                dim.name,
              )}
              style={{ fontFamily: "'Inter Tight', Inter, sans-serif", letterSpacing: "-0.01em" }}
              onClick={() => onOpenTimeline(data.pacote_id)}
            >
              {data.paciente_nome}
            </button>
            <div className={cn("shrink-0 tabular-nums text-slate-500 font-medium", dim.time)}>
              {fmt(data.inicio)}
              {data.fim && data.fim !== data.inicio ? (
                <span className="text-slate-300"> – {fmt(data.fim)}</span>
              ) : null}
            </div>
          </div>

          <div className="mt-1 flex items-center gap-2 min-w-0">
            <span
              className="h-1 w-1 rounded-full shrink-0"
              style={{ background: est.accent }}
              aria-hidden
            />
            <span className="text-xs text-slate-500 truncate">{titulo}</span>
            {data.medico_nome && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-500 truncate">{data.medico_nome}</span>
              </>
            )}
            {data.recurso_nome && density !== "compacto" && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-500 truncate">{data.recurso_nome}</span>
              </>
            )}
            {data.is_encaixe && (
              <HhpChip tone="warn" variant="outline" size="xs" radius="md" className="ml-1">
                Encaixe
              </HhpChip>
            )}
          </div>

          {density !== "compacto" && (
            <div className="mt-3">
              <JourneyBar
                current={isCurrent}
                steps={[
                  { label: "Confirmado", done: !!data.confirmado || (data.status !== "agendado" && data.status !== "cancelado" && data.status !== "faltou") },
                  { label: "Check-in", done: !!data.checkin || data.status === "em_atendimento" || data.status === "realizado" },
                  { label: "Pago", done: !!data.pago },
                  { label: "Atendimento", done: data.status === "em_atendimento" || data.status === "realizado" },
                ]}
              />
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                <span className="uppercase tracking-wider">
                  {STATUS_LABEL[data.status] ?? data.status.replace(/_/g, " ")}
                </span>
                {multi && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
                    className="inline-flex items-center gap-0.5 hover:text-slate-700"
                    aria-expanded={open}
                  >
                    {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {open ? "recolher" : `+${data.items.length} exames`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hover reveal — Abrir · Reagendar · Pagar (visual, Fase B) */}
      {density !== "compacto" && (
        <div
          className={cn(
            "absolute top-2 right-2 flex items-center gap-1",
            "opacity-0 translate-y-[-2px] pointer-events-none",
            "group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto",
            "focus-within:opacity-100 focus-within:pointer-events-auto",
            "transition-all duration-150",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <QuickAction
            icon={<ArrowUpRight className="h-3 w-3" />}
            label="Abrir"
            onClick={() => onOpenTimeline(data.pacote_id)}
          />
          <QuickAction
            icon={<CalendarClock className="h-3 w-3" />}
            label="Reagendar"
            onClick={() =>
              toast.info("Reagendar", {
                description: "Fluxo será conectado na Fase E (wizard).",
              })
            }
          />
          <QuickAction
            icon={<DollarSign className="h-3 w-3" />}
            label="Pagar"
            onClick={() =>
              toast.info("Pagar", {
                description: "Abre o Caixa clássico na Fase E.",
              })
            }
          />
        </div>
      )}

      {multi && open && density !== "compacto" && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3" style={{ paddingLeft: dim.photo + 16 }}>
          {data.items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 text-xs text-slate-500">
              <span className="text-slate-300">›</span>
              <span className="truncate">{it.procedimento_nome}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickAction({
  icon, label, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 h-7 px-2 rounded-lg",
        "bg-white/95 backdrop-blur-sm border border-slate-200/70 shadow-sm",
        "text-[11px] font-medium text-slate-600",
        "hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors",
      )}
      aria-label={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}