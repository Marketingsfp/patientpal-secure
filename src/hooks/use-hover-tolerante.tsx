import { useCallback, useEffect, useRef, useState } from "react";
import {
  DELAY_RECOLHER_MS,
  TOLERANCIA_PADRAO,
  dentroComTolerancia,
  type ToleranciaHover,
} from "@/lib/atendimento/hover-tolerante";

type Opcoes = {
  /** Quando falso o hover é ignorado (ex.: painel fixado). */
  ativo?: boolean;
  tolerancia?: ToleranciaHover;
  delay?: number;
};

/**
 * Controla o hover de um painel retrátil com zona de tolerância, atraso para
 * recolher e proteção durante arrasto (scrollbar). Retorna a ref do elemento e
 * se o ponteiro é considerado "dentro".
 */
export function useHoverTolerante<T extends HTMLElement>(opcoes: Opcoes = {}) {
  const { ativo = true, tolerancia = TOLERANCIA_PADRAO, delay = DELAY_RECOLHER_MS } = opcoes;
  const ref = useRef<T | null>(null);
  const [dentro, setDentro] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arrastando = useRef(false);

  const limparTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!ativo) {
      limparTimer();
      arrastando.current = false;
      setDentro(false);
      return;
    }

    const perto = (x: number, y: number) => {
      const el = ref.current;
      if (!el) return false;
      return dentroComTolerancia(el.getBoundingClientRect(), x, y, tolerancia);
    };

    const onMove = (e: PointerEvent | MouseEvent) => {
      // Durante o arrasto (scrollbar) o painel nunca recolhe.
      if (arrastando.current) return;
      if (perto(e.clientX, e.clientY)) {
        limparTimer();
        setDentro(true);
      } else if (!timer.current) {
        timer.current = setTimeout(() => {
          timer.current = null;
          arrastando.current = false;
          setDentro(false);
        }, delay);
      }
    };

    const onDown = (e: PointerEvent) => {
      const el = ref.current;
      // pointerdown na coluna (incluindo a scrollbar, que fica dentro do rect)
      // trava o recolhimento até soltar o botão.
      if (el && (el.contains(e.target as Node) || perto(e.clientX, e.clientY))) {
        arrastando.current = true;
        limparTimer();
        setDentro(true);
      }
    };

    const onUp = (e: PointerEvent | MouseEvent) => {
      if (!arrastando.current) return;
      arrastando.current = false; // liberado mesmo se soltou fora do painel
      if (!perto(e.clientX, e.clientY)) {
        limparTimer();
        timer.current = setTimeout(() => {
          timer.current = null;
          setDentro(false);
        }, delay);
      }
    };

    const onCancel = () => {
      arrastando.current = false;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("mouseup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("blur", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("mouseup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      window.removeEventListener("blur", onCancel);
      limparTimer();
    };
  }, [ativo, delay, tolerancia, limparTimer]);

  return { ref, dentro };
}
