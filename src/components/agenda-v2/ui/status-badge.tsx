import { cn } from "@/lib/utils";

export type AgendaStatus =
  | "agendado"
  | "confirmado"
  | "realizado"
  | "cancelado"
  | "livre"
  | "faltou"
  | "pendente"
  | "em_atendimento"
  | "aguardando";

const STATUS_STYLES: Record<AgendaStatus, { label: string; className: string; dot: string }> = {
  agendado:       { label: "Agendado",       className: "bg-blue-50 text-blue-700 border-blue-100",     dot: "bg-blue-500" },
  confirmado:     { label: "Confirmado",     className: "bg-blue-50 text-blue-700 border-blue-100",     dot: "bg-blue-500" },
  realizado:      { label: "Realizado",      className: "bg-emerald-50 text-emerald-700 border-emerald-100", dot: "bg-emerald-500" },
  cancelado:      { label: "Cancelado",      className: "bg-rose-50 text-rose-700 border-rose-100",     dot: "bg-rose-500" },
  livre:          { label: "Livre",          className: "bg-slate-50 text-slate-600 border-slate-200",  dot: "bg-slate-400" },
  faltou:         { label: "Faltou",         className: "bg-orange-50 text-orange-700 border-orange-100", dot: "bg-orange-500" },
  pendente:       { label: "Pendente",       className: "bg-amber-50 text-amber-700 border-amber-100",  dot: "bg-amber-500" },
  em_atendimento: { label: "Em atendimento", className: "bg-violet-50 text-violet-700 border-violet-100", dot: "bg-violet-500" },
  aguardando:     { label: "Aguardando",     className: "bg-sky-50 text-sky-700 border-sky-100",        dot: "bg-sky-500" },
};

interface StatusBadgeProps {
  status: AgendaStatus | string;
  label?: string;
  className?: string;
}

/** Badge padronizado de situação da agenda. Aceita status conhecidos ou custom. */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const key = String(status).toLowerCase().replace(/\s+/g, "_") as AgendaStatus;
  const cfg = STATUS_STYLES[key] ?? {
    label: label ?? String(status),
    className: "bg-slate-50 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        cfg.className,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} aria-hidden />
      {label ?? cfg.label}
    </span>
  );
}