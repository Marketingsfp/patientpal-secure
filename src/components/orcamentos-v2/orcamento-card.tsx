import { Printer, FileText, History as HistoryIcon, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type OrcV2 = {
  id: string;
  numero: number;
  paciente_nome: string;
  paciente_telefone: string | null;
  medico_nome: string | null;
  forma_pagamento: string | null;
  valor_total: number;
  status: string;
  created_at: string;
  categoria: "laboratorio" | "demais" | null | string;
  agendamentos_total: number;
  agendamentos_realizados: number;
  itens_total: number;
  itens_consumidos: number;
};

const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Deriva um label de pagador exibível sem usar "Convênio". */
export function pagadorLabel(forma: string | null): "Particular" | "Associado" | "Cartão de Benefícios" {
  const s = (forma ?? "").toLowerCase();
  if (s.includes("cart") && s.includes("benef")) return "Cartão de Benefícios";
  if (s.includes("associado")) return "Associado";
  return "Particular";
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `há ${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

interface Props {
  o: OrcV2;
  compact?: boolean;
  onOpen: () => void;
  onPrint: () => void;
  onConverter: () => void;
  onHistorico?: () => void;
  podeHistorico?: boolean;
}

export function OrcamentoCard({ o, compact, onOpen, onPrint, onConverter, onHistorico, podeHistorico }: Props) {
  const pagador = pagadorLabel(o.forma_pagamento);
  const convertido = (o.agendamentos_total ?? 0) > 0;
  const pendencia = (o.itens_total ?? 0) > 0 && (o.itens_consumidos ?? 0) < (o.itens_total ?? 0) && convertido;

  return (
    <div
      className={cn(
        "group border-b border-border bg-card hover:bg-accent/30 transition-colors cursor-pointer",
        compact ? "px-3 py-2" : "px-4 py-3",
      )}
      onClick={onOpen}
      data-testid="orcamento-card"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium truncate">{o.paciente_nome}</span>
            <span className="text-xs text-muted-foreground shrink-0">#ORC-{o.numero}</span>
            <span className="text-xs text-muted-foreground shrink-0">· {relativeTime(o.created_at)}</span>
          </div>
          {!compact && (
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{o.itens_total || 0} {o.itens_total === 1 ? "item" : "itens"}</span>
              {o.medico_nome && <span>· {o.medico_nome}</span>}
              <Badge variant="outline" className="text-[10px] font-normal">{pagador}</Badge>
              {o.categoria === "laboratorio" && <Badge variant="secondary" className="text-[10px] font-normal">Laboratório</Badge>}
              {convertido && <Badge variant="secondary" className="text-[10px] font-normal">Convertido {o.agendamentos_realizados}/{o.agendamentos_total}</Badge>}
              {pendencia && <Badge variant="destructive" className="text-[10px] font-normal">Pendência</Badge>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className={cn("font-semibold tabular-nums", compact ? "text-sm" : "text-base")}>{BRL(Number(o.valor_total))}</div>
          </div>
          <div className="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onPrint(); }} title="Imprimir">
              <Printer className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onConverter(); }} title="Converter em pagamento">
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
            {podeHistorico && onHistorico && (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onHistorico(); }} title="Histórico">
                <HistoryIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
          <FileText className="h-4 w-4 text-muted-foreground md:hidden" />
        </div>
      </div>
    </div>
  );
}