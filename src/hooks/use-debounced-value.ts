import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Retorna o valor apenas depois de `delay` ms sem alterações.
 * Usado nas buscas (Clientes, Check-in) para manter a digitação fluida
 * mesmo com dezenas de milhares de registros no banco.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Igual ao `useDebouncedValue`, mas com um gatilho de "aplicar na hora".
 *
 * O atraso existe para quem digita letra a letra: sem ele, "MARIA SILVA" viria
 * a virar onze consultas ao banco. Só que a recepção COLA o nome inteiro de uma
 * vez — nesse caso não há digitação intermediária nenhuma para agrupar, e
 * esperar mais um terço de segundo é atraso puro.
 *
 * Ligue `aplicarAgora` ao `onPaste` do campo: a próxima mudança de valor (a
 * colagem em si) passa direto, sem espera. As teclas seguintes voltam ao
 * comportamento normal. O mesmo `aplicarAgora` serve para um botão "Buscar":
 * ele também publica na hora o valor que já está digitado.
 */
export function useBuscaDebounced(
  valor: string,
  delay = 300,
): { termo: string; aplicarAgora: () => void } {
  const [debounced, setDebounced] = useState(valor);
  const semEsperaRef = useRef(false);
  // O `onPaste` do navegador acontece ANTES do valor chegar ao estado, então
  // `aplicarAgora` guarda o pedido no `semEsperaRef` para a mudança seguinte.
  const valorRef = useRef(valor);
  valorRef.current = valor;

  useEffect(() => {
    if (semEsperaRef.current) {
      semEsperaRef.current = false;
      setDebounced(valor);
      return;
    }
    const t = setTimeout(() => setDebounced(valor), delay);
    return () => clearTimeout(t);
  }, [valor, delay]);

  const aplicarAgora = useCallback(() => {
    semEsperaRef.current = true;
    setDebounced(valorRef.current);
  }, []);

  return { termo: debounced, aplicarAgora };
}
