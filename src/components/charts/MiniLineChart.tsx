import { useEffect, useRef } from "react";
import uPlot, { type AlignedData, type Options } from "uplot";
import "uplot/dist/uPlot.min.css";

export interface MiniLineChartProps {
  /** Rótulos do eixo X (ex.: "12/05") */
  labels: string[];
  /** Valores Y na mesma ordem dos labels */
  values: number[];
  /** Cor da linha (qualquer string CSS) */
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
 */
export function MiniLineChart({
  labels,
  values,
  color = "#13b5a3",
  height = 300,
  formatY = (n) => String(n),
}: MiniLineChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;

    // Usamos índices como eixo X (1, 2, 3…) e formatamos com os labels.
    const xs = labels.map((_, i) => i);
    const data: AlignedData = [xs, values];

    const opts: Options = {
      width: el.clientWidth || 600,
      height,
      legend: { show: false },
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
        {
          label: "Valor",
          stroke: color,
          width: 2,
          points: { show: false },
          value: (_u, v) => (v == null ? "" : formatY(v)),
        },
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
  }, [labels, values, color, height, formatY]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}
