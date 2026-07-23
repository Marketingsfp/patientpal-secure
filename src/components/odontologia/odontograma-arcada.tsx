import { useMemo } from "react";
import { toothShape } from "@/lib/tooth-shape";

/**
 * Arcada dentária anatômica (vista frontal/labial) para seleção de dentes FDI.
 * Cada dente é desenhado com coroa + raiz reais (mesmo motor de geometria do
 * odontograma clínico), em duas fileiras retas — superior com raiz para cima,
 * inferior com raiz para baixo — como num diagrama de boca aberta.
 */

// FDI: mesmas fileiras usadas em <Odontograma />
const SUP_DIR = [18, 17, 16, 15, 14, 13, 12, 11];
const SUP_ESQ = [21, 22, 23, 24, 25, 26, 27, 28];
const INF_ESQ = [31, 32, 33, 34, 35, 36, 37, 38];
const INF_DIR = [48, 47, 46, 45, 44, 43, 42, 41];

export const DENTES_SUPERIORES = [...SUP_DIR, ...SUP_ESQ];
export const DENTES_INFERIORES = [...INF_DIR, ...INF_ESQ];

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

      <div className="flex flex-col items-center gap-1">
        <Fileira
          dentes={[...SUP_DIR, ...SUP_ESQ]}
          superior
          selecionados={selecionados}
          destaque={destaque}
          disabled={disabled}
          onToggle={toggle}
        />
        <div className="my-0.5 h-px w-full max-w-[560px] border-t border-dashed border-border" />
        <Fileira
          dentes={[...INF_DIR, ...INF_ESQ]}
          superior={false}
          selecionados={selecionados}
          destaque={destaque}
          disabled={disabled}
          onToggle={toggle}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {selecionados.size === 0 ? "Nenhum dente selecionado" : `${selecionados.size} dente(s)`}
        </span>
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

function Fileira({
  dentes,
  superior,
  selecionados,
  destaque,
  disabled,
  onToggle,
}: {
  dentes: number[];
  superior: boolean;
  selecionados: Set<number>;
  destaque?: Set<number>;
  disabled?: boolean;
  onToggle: (d: number) => void;
}) {
  return (
    <div className="flex justify-center gap-0.5 flex-wrap">
      {dentes.map((d) => (
        <Dente
          key={d}
          numero={d}
          superior={superior}
          on={selecionados.has(d)}
          marcado={destaque?.has(d) ?? false}
          disabled={disabled}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

function Dente({
  numero,
  superior,
  on,
  marcado,
  disabled,
  onToggle,
}: {
  numero: number;
  superior: boolean;
  on: boolean;
  marcado: boolean;
  disabled?: boolean;
  onToggle: (d: number) => void;
}) {
  const { crownPath, rootPath, vbW, vbH } = toothShape(numero, superior);
  const corPreenchimento = on ? "fill-primary" : marcado ? "fill-amber-100" : "fill-[#f4f1e8]";
  const corContorno = on ? "stroke-primary" : marcado ? "stroke-amber-500" : "stroke-[#8f8676]";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(numero)}
      aria-pressed={on}
      aria-label={`Dente ${numero}`}
      title={`Dente ${numero}${on ? " — selecionado" : ""}`}
      className={`flex ${superior ? "flex-col" : "flex-col-reverse"} items-center gap-0.5 rounded-md p-0.5 transition ${
        on ? "bg-primary/10" : marcado ? "bg-amber-50" : "hover:bg-primary/5"
      } ${disabled ? "opacity-60 cursor-default" : "cursor-pointer"}`}
    >
      <svg viewBox={`0 0 ${vbW} ${vbH}`} className="h-14 w-6 sm:h-16 sm:w-7">
        <path
          d={rootPath}
          fill="none"
          className="stroke-[#a39c8c]"
          strokeWidth="1"
          strokeLinejoin="round"
          strokeLinecap="round"
          fillRule="evenodd"
        />
        <path
          d={crownPath}
          className={`${corPreenchimento} ${corContorno}`}
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={`text-[9px] font-mono leading-none ${on ? "text-primary font-semibold" : "text-muted-foreground"}`}
      >
        {numero}
      </span>
    </button>
  );
}
