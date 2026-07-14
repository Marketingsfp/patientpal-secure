import { cn } from "@/lib/utils";

export type ServiceKind =
  | "consulta"
  | "retorno"
  | "enfermagem"
  | "exames"
  | "laboratorio"
  | "odonto"
  | "procedimento"
  | "outro";

const SERVICE_STYLES: Record<ServiceKind, string> = {
  consulta:     "bg-blue-50 text-blue-700 border-blue-100",
  retorno:      "bg-indigo-50 text-indigo-700 border-indigo-100",
  enfermagem:   "bg-teal-50 text-teal-700 border-teal-100",
  exames:       "bg-purple-50 text-purple-700 border-purple-100",
  laboratorio:  "bg-cyan-50 text-cyan-700 border-cyan-100",
  odonto:       "bg-sky-50 text-sky-700 border-sky-100",
  procedimento: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
  outro:        "bg-slate-50 text-slate-700 border-slate-200",
};

function inferKind(label: string): ServiceKind {
  const s = label.toLowerCase();
  if (s.includes("retorno")) return "retorno";
  if (s.includes("enferm")) return "enfermagem";
  if (s.includes("labor")) return "laboratorio";
  if (s.includes("exame")) return "exames";
  if (s.includes("odont")) return "odonto";
  if (s.includes("consulta")) return "consulta";
  if (s.includes("procedim")) return "procedimento";
  return "outro";
}

interface ServiceBadgeProps {
  label: string;
  kind?: ServiceKind;
  className?: string;
}

export function ServiceBadge({ label, kind, className }: ServiceBadgeProps) {
  const k = kind ?? inferKind(label);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium truncate max-w-full",
        SERVICE_STYLES[k],
        className,
      )}
      title={label}
    >
      {label}
    </span>
  );
}