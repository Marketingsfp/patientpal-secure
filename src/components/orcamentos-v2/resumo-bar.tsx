import { cn } from "@/lib/utils";
import { brl } from "@/lib/financeiro/format";
import { STATUS_META } from "./status-utils";

export interface ResumoData {
  total: number;
  abertos: number;
  convertidos: number;
  expirados: number;
  valorAberto: number;
  valorConvertidoPeriodo: number;
  ticketMedio: number;
}

function Card({
  label, value, hint, color, testid,
}: { label: string; value: string; hint?: string; color?: string; testid?: string }) {
  return (
    <div
      className="rounded-md border bg-card px-3 py-2 min-w-[110px] flex-1"
      data-testid={testid}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide">
        {color && <span className={cn("h-2 w-2 rounded-full", color)} aria-hidden />}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-lg font-semibold tabular-nums leading-tight mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ResumoBar({ data }: { data: ResumoData }) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-3"
      data-testid="orcamentos-resumo"
    >
      <Card label="Total"       value={String(data.total)}       testid="resumo-total" />
      <Card label="Abertos"     value={String(data.abertos)}     color={STATUS_META.aberto.dot}     testid="resumo-abertos" />
      <Card label="Convertidos" value={String(data.convertidos)} color={STATUS_META.convertido.dot} testid="resumo-convertidos" />
      <Card label="Expirados"   value={String(data.expirados)}   color={STATUS_META.expirado.dot}   testid="resumo-expirados" />
      <Card label="Valor aberto"    value={brl(data.valorAberto)}    testid="resumo-valor-aberto" />
      <Card label="Convertido (per.)" value={brl(data.valorConvertidoPeriodo)} testid="resumo-valor-convertido" />
      <Card label="Ticket médio"    value={brl(data.ticketMedio)}    testid="resumo-ticket" />
    </div>
  );
}