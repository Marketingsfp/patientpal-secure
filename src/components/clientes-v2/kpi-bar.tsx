import { cn } from "@/lib/utils";

export interface ClientesKpi {
  visiveis: number;
  ativos: number;
  inativos: number;
  incompletos: number;
  duplicados: number;
  associados: number;
  cartao: number;
  particular: number;
}

export function ClientesKpiBar({ k, modoBusca }: { k: ClientesKpi; modoBusca: boolean }) {
  const Item = ({ label, v, tone }: { label: string; v: number; tone?: string }) => (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className={cn("tabular-nums font-semibold text-sm", tone)}>
        {v.toLocaleString("pt-BR")}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
  return (
    <div className="border-t bg-muted/40 px-3 py-1.5 text-xs flex flex-wrap items-center gap-x-4 gap-y-1">
      <Item label={modoBusca ? "no resultado" : "recentes"} v={k.visiveis} />
      <Item label="ativos" v={k.ativos} tone="text-emerald-700 dark:text-emerald-400" />
      <Item label="inativos" v={k.inativos} />
      <Item label="incompletos" v={k.incompletos} tone="text-amber-700 dark:text-amber-400" />
      <Item label="duplicados" v={k.duplicados} tone="text-rose-700 dark:text-rose-400" />
      <Item label="particular" v={k.particular} />
      <Item label="associado" v={k.associados} />
      <Item label="cartão" v={k.cartao} />
    </div>
  );
}
