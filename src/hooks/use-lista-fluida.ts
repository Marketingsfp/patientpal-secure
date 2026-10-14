import { useEffect, useLayoutEffect, useRef } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";

/** Mesma curva dos KPIs animados (`--hhp-ease`). */
const CURVA = "cubic-bezier(0.32, 0.72, 0, 1)";

/** Preferência "reduzir animações" do próprio sistema (além da do sistema operacional). */
function reduzirAnimacoes(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.classList.contains("a11y-reduzir-animacao");
}

/**
 * Lista com entrada, saída e reordenação suaves: o item que chega cresce e
 * aparece, o que sai some e os demais deslizam para o lugar (sem salto).
 *
 * `chaves` são os ids na ordem exibida. Troca grande de uma vez (filtro,
 * visualização, página nova) não anima, para não virar um "desfile" de cards.
 * Respeita "reduzir animações" do sistema operacional e do ClinicaOS.
 */
export function useListaFluida<T extends HTMLElement>(
  ativo: boolean,
  chaves: readonly string[],
  { duracao = 260, limiteTroca = 6 }: { duracao?: number; limiteTroca?: number } = {},
) {
  const [ref, habilitar] = useAutoAnimate<T>({ duration: duracao, easing: CURVA });
  const anteriores = useRef<Set<string> | null>(null);

  // Antes de o MutationObserver da animação processar a mudança do DOM.
  useLayoutEffect(() => {
    const atuais = new Set(chaves);
    const antes = anteriores.current;
    anteriores.current = atuais;
    const permitido = ativo && !reduzirAnimacoes();
    if (!antes) {
      habilitar(permitido);
      return;
    }
    let trocas = 0;
    for (const k of atuais) if (!antes.has(k)) trocas++;
    for (const k of antes) if (!atuais.has(k)) trocas++;
    if (permitido && trocas > limiteTroca) {
      habilitar(false);
      const t = setTimeout(() => habilitar(true), 0);
      return () => clearTimeout(t);
    }
    habilitar(permitido);
  }, [ativo, chaves, habilitar, limiteTroca]);

  useEffect(() => () => habilitar(false), [habilitar]);

  return ref;
}

/** Variante para trechos pequenos (badges de um card): só entrada e saída suaves. */
export function useTrechoFluido<T extends HTMLElement>(ativo: boolean) {
  const [ref, habilitar] = useAutoAnimate<T>({ duration: 200, easing: CURVA });
  useLayoutEffect(() => {
    habilitar(ativo && !reduzirAnimacoes());
  }, [ativo, habilitar]);
  return ref;
}
