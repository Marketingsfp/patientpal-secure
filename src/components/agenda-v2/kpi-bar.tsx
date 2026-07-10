import {
  Clock,
  Activity,
  CheckCircle2,
  XCircle,
  TestTube,
  Users,
  type LucideIcon,
} from "lucide-react";
import { HhpKpiCard, HhpKpiRow, type HhpTone } from "@/design-system/hhp";

export interface Kpi {
  key: string;
  label: string;
  value: number;
  tone?: "default" | "warn" | "danger" | "ok" | "info";
  hint?: string;
  delta?: number;
}

const ICONS: Record<string, LucideIcon> = {
  todos: Users,
  agendado: Clock,
  confirmado: CheckCircle2,
  realizado: Activity,
  cancelado: XCircle,
  lab: TestTube,
};

/**
 * KPIs em CARDS (padrão mockup V3). Agora consome HhpKpiCard/HhpKpiRow
 * do Design System (E.6). Aparência preservada.
 */
export function KpiBar({
  items,
  activeKey,
  onSelect,
  compact = false,
}: {
  items: ReadonlyArray<Kpi>;
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  compact?: boolean;
}) {
  return (
    <HhpKpiRow compact={compact}>
      {items.map((k) => {
        const tone = (k.tone ?? "default") as HhpTone;
        const Icon = ICONS[k.key] ?? Activity;
        return (
          <HhpKpiCard
            key={k.key}
            label={k.label}
            value={k.value}
            icon={Icon}
            tone={tone}
            hint={k.hint}
            delta={k.delta}
            active={activeKey === k.key}
            compact={compact}
            onClick={onSelect ? () => onSelect(k.key) : undefined}
            className="snap-start"
          />
        );
      })}
    </HhpKpiRow>
  );
}
