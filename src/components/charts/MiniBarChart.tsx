import { useEffect, useMemo, useRef, useState } from "react";
import { passoDoRotulo } from "@/lib/charts/passo-rotulo";

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

/** Largura usada antes de medir a tela (SSR e primeiro render). */
const W_PADRAO = 800;

/**
 * Bar chart agrupado em SVG puro. Zero dependências.
 *
 * Duas coisas aqui existem por causa de gráfico com muitas barras (o BI
 * Financeiro por dia chega a 31):
 *
 * 1. A largura do `viewBox` acompanha a largura real do elemento. Antes era
 *    fixa em 800 com `preserveAspectRatio="none"`, então em tela larga o SVG
 *    era esticado na horizontal e o texto do eixo saía deformado.
 * 2. O eixo X escreve um rótulo a cada N barras, sendo N o mínimo para os
 *    textos não se encavalarem. Com 30 dias no mês os rótulos ficavam
 *    sobrepostos e ilegíveis.
 */
export function MiniBarChart({
  labels,
  series,
  height = 320,
  formatY = (n) => String(n),
}: MiniBarChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [larguraMedida, setLarguraMedida] = useState(W_PADRAO);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entradas) => {
      const w = Math.round(entradas[0]?.contentRect.width ?? 0);
      if (w > 0) setLarguraMedida(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = Math.max(320, larguraMedida);
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

  // De quantas em quantas barras o eixo X recebe rótulo (ver passo-rotulo.ts).
  const passoRotulo = useMemo(() => passoDoRotulo(labels, groupW), [labels, groupW]);

  return (
    <div ref={wrapRef} className="w-full" style={{ height }}>
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
                    {/* O rótulo entra na dica porque o eixo X pode ter
                        pulado esta barra. */}
                    <title>{`${lbl} — ${s.name}: ${formatY(v)}`}</title>
                  </rect>
                );
              })}
              {gi % passoRotulo === 0 && (
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
              )}
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
