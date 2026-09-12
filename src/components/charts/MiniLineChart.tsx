import { useEffect, useRef } from "react";
import uPlot, { type AlignedData, type Options } from "uplot";
import "uplot/dist/uPlot.min.css";

/** Uma linha do gráfico. `null` no meio dos valores interrompe o traço. */
export interface LineSeries {
  name: string;
  color: string;
  values: Array<number | null>;
  /** Traço pontilhado — usado para o que é estimativa, não realizado. */
  tracejada?: boolean;
}

export interface MiniLineChartProps {
  /** Rótulos do eixo X (ex.: "12/05") */
  labels: string[];
  /** Valores Y na mesma ordem dos labels — atalho para uma linha só. */
  values?: number[];
  /** Duas ou mais linhas no mesmo eixo. Tem precedência sobre `values`. */
  series?: LineSeries[];
  /** Cor da linha (qualquer string CSS) — só vale com `values` */
  color?: string;
  /** Altura em px */
  height?: number;
  /** Formatter usado no tooltip do eixo Y */
  formatY?: (n: number) => string;
}

/**
 * Gráfico de linha minimalista baseado em uPlot.
 * Mantém a API próxima da que tínhamos com Recharts (data + dataKey),
 * mas com bundle ~20x menor.
 *
 * Aceita uma linha só (`values`, como sempre foi) ou várias (`series`) — o
 * segundo caso nasceu do gráfico de tendência da Projeção, que precisa do
 * realizado e do projetado no mesmo eixo, a estimativa em tracejado.
 */
export function MiniLineChart({
  labels,
  values,
  series,
  color = "#13b5a3",
  height = 300,
  formatY = (n) => String(n),
}: MiniLineChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;

    const linhas: LineSeries[] = series?.length
      ? series
      : [{ name: "Valor", color, values: values ?? [] }];

    // Usamos índices como eixo X (1, 2, 3…) e formatamos com os labels.
    const xs = labels.map((_, i) => i);
    const data = [xs, ...linhas.map((l) => l.values)] as AlignedData;

    const opts: Options = {
      width: el.clientWidth || 600,
      height,
      legend: { show: linhas.length > 1 },
      cursor: { drag: { x: false, y: false }, points: { size: 8 } },
      scales: { x: { time: false } },
      axes: [
        {
          stroke: "currentColor",
          grid: { stroke: "rgba(125,125,125,0.15)" },
          values: (_u, ticks) => ticks.map((t) => labels[Math.round(t)] ?? ""),
        },
        {
          stroke: "currentColor",
          grid: { stroke: "rgba(125,125,125,0.15)" },
          values: (_u, ticks) => ticks.map((t) => formatY(t)),
        },
      ],
      series: [
        { label: "x" },
        ...linhas.map((l) => ({
          label: l.name,
          stroke: l.color,
          width: 2,
          dash: l.tracejada ? [6, 4] : undefined,
          points: { show: false },
          value: (_u: uPlot, v: number | null) => (v == null ? "" : formatY(v)),
        })),
      ],
    };

    plotRef.current = new uPlot(opts, data, el);

    const ro = new ResizeObserver(() => {
      if (plotRef.current && el.clientWidth) {
        plotRef.current.setSize({ width: el.clientWidth, height });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [labels, values, series, color, height, formatY]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}
