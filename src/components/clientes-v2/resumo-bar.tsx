import { cn } from "@/lib/utils";
import type { ClientesKpiTotais } from "./use-kpis";

function Card({
  label, v, tone, onClick, active,
}: { label: string; v: number | null; tone?: string; onClick?: () => void; active?: boolean }) {
  const Cmp: "button" | "div" = onClick ? "button" : "div";
  return (
    <Cmp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        "rounded-lg border bg-card px-3 py-2 text-left min-w-[110px] transition-colors",
        onClick && "hover:bg-accent/40 cursor-pointer",
        active && "border-primary ring-1 ring-primary/40",
      )}
    >
      <div className={cn("text-lg font-semibold tabular-nums leading-tight", tone)}>
        {v === null ? "…" : v.toLocaleString("pt-BR")}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </Cmp>
  );
}

export interface ResumoBarProps {
  k: ClientesKpiTotais;
  activeMode: "none" | "aniv" | "novos30" | "semTel" | "semCpf" | "inativos";
  onSelect: (mode: "none" | "aniv" | "novos30" | "semTel" | "semCpf" | "inativos") => void;
}

export function ResumoBar({ k, activeMode, onSelect }: ResumoBarProps) {
  const pick = (m: ResumoBarProps["activeMode"]) => () => onSelect(activeMode === m ? "none" : m);
  return (
    <div className="flex flex-wrap gap-2 border-b bg-muted/30 px-3 py-2">
      <Card label="Total" v={k.total} />
      <Card label="Ativos" v={k.ativos} tone="text-emerald-700 dark:text-emerald-400" />
      <Card label="Inativos" v={k.inativos} onClick={pick("inativos")} active={activeMode === "inativos"} />
      <Card label="Novos 30 dias" v={k.novos30d} tone="text-sky-700 dark:text-sky-400"
            onClick={pick("novos30")} active={activeMode === "novos30"} />
      <Card label="Aniversariantes hoje" v={k.aniversariantes} tone="text-fuchsia-700 dark:text-fuchsia-400"
            onClick={pick("aniv")} active={activeMode === "aniv"} />
      <Card label="Sem telefone" v={k.semTelefone} tone="text-amber-700 dark:text-amber-400"
            onClick={pick("semTel")} active={activeMode === "semTel"} />
      <Card label="Sem CPF" v={k.semCpf} tone="text-amber-700 dark:text-amber-400"
            onClick={pick("semCpf")} active={activeMode === "semCpf"} />
      <Card label="Associados" v={k.associados} tone="text-emerald-700 dark:text-emerald-400" />
      <Card label="Particulares" v={k.particulares} />
    </div>
  );
}