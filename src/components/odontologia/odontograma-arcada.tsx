import { useMemo } from "react";

/**
 * Arcada dentária anatômica (vista oclusal) para seleção de dentes FDI.
 * Substitui a grade de quadrados: cada dente é desenhado com a forma real
 * (incisivo, canino, pré-molar, molar) e posicionado sobre a curva da arcada.
 */

// ── Antropometria simplificada (mm) — largura mesiodistal e profundidade vestíbulo-lingual
const SUP_LARG: Record<number, number> = { 1: 8.6, 2: 6.6, 3: 7.6, 4: 7.1, 5: 6.6, 6: 10.4, 7: 9.8, 8: 9.0 };
const SUP_PROF: Record<number, number> = { 1: 7.1, 2: 6.2, 3: 8.1, 4: 9.2, 5: 9.0, 6: 11.3, 7: 11.0, 8: 10.5 };
const INF_LARG: Record<number, number> = { 1: 5.3, 2: 5.7, 3: 6.9, 4: 7.1, 5: 7.1, 6: 11.2, 7: 10.7, 8: 10.0 };
const INF_PROF: Record<number, number> = { 1: 6.0, 2: 6.5, 3: 7.5, 4: 7.9, 5: 8.6, 6: 10.5, 7: 10.3, 8: 9.8 };

const ESCALA = 2.9; // px por mm
const FOLGA = 3.5; // px entre coroas
const ORDEM = [1, 2, 3, 4, 5, 6, 7, 8]; // da linha média para posterior

interface Pos {
  pos: number; // 1..8 (posição no quadrante)
  x: number;
  y: number;
  ang: number; // graus, para rotate() do SVG
}

/** Caminha a elipse por comprimento de arco e devolve a posição de cada dente. */
function meiaArcada(largs: Record<number, number>, rx: number, ry: number): Pos[] {
  const alvos: { pos: number; d: number }[] = [];
  let d = 0;
  let larguraAnterior = 0;
  ORDEM.forEach((p, i) => {
    const w = largs[p] * ESCALA;
    d = i === 0 ? w / 2 + FOLGA / 2 : d + larguraAnterior / 2 + FOLGA + w / 2;
    alvos.push({ pos: p, d });
    larguraAnterior = w;
  });

  const saida: Pos[] = [];
  const passo = (0.25 * Math.PI) / 180;
  let phi = 0;
  let acumulado = 0;
  for (const alvo of alvos) {
    while (acumulado < alvo.d && phi < Math.PI / 2) {
      const v = Math.hypot(rx * Math.cos(phi), ry * Math.sin(phi));
      acumulado += v * passo;
      phi += passo;
    }
    const x = rx * Math.sin(phi);
    const y = -ry * Math.cos(phi);
    // normal externa da elipse → rotação do dente (vestibular para fora)
    const ang = (Math.atan2(ry * Math.sin(phi), rx * Math.cos(phi)) * 180) / Math.PI;
    saida.push({ pos: alvo.pos, x, y, ang });
  }
  return saida;
}

function rrect(w: number, h: number, r: number) {
  const x = -w / 2;
  const y = -h / 2;
  return `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${
    x + w - r
  } ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
}

/** Contorno da coroa em vista oclusal, conforme o tipo do dente. */
function contorno(pos: number, w: number, h: number) {
  if (pos <= 2) {
    // incisivos: vestibular plano, lingual côncavo
    return `M ${-w / 2} ${-h * 0.12} Q ${-w / 2} ${-h / 2} 0 ${-h / 2} Q ${w / 2} ${-h / 2} ${w / 2} ${-h * 0.12} Q ${
      w * 0.34
    } ${h / 2} 0 ${h * 0.46} Q ${-w * 0.34} ${h / 2} ${-w / 2} ${-h * 0.12} Z`;
  }
  if (pos === 3) {
    // canino: cúspide única voltada para vestibular
    return `M 0 ${-h / 2} Q ${w * 0.46} ${-h * 0.24} ${w * 0.42} ${h * 0.16} Q ${w * 0.24} ${h * 0.5} 0 ${h * 0.44} Q ${
      -w * 0.24
    } ${h * 0.5} ${-w * 0.42} ${h * 0.16} Q ${-w * 0.46} ${-h * 0.24} 0 ${-h / 2} Z`;
  }
  if (pos <= 5) {
    // pré-molares: oval com duas cúspides
    return rrect(w, h, Math.min(w, h) * 0.4);
  }
  // molares: quadrangular arredondado
  return rrect(w, h, Math.min(w, h) * 0.26);
}

/** Sulcos/cristas internas — dão o aspecto anatômico. */
function sulcos(pos: number, w: number, h: number): string[] {
  if (pos <= 2) return [`M ${-w * 0.36} ${-h * 0.02} Q 0 ${-h * 0.2} ${w * 0.36} ${-h * 0.02}`];
  if (pos === 3)
    return [
      `M 0 ${-h * 0.4} L 0 ${h * 0.18}`,
      `M 0 ${-h * 0.4} L ${-w * 0.26} ${h * 0.1}`,
      `M 0 ${-h * 0.4} L ${w * 0.26} ${h * 0.1}`,
    ];
  if (pos <= 5) return [`M ${-w * 0.3} 0 Q 0 ${h * 0.1} ${w * 0.3} 0`];
  return [
    `M ${-w * 0.34} 0 Q 0 ${h * 0.06} ${w * 0.34} 0`,
    `M ${-w * 0.1} ${-h * 0.02} L ${-w * 0.13} ${-h * 0.32}`,
    `M ${w * 0.06} ${h * 0.02} L ${w * 0.09} ${h * 0.32}`,
    ...(pos === 6 ? [`M ${w * 0.2} ${-h * 0.02} L ${w * 0.23} ${-h * 0.3}`] : []),
  ];
}

const RX_SUP = 132;
const RY_SUP = 140;
const RX_INF = 120;
const RY_INF = 128;
const DY_SUP = -12;
const DY_INF = 16;

export interface DenteRender {
  numero: number;
  x: number;
  y: number;
  ang: number;
  w: number;
  h: number;
  pos: number;
}

function montarDentes(): DenteRender[] {
  const sup = meiaArcada(SUP_LARG, RX_SUP, RY_SUP);
  const inf = meiaArcada(INF_LARG, RX_INF, RY_INF);
  const out: DenteRender[] = [];

  for (const p of sup) {
    const w = SUP_LARG[p.pos] * ESCALA;
    const h = SUP_PROF[p.pos] * ESCALA;
    // quadrante 1 (dir. do paciente) à esquerda da tela; quadrante 2 à direita
    out.push({ numero: 10 + p.pos, x: -p.x, y: p.y + DY_SUP, ang: -p.ang, w, h, pos: p.pos });
    out.push({ numero: 20 + p.pos, x: p.x, y: p.y + DY_SUP, ang: p.ang, w, h, pos: p.pos });
  }
  for (const p of inf) {
    const w = INF_LARG[p.pos] * ESCALA;
    const h = INF_PROF[p.pos] * ESCALA;
    // arcada inferior espelhada na horizontal
    out.push({ numero: 40 + p.pos, x: -p.x, y: -p.y + DY_INF, ang: 180 + p.ang, w, h, pos: p.pos });
    out.push({ numero: 30 + p.pos, x: p.x, y: -p.y + DY_INF, ang: 180 - p.ang, w, h, pos: p.pos });
  }
  return out;
}

const DENTES = montarDentes();

export const DENTES_SUPERIORES = DENTES.filter((d) => d.numero < 30).map((d) => d.numero).sort((a, b) => a - b);
export const DENTES_INFERIORES = DENTES.filter((d) => d.numero >= 30).map((d) => d.numero).sort((a, b) => a - b);

interface Props {
  /** Dentes selecionados (FDI). */
  value: number[];
  onChange: (v: number[]) => void;
  disabled?: boolean;
  /** Dentes que já possuem item de orçamento/tratamento — recebem contorno âmbar. */
  destaque?: Set<number>;
  /** Oculta os botões de arcada inteira / limpar. */
  semAcoes?: boolean;
}

export function OdontogramaArcada({ value, onChange, disabled, destaque, semAcoes }: Props) {
  const selecionados = useMemo(() => new Set(value ?? []), [value]);

  const toggle = (d: number) => {
    if (disabled) return;
    const next = new Set(selecionados);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    onChange(Array.from(next).sort((a, b) => a - b));
  };

  const selecionarArcada = (nums: number[]) => {
    if (disabled) return;
    const todosMarcados = nums.every((n) => selecionados.has(n));
    const next = new Set(selecionados);
    nums.forEach((n) => (todosMarcados ? next.delete(n) : next.add(n)));
    onChange(Array.from(next).sort((a, b) => a - b));
  };

  return (
    <div className="flex flex-col gap-2 select-none">
      {!semAcoes && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => selecionarArcada(DENTES_SUPERIORES)}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary/50 disabled:opacity-50"
          >
            Arcada superior
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => selecionarArcada(DENTES_INFERIORES)}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary/50 disabled:opacity-50"
          >
            Arcada inferior
          </button>
          <button
            type="button"
            disabled={disabled || selecionados.size === 0}
            onClick={() => onChange([])}
            className="px-2 py-1.5 text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline"
          >
            Limpar
          </button>
        </div>
      )}

      <svg
        viewBox="-180 -178 360 350"
        role="group"
        aria-label="Odontograma — seleção de dentes"
        className="w-full max-w-[440px] mx-auto h-auto"
      >
        {/* linha média / referência da mordida */}
        <line x1="-165" y1="2" x2="165" y2="2" className="stroke-border" strokeWidth="1" strokeDasharray="4 5" />

        {DENTES.map((d) => {
          const on = selecionados.has(d.numero);
          const marcado = destaque?.has(d.numero) ?? false;
          const labelDist = d.h / 2 + 11;
          const rad = (d.ang * Math.PI) / 180;
          const lx = d.x + Math.sin(rad) * labelDist;
          const ly = d.y - Math.cos(rad) * labelDist;
          return (
            <g
              key={d.numero}
              role="button"
              aria-pressed={on}
              aria-label={`Dente ${d.numero}`}
              tabIndex={disabled ? -1 : 0}
              onClick={() => toggle(d.numero)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(d.numero);
                }
              }}
              className={disabled ? "opacity-60" : "cursor-pointer focus:outline-none"}
            >
              <title>{`Dente ${d.numero}${on ? " — selecionado" : ""}`}</title>
              <g transform={`translate(${d.x.toFixed(2)} ${d.y.toFixed(2)}) rotate(${d.ang.toFixed(2)})`}>
                <path
                  d={contorno(d.pos, d.w, d.h)}
                  className={
                    on
                      ? "fill-primary stroke-primary"
                      : marcado
                        ? "fill-[#f4f1e8] stroke-amber-500 hover:fill-primary/20"
                        : "fill-[#f4f1e8] stroke-[#b9b1a2] hover:fill-primary/20 hover:stroke-primary/60"
                  }
                  strokeWidth={on || marcado ? 2 : 1.2}
                  strokeLinejoin="round"
                />
                {sulcos(d.pos, d.w, d.h).map((s, i) => (
                  <path
                    key={i}
                    d={s}
                    fill="none"
                    className={on ? "stroke-primary-foreground/60" : "stroke-[#b9b1a2]"}
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                ))}
              </g>
              <text
                x={lx.toFixed(2)}
                y={ly.toFixed(2)}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="11"
                className={on ? "fill-primary font-semibold" : "fill-muted-foreground"}
                style={{ fontFamily: "ui-monospace, monospace" }}
              >
                {d.numero}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{selecionados.size === 0 ? "Nenhum dente selecionado" : `${selecionados.size} dente(s)`}</span>
        {selecionados.size > 0 && (
          <span className="truncate max-w-[60%] text-right font-mono">
            {value.slice(0, 12).join(", ")}
            {value.length > 12 ? "…" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
