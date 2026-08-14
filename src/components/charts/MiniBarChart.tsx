import { useMemo } from "react";

export interface BarSeries {
  name: string;
  color: string;
  values: number[];
}

export interface MiniBarChartProps {
  /** Rótulos do eixo X (uma por grupo de barras) */
  labels: string[];
  /** Séries agrupadas — cada série é uma cor */
  series: BarSeries[];
  height?: number;
  formatY?: (n: number) => string;
}

/**
 * Bar chart agrupado em SVG puro — feito para datasets pequenos
 * (até ~30 barras totais). Zero dependências, < 1 KB de código.
 */
export function MiniBarChart({
  labels,
  series,
  height = 320,
  formatY = (n) => String(n),
}: MiniBarChartProps) {
  const W = 800;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 56;
  const innerW = W - padL - padR;
  const innerH = height - padT - padB;

  const max = useMemo(() => {
    const m = Math.max(0, ...series.flatMap((s) => s.values));
    return m === 0 ? 1 : m;
  }, [series]);

  const groupW = innerW / Math.max(labels.length, 1);
  const barW = (groupW * 0.7) / Math.max(series.length, 1);
  const yTicks = 4;

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {/* Grade Y + labels */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const v = (max / yTicks) * i;
          const y = padT + innerH - (v / max) * innerH;
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.1}
              />
              <text
                x={padL - 6}
                y={y + 4}
                fontSize="10"
                textAnchor="end"
                fill="currentColor"
                opacity={0.6}
              >
                {formatY(v)}
              </text>
            </g>
          );
        })}

        {/* Barras */}
        {labels.map((lbl, gi) => {
          const gx = padL + groupW * gi + (groupW - barW * series.length) / 2;
          return (
            <g key={lbl + gi}>
              {series.map((s, si) => {
                const v = s.values[gi] ?? 0;
                const h = (v / max) * innerH;
                return (
                  <rect
                    key={s.name + si}
                    x={gx + si * barW}
                    y={padT + innerH - h}
                    width={barW - 2}
                    height={h}
                    fill={s.color}
                    rx={2}
                  >
                    <title>{`${s.name}: ${formatY(v)}`}</title>
                  </rect>
                );
              })}
              <text
                x={padL + groupW * gi + groupW / 2}
                y={height - padB + 16}
                fontSize="11"
                textAnchor="middle"
                fill="currentColor"
                opacity={0.7}
              >
                {lbl}
              </text>
            </g>
          );
        })}
      </svg>
      {/* Legenda */}
      <div className="flex flex-wrap items-center justify-center gap-3 -mt-4 text-xs">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />
            <span className="text-muted-foreground">{s.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
