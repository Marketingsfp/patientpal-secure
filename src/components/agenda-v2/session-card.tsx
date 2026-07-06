import { useState } from "react";
import {
  ChevronDown, ChevronRight, Clock, User, MapPin,
  Stethoscope, TestTube, ScanLine, HeartPulse, Activity, Scissors, ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const STATUS_STYLE: Record<string, string> = {
  agendado: "bg-slate-50 text-slate-700 border-slate-200",
  confirmado: "bg-sky-50 text-sky-700 border-sky-200",
  em_atendimento: "bg-indigo-50 text-indigo-700 border-indigo-200",
  realizado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelado: "bg-rose-50 text-rose-700 border-rose-200",
  faltou: "bg-rose-50 text-rose-700 border-rose-200",
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
  medico_nome: string | null;
  recurso_nome: string | null;
  inicio: string;
  fim: string;
  tipo: TipoSessao;
  status: string;
  is_encaixe?: boolean;
  items: SessionItem[];
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export type SessionDensity = "confortavel" | "compacto";

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

  const titulo = isLab
    ? `${data.items.length} ${data.items.length === 1 ? "exame" : "exames"} · coleta única`
    : data.items[0]?.procedimento_nome ?? TIPO_SESSAO_LABEL[data.tipo];

  const statusStyle = STATUS_STYLE[data.status] ?? STATUS_STYLE.agendado;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/60 bg-card",
        "shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-md hover:border-border transition-all",
        est.cardBg,
        compact ? "py-2 pl-4 pr-3" : "py-3 pl-5 pr-4",
      )}
    >
      {/* filete lateral colorido = identidade do tipo */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: est.accent }}
      />

      <div className={cn("flex items-start", compact ? "gap-2.5" : "gap-3")}>
        {/* horário + ícone do tipo */}
        <div className="shrink-0 flex flex-col items-center gap-1.5">
          <div
            className={cn(
              "rounded-full flex items-center justify-center",
              est.iconWrap,
              compact ? "h-7 w-7" : "h-9 w-9",
            )}
          >
            <Icon className={cn(est.iconColor, compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
          </div>
          <div className={cn("tabular-nums font-medium text-foreground/90", compact ? "text-[10px]" : "text-xs")}>
            {fmt(data.inicio)}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className={cn(
                "font-semibold truncate hover:underline text-left text-foreground",
                compact ? "text-sm" : "text-[15px]",
              )}
              onClick={() => onOpenTimeline(data.pacote_id)}
            >
              {data.paciente_nome}
            </button>
            <Badge variant="outline" className={cn("text-[10px] font-medium", est.chip)}>
              {TIPO_SESSAO_LABEL[data.tipo]}
            </Badge>
            {data.is_encaixe && (
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200">
                <Clock className="h-2.5 w-2.5 mr-1" /> Encaixe
              </Badge>
            )}
            <Badge variant="outline" className={cn("text-[10px] capitalize font-normal", statusStyle)}>
              {data.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <div className={cn("mt-1 flex items-center gap-x-4 gap-y-1 flex-wrap text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
            <span className="truncate max-w-[280px] text-foreground/70">{titulo}</span>
            {data.medico_nome && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" /> {data.medico_nome}
              </span>
            )}
            {data.recurso_nome && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {data.recurso_nome}
              </span>
            )}
          </div>
        </div>

        {multi && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 -mr-1 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="text-[11px] ml-1">
              {open ? "recolher" : `+${data.items.length}`}
            </span>
          </Button>
        )}
      </div>

      {multi && open && (
        <ul className={cn("mt-2 space-y-1 border-t border-border/50 pt-2", compact ? "pl-[52px]" : "pl-[60px]")}>
          {data.items.map((it) => (
            <li key={it.id} className="text-xs flex items-center gap-2 text-foreground/80">
              <span className="text-muted-foreground/60">›</span>
              <span className="truncate">{it.procedimento_nome}</span>
              {it.status && (
                <Badge variant="outline" className={cn("text-[9px] capitalize font-normal", STATUS_STYLE[it.status] ?? STATUS_STYLE.agendado)}>
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