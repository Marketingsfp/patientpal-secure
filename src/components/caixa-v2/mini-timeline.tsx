import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type EtapaKey = "checkin" | "recepcao" | "caixa" | "atendimento" | "finalizado";

export interface EtapaTimeline {
  key: EtapaKey;
  label: string;
  hora?: string | null;
  status: "done" | "current" | "pending";
}

const ORDER: EtapaKey[] = ["checkin", "recepcao", "caixa", "atendimento", "finalizado"];
const DEFAULT_LABELS: Record<EtapaKey, string> = {
  checkin: "Check-in", recepcao: "Recepção", caixa: "Caixa",
  atendimento: "Atendimento", finalizado: "Finalizado",
};

export function buildTimeline(input: Partial<Record<EtapaKey, string | null>>): EtapaTimeline[] {
  const filled = ORDER.filter((k) => !!input[k]);
  const currentIdx = filled.length; // próxima etapa
  return ORDER.map((key, idx) => ({
    key, label: DEFAULT_LABELS[key], hora: input[key] ?? null,
    status: idx < currentIdx ? "done" : idx === currentIdx ? "current" : "pending",
  }));
}

export function MiniTimeline({ etapas }: { etapas: EtapaTimeline[] }) {
  return (
    <ol
      className="flex items-start justify-between gap-1 w-full"
      aria-label="Jornada do paciente"
      data-testid="mini-timeline"
    >
      {etapas.map((e, i) => (
        <li key={e.key} className="flex-1 flex flex-col items-center relative">
          {i > 0 && (
            <span
              aria-hidden
              className={cn(
                "absolute top-3 right-1/2 h-0.5 w-full -z-0",
                etapas[i - 1].status === "done" ? "bg-status-paid" : "bg-border",
              )}
            />
          )}
          <span
            className={cn(
              "relative z-10 grid place-items-center h-6 w-6 rounded-full border-2 text-[10px]",
              e.status === "done" && "bg-status-paid border-status-paid text-white",
              e.status === "current" && "bg-status-in-service border-status-in-service text-white animate-pulse",
              e.status === "pending" && "bg-background border-border text-muted-foreground",
            )}
            aria-current={e.status === "current" ? "step" : undefined}
          >
            {e.status === "done" ? <Check className="h-3 w-3" /> : i + 1}
          </span>
          <span className="mt-1 text-[10px] font-medium text-center">{e.label}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{e.hora ?? "—"}</span>
        </li>
      ))}
    </ol>
  );
}