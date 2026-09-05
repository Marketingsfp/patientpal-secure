import { useCallback, useEffect, useRef, useState } from "react";
import {
  decidirScroll,
  pertoDoFim,
  type PosicaoScroll,
} from "@/lib/atendimento/scroll-chat";

/**
 * Mantém o chat de atendimento no comportamento de app de mensagens:
 * abre no fim, acompanha quem já está no fim e não interrompe quem está
 * lendo o histórico (mostra o indicador de novas mensagens).
 */
export function useChatScroll(args: {
  /** Muda quando a atendente troca de conversa (reseta tudo). */
  conversaId: string | null | undefined;
  /** Quantidade de itens reais da linha do tempo (mensagens + eventos). */
  total: number;
  /** Id do último item real da linha do tempo. */
  ultimoId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ancoraRef = useRef<HTMLDivElement | null>(null);
  const [novas, setNovas] = useState(0);

  const primeiraCarga = useRef(true);
  const totalAnterior = useRef(0);
  const ultimoIdAnterior = useRef<string | null>(null);
  /**
   * Abertura da conversa: vale até a atendente rolar por conta própria.
   * Enquanto durar, tudo que chega depois (resumo da Nina, eventos, imagens,
   * revalidação do cache) mantém a tela no fim em vez de virar indicador.
   */
  const emAbertura = useRef(true);

  const irParaFim = useCallback((suave = false) => {
    const alvo = ancoraRef.current;
    const box = containerRef.current;
    if (alvo) alvo.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "end" });
    else if (box) box.scrollTop = box.scrollHeight;
    setNovas(0);
  }, []);

  // Troca de conversa: nunca reaproveitar a posição da conversa anterior.
  useEffect(() => {
    primeiraCarga.current = true;
    totalAnterior.current = 0;
    ultimoIdAnterior.current = null;
    emAbertura.current = true;
    setNovas(0);
    const box = containerRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [args.conversaId]);

  useEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    if (args.total === 0) return; // ainda carregando: não posiciona cedo demais

    const posicao: PosicaoScroll = {
      scrollTop: box.scrollTop,
      scrollHeight: box.scrollHeight,
      clientHeight: box.clientHeight,
    };
    const acao = decidirScroll({
      primeiraCarga: primeiraCarga.current,
      emAbertura: emAbertura.current,
      totalAnterior: totalAnterior.current,
      totalAtual: args.total,
      ultimoIdAnterior: ultimoIdAnterior.current,
      ultimoIdAtual: args.ultimoId,
      posicao,
      novasAtuais: novas,
    });

    totalAnterior.current = args.total;
    ultimoIdAnterior.current = args.ultimoId;

    if (acao.tipo === "manter") {
      setNovas(acao.novas);
      return;
    }

    const eraPrimeira = primeiraCarga.current;
    primeiraCarga.current = false;
    setNovas(0);
    // Espera o layout (resumo da Nina, eventos, imagens) antes de medir o fim.
    const r1 = requestAnimationFrame(() => {
      irParaFim(acao.suave);
      if (eraPrimeira) requestAnimationFrame(() => irParaFim(false));
    });
    return () => cancelAnimationFrame(r1);
    // `novas` é lido por referência de estado; não deve reexecutar o efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.conversaId, args.total, args.ultimoId, irParaFim]);

  // Durante a abertura, o conteúdo ainda muda de altura (resumo da Nina,
  // eventos, imagens). Sem isto a tela ficava parada num ponto antigo.
  useEffect(() => {
    const box = containerRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => {
      if (!emAbertura.current || primeiraCarga.current) return;
      const alvo = ancoraRef.current;
      if (alvo) alvo.scrollIntoView({ behavior: "auto", block: "end" });
      else box.scrollTop = box.scrollHeight;
    });
    for (const filho of Array.from(box.children)) obs.observe(filho);
    obs.observe(box);
    return () => obs.disconnect();
  }, [args.conversaId, args.total]);

  // Rolagem feita pela pessoa encerra a abertura e libera o indicador.
  useEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    const encerrarAbertura = () => {
      emAbertura.current = false;
    };
    const onScroll = () => {
      if (
        pertoDoFim({
          scrollTop: box.scrollTop,
          scrollHeight: box.scrollHeight,
          clientHeight: box.clientHeight,
        })
      ) {
        setNovas((n) => (n === 0 ? n : 0));
      }
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    box.addEventListener("wheel", encerrarAbertura, { passive: true });
    box.addEventListener("touchmove", encerrarAbertura, { passive: true });
    box.addEventListener("keydown", encerrarAbertura);
    return () => {
      box.removeEventListener("scroll", onScroll);
      box.removeEventListener("wheel", encerrarAbertura);
      box.removeEventListener("touchmove", encerrarAbertura);
      box.removeEventListener("keydown", encerrarAbertura);
    };
  }, [args.conversaId]);


  return { containerRef, ancoraRef, novas, irParaFim };
}
