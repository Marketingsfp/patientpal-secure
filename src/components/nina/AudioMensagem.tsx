import { useId, useState } from "react";
import { ChevronDown, ChevronUp, Mic } from "lucide-react";
import { transcricaoDoAudio } from "@/lib/nina/audio";
import { protegerMensagemRecebida } from "@/lib/atendimento/links-entrada";

/** A mesma apresentação para paciente/equipe, histórico e homologação. */
export function AudioMensagem({ mensagem, url, carregando = false }: {
  mensagem: { direction?: string | null; body?: string | null; transcricao?: string | null };
  url: string | null;
  carregando?: boolean;
}) {
  const [expandida, setExpandida] = useState(false);
  const id = useId();
  const texto = transcricaoDoAudio(protegerMensagemRecebida(mensagem));
  const descricao = mensagem.direction === "in" ? "Áudio recebido" : "Áudio enviado";
  return <div className="w-72 max-w-full space-y-2" data-testid="audio-mensagem">
    <div className="flex items-center gap-2 text-xs font-medium opacity-80"><Mic className="h-3.5 w-3.5" aria-hidden="true" />{descricao}</div>
    {url ? <audio controls preload="none" src={url} className="h-10 w-full" aria-label={descricao} />
      : <p className="text-xs opacity-70" role="status">{carregando ? "Carregando áudio…" : "Arquivo de áudio indisponível."}</p>}
    {texto ? <div className="border-t border-current/20 pt-2">
      <p id={id} className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${expandida ? "" : "line-clamp-2"}`}>{texto}</p>
      <button type="button" aria-expanded={expandida} aria-controls={id}
        onClick={() => setExpandida(v => !v)}
        className="mt-1 flex min-h-8 items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2">
        {expandida ? "Recolher transcrição" : "Ver transcrição"}
        {expandida ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
    </div> : <p className="text-xs opacity-70">Transcrição indisponível. Ouça o áudio, se disponível.</p>}
  </div>;
}
