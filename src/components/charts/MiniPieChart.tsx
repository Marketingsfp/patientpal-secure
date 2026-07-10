import { useMemo } from "react";

export interface PieSlice {
  name: string;
  value: number;
}

export interface MiniPieChartProps {
  data: PieSlice[];
  colors?: string[];
  /** Altura do componente (largura é 100%) */
  height?: number;
  formatValue?: (n: number) => string;
}

const DEFAULT_COLORS = [
  "#13b5a3", "#3b82f6", "#f59e0b", "#ef4444",
  "#a855f7", "#10b981", "#ec4899", "#6366f1",
];

/**
 * Pie chart em SVG puro com legenda lateral.
 * Pensado para até ~10 fatias.
 */
export function MiniPieChart({
  data,
  colors = DEFAULT_COLORS,
  height = 300,
  formatValue = (n) => String(n),
}: MiniPieChartProps) {
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  const slices = useMemo(() => {
    let acc = 0;
    const cx = 50;
    const cy = 50;
    const r = 45;
    return data.map((d, i) => {
      const start = (acc / total) * Math.PI * 2;
      acc += d.value;
      const end = (acc / total) * Math.PI * 2;
      const large = end - start > Math.PI ? 1 : 0;
      const x1 = cx + r * Math.sin(start);
      const y1 = cy - r * Math.cos(start);
      const x2 = cx + r * Math.sin(end);
      const y2 = cy - r * Math.cos(end);
      const path = total === 0
        ? ""
        : data.length === 1
        ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
      return {
        ...d,
        path,
        color: colors[i % colors.length],
        pct: total === 0 ? 0 : (d.value / total) * 100,
      };
    });
  }, [data, total, colors]);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        Sem dados
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 w-full" style={{ height }}>
      <svg viewBox="0 0 100 100" className="h-full" style={{ flex: "0 0 auto", width: height }}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color}>
            <title>{`${s.name}: ${formatValue(s.value)} (${s.pct.toFixed(1)}%)`}</title>
          </path>
        ))}
      </svg>
      <ul className="flex-1 min-w-0 space-y-1 text-xs overflow-auto" style={{ maxHeight: height }}>
        {slices.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm flex-none" style={{ background: s.color }} />
            <span className="truncate flex-1">{s.name}</span>
            <span className="tabular-nums text-muted-foreground">{s.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
