import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Valor que muda com uma transição curta (o novo texto sobe e aparece), como
 * o contador de mensagens não lidas e o "Espera · 8 min". Só anima quando o
 * valor muda depois de montado: a carga inicial da lista não anima.
 */
export function TextoFluido({
  valor,
  ativo,
  children,
}: {
  /** Chave do que é exibido; quando muda, o texto anima. */
  valor: string | number;
  ativo: boolean;
  children?: ReactNode;
}) {
  const anterior = useRef(valor);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    if (anterior.current === valor) return;
    anterior.current = valor;
    if (ativo) setVersao((v) => v + 1);
  }, [valor, ativo]);
  return (
    <span key={versao} className={ativo && versao > 0 ? "ux-texto-novo" : undefined}>
      {children ?? valor}
    </span>
  );
}
