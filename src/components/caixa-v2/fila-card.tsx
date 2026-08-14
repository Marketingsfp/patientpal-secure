import { HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/financeiro/format";
import { cn } from "@/lib/utils";
import type { AlertaBadge } from "./alertas-fila";

export type StatusFila = "paid" | "waiting" | "in-service" | "canceled" | "refunded";

const STATUS_LABEL: Record<StatusFila, string> = {
  paid: "Pago",
  waiting: "Aguardando",
  "in-service": "Em atendimento",
  canceled: "Cancelado",
  refunded: "Estornado",
};

const STATUS_DOT: Record<StatusFila, string> = {
  paid: "bg-status-paid",
  waiting: "bg-status-waiting",
  "in-service": "bg-status-in-service",
  canceled: "bg-status-canceled",
  refunded: "bg-status-refunded",
};

export function StatusDot({ status, pulse }: { status: StatusFila; pulse?: boolean }) {
  return (
    <span
      role="img"
      aria-label={`Status: ${STATUS_LABEL[status]}`}
      title={STATUS_LABEL[status]}
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        STATUS_DOT[status],
        pulse && "animate-pulse",
      )}
    />
  );
}

export interface FilaCardData {
  id: string;
  pacienteNome: string;
  pacienteIdade?: number | null;
  procedimento: string | null;
  medicoNome: string | null;
  inicio: string;
  valor: number;
  tipoCobranca: "Particular" | "Associado" | "Cartão de Benefícios";
  status: StatusFila;
  alertas: AlertaBadge[];
}

export function FilaCard({
  data,
  compact,
  onReceber,
  onOpenTimeline,
}: {
  data: FilaCardData;
  compact?: boolean;
  onReceber: () => void;
  onOpenTimeline: () => void;
}) {
  const hora = new Date(data.inicio).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div
      className={cn(
        "group rounded-lg border bg-card shadow-sm transition-colors",
        "hover:border-primary/40 hover:bg-accent/30",
        compact ? "p-2" : "p-3",
      )}
      data-testid={`fila-card-${data.id}`}
      data-status={data.status}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpenTimeline}
          className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={data.status} pulse={data.status === "in-service"} />
            <span className="truncate font-medium text-sm">
              {data.pacienteNome}
              {typeof data.pacienteIdade === "number" && (
                <span className="text-muted-foreground font-normal"> · {data.pacienteIdade}a</span>
              )}
            </span>
          </div>
          {!compact && (
            <div className="mt-1 text-xs text-muted-foreground truncate">
              {data.procedimento ?? "—"}
              {data.medicoNome ? ` · ${data.medicoNome}` : ""}
            </div>
          )}
          <div className={cn("mt-1 flex items-center gap-2 text-xs", compact && "flex-wrap")}>
            <Badge variant="outline" className="h-5 text-[10px] font-normal">
              {data.tipoCobranca}
            </Badge>
            <span className="text-muted-foreground tabular-nums">{hora}</span>
            <span className="font-semibold tabular-nums text-foreground">{brl(data.valor)}</span>
          </div>
          {data.alertas.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {data.alertas.map((a) => (
                <span
                  key={a.tipo}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    a.severity === "danger" && "bg-status-canceled/15 text-status-canceled",
                    a.severity === "warn" && "bg-status-waiting/20 text-foreground",
                    a.severity === "info" && "bg-status-in-service/15 text-status-in-service",
                  )}
                  data-testid={`alerta-${a.tipo}`}
                >
                  <span aria-hidden>{a.emoji}</span>
                  {a.label}
                </span>
              ))}
            </div>
          )}
        </button>
        <Button
          size={compact ? "sm" : "default"}
          onClick={onReceber}
          className="shrink-0 gap-1.5 bg-status-paid hover:bg-status-paid/90 text-white shadow"
          data-testid={`fila-receber-${data.id}`}
          aria-label={`Receber pagamento de ${data.pacienteNome}`}
        >
          <HandCoins className="h-4 w-4" />
          {compact ? "" : "Receber"}
        </Button>
      </div>
    </div>
  );
}
