import * as React from "react";
import type { LucideIcon } from "lucide-react";

export type LiquidNavItem = {
  key: string;
  label: string;
  Icon: LucideIcon;
  onSelect: () => void;
  href?: string;
};

const BAR_H = 64;
const R = 16;
const NOTCH_HALF = 44;
const NOTCH_DEPTH = 26;

function barPath(w: number, cx: number) {
  const h = BAR_H;
  const a = cx - NOTCH_HALF;
  const b = cx + NOTCH_HALF;
  return [
    `M ${R} 0`,
    `H ${a}`,
    `C ${a + 20} 0 ${a + 14} ${NOTCH_DEPTH} ${cx} ${NOTCH_DEPTH}`,
    `C ${b - 14} ${NOTCH_DEPTH} ${b - 20} 0 ${b} 0`,
    `H ${w - R}`,
    `A ${R} ${R} 0 0 1 ${w} ${R}`,
    `V ${h - R}`,
    `A ${R} ${R} 0 0 1 ${w - R} ${h}`,
    `H ${R}`,
    `A ${R} ${R} 0 0 1 0 ${h - R}`,
    `V ${R}`,
    `A ${R} ${R} 0 0 1 ${R} 0`,
    "Z",
  ].join(" ");
}

const easeBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * Barra de navegação "liquid": círculo branco flutuante que desliza até o
 * item ativo, com recorte curvo (SVG) acompanhando o movimento.
 */
export function LiquidNav({
  items,
  activeIndex,
  className,
}: {
  items: LiquidNavItem[];
  activeIndex: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [width, setWidth] = React.useState(0);
  const n = items.length;
  const target = width ? (width / n) * (activeIndex + 0.5) : 0;
  const [cx, setCx] = React.useState(target);
  const raf = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    setWidth(el.clientWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    if (!width) return;
    const from = cx || target;
    const delta = target - from;
    if (Math.abs(delta) < 0.5) {
      setCx(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 500);
      setCx(from + delta * easeBack(t));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, width]);

  const ActiveIcon = items[activeIndex]?.Icon;

  return (
    <nav
      ref={ref}
      aria-label="Navegação principal"
      className={className}
      style={{ height: BAR_H }}
    >
      {width > 0 && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full drop-shadow-2xl"
          viewBox={`0 0 ${width} ${BAR_H}`}
          width={width}
          height={BAR_H}
        >
          <path d={barPath(width, cx)} className="fill-slate-950" />
        </svg>
      )}

      {/* círculo branco flutuante */}
      {width > 0 && ActiveIcon && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-6 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-900 shadow-2xl"
          style={{ left: 0, transform: `translateX(${cx - 28}px)` }}
        >
          <ActiveIcon className="h-6 w-6 shrink-0" />
        </div>
      )}

      <div className="relative z-10 flex h-full items-end">
        {items.map((item, i) => {
          const active = i === activeIndex;
          const Icon = item.Icon;
          return (
            <a
              key={item.key}
              href={item.href ?? "#"}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                item.onSelect();
              }}
              className="flex flex-1 cursor-pointer flex-col items-center justify-end gap-1 pb-2 text-xs"
            >
              <Icon
                className={
                  "h-5 w-5 shrink-0 transition-opacity duration-300 " +
                  (active ? "opacity-0" : "text-slate-400 opacity-100 hover:text-white")
                }
              />
              <span
                className={
                  "leading-none transition-colors duration-300 " +
                  (active ? "font-semibold text-white" : "font-medium text-slate-400")
                }
              >
                {item.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
