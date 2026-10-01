import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImagemMensagemAmpliada } from "./ImagemMensagemAmpliada";
import { urlMidiaMensagem } from "@/lib/atendimento/midia-mensagem.functions";
import { ehCaminhoGuardado } from "@/lib/whatsapp-midia-armazenamento";

type MensagemComMidia = {
  id: string;
  tipo?: string | null;
  body?: string | null;
  media_url?: string | null;
};

const TEXTO_PADRAO_IMAGEM = "📷 Imagem";

/** A mensagem tem imagem ou áudio guardado no sistema, que dá para mostrar? */
export function temMidiaVisivel(m: MensagemComMidia): boolean {
  return (m.tipo === "image" || m.tipo === "audio") && ehCaminhoGuardado(m.media_url);
}

/** Texto da bolha: com a imagem à mostra, o "📷 Imagem" padrão some; a legenda e a transcrição ficam. */
export function textoDaBolha(m: MensagemComMidia): string {
  const corpo = String(m.body ?? "");
  if (m.tipo === "image" && temMidiaVisivel(m) && corpo === TEXTO_PADRAO_IMAGEM) return "";
  return corpo || `[${m.tipo}]`;
}

// Os links duram 10 minutos: guarda por 8 para não pedir de novo a cada rolagem.
const CACHE_MS = 8 * 60 * 1000;
const cacheLinks = new Map<string, { url: string; em: number }>();

function useLinkDaMidia(clinicaId: string, mensagemId: string, ativo: boolean) {
  const pedir = useServerFn(urlMidiaMensagem);
  const [url, setUrl] = useState<string | null>(() => {
    const c = cacheLinks.get(mensagemId);
    return c && Date.now() - c.em < CACHE_MS ? c.url : null;
  });
  const [estado, setEstado] = useState<"carregando" | "pronto" | "indisponivel">(url ? "pronto" : "carregando");
  useEffect(() => {
    if (!ativo || url) return;
    let cancelado = false;
    pedir({ data: { clinicaId, mensagemId } })
      .then((r) => {
        if (cancelado) return;
        if (r.url) {
          cacheLinks.set(mensagemId, { url: r.url, em: Date.now() });
          setUrl(r.url);
          setEstado("pronto");
        } else setEstado("indisponivel");
      })
      .catch(() => !cancelado && setEstado("indisponivel"));
    return () => {
      cancelado = true;
    };
  }, [ativo, url, pedir, clinicaId, mensagemId]);
  return { url, estado };
}

/** Só busca o link quando a bolha chega perto da tela (conversas longas não disparam dezenas de pedidos). */
function useNaTela() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visivel) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisivel(true);
      return;
    }
    const obs = new IntersectionObserver(
      (itens) => {
        if (itens.some((i) => i.isIntersecting)) {
          setVisivel(true);
          obs.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visivel]);
  return { ref, visivel };
}

/** Imagem (clique para ampliar) ou player de áudio da mensagem, no próprio chat. */
export function MidiaMensagem({ clinicaId, mensagem }: { clinicaId: string; mensagem: MensagemComMidia }) {
  const { ref, visivel } = useNaTela();
  const { url, estado } = useLinkDaMidia(clinicaId, mensagem.id, visivel && temMidiaVisivel(mensagem));
  const [ampliada, setAmpliada] = useState(false);
  if (!temMidiaVisivel(mensagem)) return null;
  const ehImagem = mensagem.tipo === "image";

  return (
    <div ref={ref} className="mb-1" data-testid="midia-mensagem" data-tipo={mensagem.tipo}>
      {estado === "indisponivel" ? (
        <p className="text-xs opacity-70">{ehImagem ? "Imagem indisponível." : "Áudio indisponível."}</p>
      ) : !url ? (
        <div
          className={`animate-pulse rounded-lg bg-black/10 dark:bg-white/10 ${ehImagem ? "h-28 w-44" : "h-9 w-56"}`}
          role="status"
          aria-label={ehImagem ? "Carregando imagem" : "Carregando áudio"}
        />
      ) : ehImagem ? (
        <>
          <button
            type="button"
            onClick={() => setAmpliada(true)}
            className="block overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label="Ampliar imagem enviada pelo paciente"
          >
            <img src={url} alt="Imagem enviada pelo paciente" loading="lazy" className="max-h-60 max-w-full object-cover" />
          </button>
          <Dialog open={ampliada} onOpenChange={setAmpliada}>
            {ampliada && <DialogContent className="max-w-6xl overflow-hidden" onEscapeKeyDown={() => {}}>
              <DialogHeader>
                <DialogTitle>Imagem enviada pelo paciente</DialogTitle>
                <DialogDescription className="sr-only">Visualize a imagem e amplie para ler os detalhes.</DialogDescription>
              </DialogHeader>
              <ImagemMensagemAmpliada key={mensagem.id} url={url} />
            </DialogContent>}
          </Dialog>
        </>
      ) : (
        <audio controls preload="none" src={url} className="h-9 w-56 max-w-full" aria-label="Áudio enviado pelo paciente" />
      )}
    </div>
  );
}
