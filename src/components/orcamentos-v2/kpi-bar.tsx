import { brl } from "@/lib/financeiro/format";

export interface OrcKpi {
  valorAberto: number;
  valorConvertidoHoje: number;
  conversoesHoje: number;
  conversaoPct: number;   // 0..100
  ticketMedio: number;
}

export function OrcamentosKpiBar({ data }: { data: OrcKpi }) {
  return (
    <div
      className="text-[11px] text-muted-foreground border-t bg-muted/30 px-3 py-1.5 flex flex-wrap gap-x-4 gap-y-1 tabular-nums"
      data-testid="orcamentos-kpi-bar"
    >
      <span>Valor aberto: <b className="text-foreground">{brl(data.valorAberto)}</b></span>
      <span>Convertido hoje: <b className="text-foreground">{brl(data.valorConvertidoHoje)}</b></span>
      <span>Conversão do dia: <b className="text-foreground">{data.conversaoPct.toFixed(0)}%</b></span>
      <span>Ticket médio: <b className="text-foreground">{brl(data.ticketMedio)}</b></span>
      <span>Conversões: <b className="text-foreground">{data.conversoesHoje}</b></span>
    </div>
  );
}