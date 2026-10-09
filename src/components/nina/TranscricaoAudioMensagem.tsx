import { useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type MensagemAudio = {
  tipo?: string | null;
  direction?: string | null;
  body?: string | null;
  transcricao?: string | null;
};

/** Áudios antigos também guardavam a transcrição no corpo, depois de 🎤. */
export function transcricaoDoAudioPaciente(mensagem: MensagemAudio): string | null {
  if (mensagem.tipo !== "audio" || mensagem.direction !== "in") return null;
  const texto = mensagem.transcricao?.trim() ||
    (mensagem.body ?? "").replace(/^🎤\s*/, "").trim();
  if (!texto || /^\[.*\]$/.test(texto)) return null;
  return texto;
}

export function TranscricaoAudioMensagem({ mensagem }: { mensagem: MensagemAudio }) {
  const [aberta, setAberta] = useState(false);
  const id = useId();
  const texto = transcricaoDoAudioPaciente(mensagem);
  if (mensagem.tipo !== "audio" || mensagem.direction !== "in") return null;
  if (!texto) {
    return <p className="mt-1 text-xs opacity-70">Transcrição indisponível.</p>;
  }
  const Icone = aberta ? ChevronUp : ChevronDown;
  return (
    <div className="mt-1">
      <button
        type="button"
        className="flex items-center gap-1 py-1 text-xs underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-expanded={aberta}
        aria-controls={id}
        onClick={() => setAberta((valor) => !valor)}
      >
        <Icone className="h-3.5 w-3.5" aria-hidden />
        {aberta ? "Ocultar transcrição" : "Mostrar transcrição"}
      </button>
      <div id={id} hidden={!aberta}>
        {aberta && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{texto}</p>}
      </div>
    </div>
  );
}
