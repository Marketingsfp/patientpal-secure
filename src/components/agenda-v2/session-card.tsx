import { useState } from "react";
import {
  ChevronDown, ChevronRight, Clock, User, MapPin,
  Stethoscope, TestTube, ScanLine, HeartPulse, Activity, Scissors, ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TIPO_SESSAO_ESTILO, TIPO_SESSAO_LABEL, type TipoSessao } from "@/lib/agenda-v2/session-detect";

const TIPO_ICON: Record<TipoSessao, LucideIcon> = {
  consulta: Stethoscope,
  coleta_laboratorial: TestTube,
  imagem: ScanLine,
  cardiologica: HeartPulse,
  endoscopia: Activity,
  cirurgia: Scissors,
  procedimento_ambulatorial: ClipboardList,
};

// Chips de status — sólidos, alto contraste, pouca decoração.
const STATUS_STYLE: Record<string, string> = {
  agendado: "bg-slate-100 text-slate-600",
  confirmado: "bg-blue-100 text-blue-700",
  em_atendimento: "bg-indigo-100 text-indigo-700",
  realizado: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-rose-100 text-rose-700",
  faltou: "bg-rose-100 text-rose-700",
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
 * Barra de progresso "vitrine": 4 segmentos (Confirmado · Check-in · Pago · Atendimento).
 * Segmentos ativos ganham cor sólida + halo suave; o mais recente pulsa levemente.
 */
function ProgressTrack({
  steps,
  current,
}: {
  steps: ReadonlyArray<{ label: string; done: boolean }>;
  current: boolean;
}) {
  const activeIdx = steps.reduce((acc, s, i) => (s.done ? i : acc), -1);
  const color = current ? "bg-indigo-500" : "bg-emerald-500";
  const glow = current ? "shadow-[0_0_10px_rgba(99,102,241,0.45)]" : "shadow-[0_0_8px_rgba(16,185,129,0.35)]";
  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5 h-1.5">
        {steps.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "flex-1 rounded-full transition-all",
              s.done ? cn(color, glow) : "bg-slate-200/70",
              current && i === activeIdx && "animate-pulse",
            )}
            title={s.label}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[9px] font-bold uppercase tracking-wider">
        {steps.map((s, i) => (
          <span
            key={s.label}
            className={cn(
              "transition-colors",
              s.done ? (current && i === activeIdx ? "text-indigo-600" : "text-emerald-600") : "text-slate-300",
            )}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export type SessionDensity = "confortavel" | "compacto";

/**
 * Card no visual "Calendário Premium":
 * - card pastel por tipo, cantos generosos (rounded-3xl), muito respiro
 * - tile de ícone colorido sólido com sombra suave (identidade forte do tipo)
 * - nome do paciente em negrito grande, procedimento na cor do tipo
 * - status como pílula superior direita, metadados como linha inferior
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
  const Icon = TIPO_ICON[data.tipo];
  const compact = density === "compacto";
  const isCurrent = data.status === "em_atendimento";

  const titulo = isLab
    ? `${data.items.length} ${data.items.length === 1 ? "exame" : "exames"} · coleta única`
    : data.items[0]?.procedimento_nome ?? TIPO_SESSAO_LABEL[data.tipo];

  const statusStyle = STATUS_STYLE[data.status] ?? STATUS_STYLE.agendado;

  return (
    <div
      className={cn(
        "group relative border transition-all",
        "hover:shadow-lg hover:-translate-y-[1px] hover:border-slate-200",
        est.cardBg,
        compact ? "rounded-2xl p-3" : "rounded-3xl p-5",
        isCurrent && "ring-2 ring-indigo-400/60 shadow-md shadow-indigo-100/60 animate-fade-in",
      )}
    >
      {isCurrent && (
        <span className="absolute -top-2 left-5 inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          Em atendimento agora
        </span>
      )}
      <div className={cn("flex items-start", compact ? "gap-3" : "gap-4")}>
        {/* Tile do ícone — identidade forte do tipo */}
        <div
          className={cn(
            "flex items-center justify-center shrink-0",
            est.iconWrap,
            compact ? "h-10 w-10 rounded-xl" : "h-12 w-12 rounded-2xl",
            "transition-transform group-hover:scale-105",
          )}
        >
          <Icon className={cn(est.iconColor, compact ? "h-4 w-4" : "h-5 w-5")} strokeWidth={2} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                {!compact && (
                  <Avatar className="h-6 w-6 shrink-0 border border-white shadow-sm">
                    {data.paciente_avatar_url && (
                      <AvatarImage src={data.paciente_avatar_url} alt={data.paciente_nome} />
                    )}
                    <AvatarFallback className="text-[10px] font-semibold text-slate-500 bg-slate-100">
                      {initials(data.paciente_nome)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <button
                  type="button"
                  className={cn(
                    "block max-w-full truncate text-left font-bold text-slate-800 hover:underline",
                    compact ? "text-sm" : "text-lg leading-tight",
                  )}
                  onClick={() => onOpenTimeline(data.pacote_id)}
                >
                  {data.paciente_nome}
                </button>
              </div>
              <p
                className={cn("truncate font-medium", compact ? "text-xs" : "mt-0.5 text-sm")}
                style={{ color: est.accent }}
              >
                {titulo}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide",
                statusStyle,
              )}
            >
              {data.status.replace(/_/g, " ")}
            </span>
          </div>

          <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5", compact ? "mt-2" : "mt-3")}>
            <div className="inline-flex items-center gap-1.5 font-bold tabular-nums text-slate-800">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs">
                {fmt(data.inicio)}
                {data.fim && data.fim !== data.inicio ? ` – ${fmt(data.fim)}` : ""}
              </span>
            </div>
            {data.medico_nome && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <User className="h-3.5 w-3.5 text-slate-400" /> {data.medico_nome}
              </span>
            )}
            {data.recurso_nome && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="h-3.5 w-3.5 text-slate-400" /> {data.recurso_nome}
              </span>
            )}
            <Badge variant="outline" className={cn("text-[10px] font-semibold", est.chip)}>
              {TIPO_SESSAO_LABEL[data.tipo]}
            </Badge>
            {data.is_encaixe && (
              <Badge variant="outline" className="text-[10px] font-semibold bg-amber-100 text-amber-700 border-transparent">
                <Clock className="h-2.5 w-2.5 mr-1" /> Encaixe
              </Badge>
            )}
            {multi && (
              <Button
                variant="ghost"
                size="sm"
                className="-my-1 h-6 rounded-full px-2 text-xs text-slate-500 hover:bg-white/60 hover:text-slate-800"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((v) => !v);
                }}
                aria-expanded={open}
              >
                {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="ml-0.5">{open ? "recolher" : `+${data.items.length} exames`}</span>
              </Button>
            )}
          </div>

          {!compact && (
            <div className="mt-4 border-t border-slate-200/60 pt-3">
              <ProgressTrack
                current={isCurrent}
                steps={[
                  { label: "Confirmado", done: !!data.confirmado || data.status !== "agendado" },
                  { label: "Check-in", done: !!data.checkin || data.status === "em_atendimento" || data.status === "realizado" },
                  { label: "Pago", done: !!data.pago },
                  { label: "Atendimento", done: data.status === "em_atendimento" || data.status === "realizado" },
                ]}
              />
            </div>
          )}
        </div>
      </div>

      {multi && open && (
        <ul className={cn("mt-3 space-y-1.5 border-t border-slate-200/60 pt-3", compact ? "pl-13" : "pl-16")}>
          {data.items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="text-slate-400">›</span>
              <span className="truncate">{it.procedimento_nome}</span>
              {it.status && (
                <Badge
                  variant="outline"
                  className={cn(
                    "border-transparent text-[9px] font-semibold uppercase tracking-wide",
                    STATUS_STYLE[it.status] ?? STATUS_STYLE.agendado,
                  )}
                >
                  {it.status.replace(/_/g, " ")}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}