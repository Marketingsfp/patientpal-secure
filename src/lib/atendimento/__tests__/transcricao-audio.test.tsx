import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TranscricaoAudioMensagem, transcricaoDoAudioPaciente } from "@/components/nina/TranscricaoAudioMensagem";
import { textoDaBolha } from "@/components/nina/MidiaMensagem";

describe("transcrição do áudio do paciente", () => {
  const mensagem = { id: "audio-1", tipo: "audio", direction: "in", body: "🎤 Texto antigo", transcricao: "Texto transcrito" };

  it("usa a transcrição salva e começa completamente recolhida", () => {
    expect(transcricaoDoAudioPaciente(mensagem)).toBe("Texto transcrito");
    const html = renderToStaticMarkup(<TranscricaoAudioMensagem mensagem={mensagem} />);
    expect(html).toContain("Mostrar transcrição");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Texto transcrito");
    expect(textoDaBolha(mensagem)).toBe("");
  });

  it("reutiliza a transcrição antiga do corpo mesmo sem arquivo disponível", () => {
    expect(transcricaoDoAudioPaciente({ ...mensagem, transcricao: null })).toBe("Texto antigo");
    expect(textoDaBolha({ ...mensagem, media_url: null })).toBe("");
  });

  it("informa indisponibilidade sem oferecer botão para abrir texto vazio", () => {
    const semTexto = { ...mensagem, transcricao: null, body: "🎤 [áudio não transcrito]" };
    expect(transcricaoDoAudioPaciente(semTexto)).toBeNull();
    const html = renderToStaticMarkup(<TranscricaoAudioMensagem mensagem={semTexto} />);
    expect(html).toContain("Transcrição indisponível.");
    expect(html).not.toContain("<button");
  });

  it("preserva áudios enviados pela Nina e mensagens de outros tipos", () => {
    const enviada = { ...mensagem, direction: "out" };
    expect(transcricaoDoAudioPaciente(enviada)).toBeNull();
    expect(textoDaBolha(enviada)).toBe("🎤 Texto antigo");
    expect(renderToStaticMarkup(<TranscricaoAudioMensagem mensagem={enviada} />)).toBe("");
    expect(transcricaoDoAudioPaciente({ ...mensagem, tipo: "image" })).toBeNull();
  });
});
