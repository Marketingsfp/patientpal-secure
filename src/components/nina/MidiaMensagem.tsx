import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImagemMensagemAmpliada } from "./ImagemMensagemAmpliada";
import { urlMidiaMensagem } from "@/lib/atendimento/midia-mensagem.functions";
import { ehCaminhoGuardado, nomeDoDocumento } from "@/lib/whatsapp-midia-armazenamento";
import { protegerMensagemRecebida } from "@/lib/atendimento/links-entrada";
import { AudioMensagem } from "./AudioMensagem";

type MensagemComMidia = {
  id: string;
  tipo?: string | null;
  direction?: string | null;
  body?: string | null;
  transcricao?: string | null;
  media_url?: string | null;
};

const TEXTO_PADRAO_IMAGEM = "📷 Imagem";
const TEXTO_PADRAO_VIDEO = "🎞️ Vídeo";
const TIPOS_COM_MIDIA = ["image", "audio", "document", "video"];

/** A mensagem tem imagem, áudio, documento ou vídeo guardado no sistema, que dá para mostrar? */
export function temMidiaVisivel(m: MensagemComMidia): boolean {
  return TIPOS_COM_MIDIA.includes(String(m.tipo)) && ehCaminhoGuardado(m.media_url);
}

/** Legenda de um documento: o que vem depois de "📎 nome — ". */
function legendaDoDocumento(corpo: string): string {
  const fim = corpo.indexOf(" — ");
  return fim >= 0 ? corpo.slice(fim + 3).trim() : "";
}

/**
 * Texto da bolha: com o arquivo à mostra, o texto padrão ("📷 Imagem", "🎞️ Vídeo", "📎 nome") some;
 * a legenda fica; a transcrição do áudio do paciente tem seu próprio botão.
 */
export function textoDaBolha(m: MensagemComMidia): string {
  if (m.tipo === "audio") return ""; // A transcrição pertence ao player expansível.
  const corpo = String(protegerMensagemRecebida(m).body ?? "");
  if (temMidiaVisivel(m)) {
    if (m.tipo === "image" && corpo === TEXTO_PADRAO_IMAGEM) return "";
    if (m.tipo === "video" && corpo === TEXTO_PADRAO_VIDEO) return "";
    if (m.tipo === "document") return legendaDoDocumento(corpo);
  }
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
  const [estado, setEstado] = useState<"carregando" | "pronto" | "indisponivel">(
    url ? "pronto" : "carregando",
  );
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

const ROTULO_INDISPONIVEL: Record<string, string> = {
  image: "Imagem indisponível.",
  audio: "Áudio indisponível.",
  video: "Vídeo indisponível.",
  document: "Arquivo indisponível.",
};

/** Imagem (clique para ampliar), áudio, vídeo ou arquivo para baixar, no próprio chat. */
export function MidiaMensagem({
  clinicaId,
  mensagem,
}: {
  clinicaId: string;
  mensagem: MensagemComMidia;
}) {
  const { ref, visivel } = useNaTela();
  const { url, estado } = useLinkDaMidia(
    clinicaId,
    mensagem.id,
    visivel && temMidiaVisivel(mensagem),
  );
  const [ampliada, setAmpliada] = useState(false);
  if (mensagem.tipo === "audio")
    return (
      <div ref={ref} className="mb-1" data-testid="midia-mensagem" data-tipo="audio">
        <AudioMensagem
          mensagem={mensagem}
          url={temMidiaVisivel(mensagem) ? url : null}
          carregando={temMidiaVisivel(mensagem) && estado === "carregando"}
        />
      </div>
    );
  if (!temMidiaVisivel(mensagem)) return null;
  const tipo = String(mensagem.tipo);
  const ehImagem = tipo === "image";
  const nomeArquivo = tipo === "document" ? nomeDoDocumento(mensagem.body) || "Documento" : "";

  return (
    <div ref={ref} className="mb-1" data-testid="midia-mensagem" data-tipo={tipo}>
      {estado === "indisponivel" ? (
        <p className="text-xs opacity-70">{ROTULO_INDISPONIVEL[tipo]}</p>
      ) : !url ? (
        <div
          className={`animate-pulse rounded-lg bg-black/10 dark:bg-white/10 ${
            ehImagem || tipo === "video" ? "h-28 w-44" : "h-9 w-56"
          }`}
          role="status"
          aria-label="Carregando arquivo"
        />
      ) : ehImagem ? (
        <>
          <button
            type="button"
            onClick={() => setAmpliada(true)}
            className="block overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label="Ampliar imagem enviada pelo paciente"
          >
            <img
              src={url}
              alt="Imagem enviada pelo paciente"
              loading="lazy"
              className="max-h-60 max-w-full object-cover"
            />
          </button>
          <Dialog open={ampliada} onOpenChange={setAmpliada}>
            {ampliada && (
              <DialogContent className="max-w-6xl overflow-hidden" onEscapeKeyDown={() => {}}>
                <DialogHeader>
                  <DialogTitle>Imagem enviada pelo paciente</DialogTitle>
                  <DialogDescription className="sr-only">
                    Visualize a imagem e amplie para ler os detalhes.
                  </DialogDescription>
                </DialogHeader>
                <ImagemMensagemAmpliada key={mensagem.id} url={url} />
              </DialogContent>
            )}
          </Dialog>
        </>
      ) : tipo === "video" ? (
        <video
          controls
          preload="metadata"
          src={url}
          className="max-h-60 max-w-full rounded-lg"
          aria-label="Vídeo da conversa"
        />
      ) : tipo === "document" ? (
        <a
          href={url}
          download={nomeArquivo}
          rel="noreferrer noopener"
          className="flex items-center gap-2 rounded-lg border border-current/20 px-3 py-2 text-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label={`Baixar arquivo ${nomeArquivo}`}
        >
          <FileText className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 break-all">{nomeArquivo}</span>
        </a>
      ) : (
        <audio
          controls
          preload="none"
          src={url}
          className="h-9 w-56 max-w-full"
          aria-label="Áudio da conversa"
        />
      )}
    </div>
  );
}
