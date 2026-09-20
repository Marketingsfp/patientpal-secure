import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Uma página por gesto de subida; não baixa páginas em cascata ao abrir. */
export function useHistoricoAnterior<T>(args: {
  chave: string;
  containerRef: RefObject<HTMLDivElement | null>;
  ativo: boolean;
  temMais: boolean;
  carregar: () => Promise<T>;
  aplicar: (pagina: T) => void;
  antesDeCarregar: () => void;
}) {
  const atual = useRef(args);
  atual.current = args;
  const pedido = useRef<{ chave: string } | null>(null);
  const topoObservado = useRef(0);
  const [estado, setEstado] = useState<{
    chave: string;
    carregando: boolean;
    erro: boolean;
  } | null>(null);
  const ancora = useRef<{
    chave: string;
    box: HTMLDivElement;
    elemento: HTMLElement | null;
    offset: number;
    altura: number;
    topo: number;
  } | null>(null);

  const carregar = useCallback(async () => {
    const a = atual.current;
    if (!a.ativo || !a.temMais || pedido.current?.chave === a.chave) return;
    const token = { chave: a.chave };
    pedido.current = token;
    a.antesDeCarregar();
    setEstado({ chave: a.chave, carregando: true, erro: false });
    try {
      const pagina = await a.carregar();
      if (pedido.current !== token || atual.current.chave !== token.chave) return;
      const box = a.containerRef.current;
      if (box) {
        const topoBox = box.getBoundingClientRect().top;
        const elemento =
          Array.from(box.querySelectorAll<HTMLElement>("[data-historico-id]")).find(
            (el) => el.getBoundingClientRect().bottom > topoBox,
          ) ?? null;
        // Mede ao receber a página: a pessoa pode ter rolado durante a busca.
        ancora.current = {
          chave: a.chave,
          box,
          elemento,
          offset: elemento ? elemento.getBoundingClientRect().top - topoBox : 0,
          altura: box.scrollHeight,
          topo: box.scrollTop,
        };
      }
      a.aplicar(pagina);
      setEstado({ chave: a.chave, carregando: false, erro: false });
    } catch {
      if (pedido.current === token && atual.current.chave === token.chave)
        setEstado({ chave: a.chave, carregando: false, erro: true });
    } finally {
      if (pedido.current === token) pedido.current = null;
    }
  }, []);

  // Antes da pintura: preserva a mensagem visível, inclusive quando eventos
  // de uma página passam a integrar um grupo da página anterior.
  useLayoutEffect(() => {
    const pos = ancora.current;
    if (!pos) return;
    ancora.current = null;
    if (pos.chave !== args.chave || pos.box !== args.containerRef.current) return;
    const el = pos.elemento;
    if (el?.isConnected)
      pos.box.scrollTop +=
        el.getBoundingClientRect().top - pos.box.getBoundingClientRect().top - pos.offset;
    else pos.box.scrollTop = pos.topo + pos.box.scrollHeight - pos.altura;
    topoObservado.current = pos.box.scrollTop;
  });

  useEffect(() => {
    const box = args.containerRef.current;
    if (!box || !args.ativo) return;
    topoObservado.current = box.scrollTop;
    let toqueY: number | null = null;
    const perto = () => box.scrollTop <= 100;
    const aoScroll = () => {
      const subindo = box.scrollTop < topoObservado.current;
      topoObservado.current = box.scrollTop;
      if (subindo && perto()) void carregar();
    };
    const aoWheel = (e: WheelEvent) => {
      if (e.deltaY < 0 && perto()) void carregar();
    };
    const aoInicioToque = (e: TouchEvent) => {
      toqueY = e.touches[0]?.clientY ?? null;
    };
    const aoToque = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (y !== undefined && toqueY !== null && y > toqueY && perto()) void carregar();
      toqueY = y ?? null;
    };
    const aoTeclado = (e: KeyboardEvent) => {
      if (["ArrowUp", "PageUp", "Home"].includes(e.key) && perto()) void carregar();
    };
    box.addEventListener("scroll", aoScroll, { passive: true });
    box.addEventListener("wheel", aoWheel, { passive: true });
    box.addEventListener("touchstart", aoInicioToque, { passive: true });
    box.addEventListener("touchmove", aoToque, { passive: true });
    box.addEventListener("keydown", aoTeclado);
    return () => {
      box.removeEventListener("scroll", aoScroll);
      box.removeEventListener("wheel", aoWheel);
      box.removeEventListener("touchstart", aoInicioToque);
      box.removeEventListener("touchmove", aoToque);
      box.removeEventListener("keydown", aoTeclado);
    };
  }, [args.chave, args.ativo, args.containerRef, carregar]);

  useEffect(() => {
    setEstado(null);
    return () => {
      pedido.current = null;
      ancora.current = null;
    };
  }, [args.chave]);
  const corrente = estado?.chave === args.chave ? estado : null;
  return { carregar, carregando: corrente?.carregando ?? false, erro: corrente?.erro ?? false };
}
