import { expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { deveResponderEmAudio, transcricaoDoAudio } from "../audio";
import { AudioMensagem } from "@/components/nina/AudioMensagem";
import { agruparTurnoPersistido } from "../agrupamento-turno";

it("preserva áudio no lote mesmo quando a última mensagem é texto", async () => {
  const turno = await agruparTurnoPersistido(
    { clinicaId: "clinica", telefone: "123", mensagemId: "m2", textoAtual: "amanhã" },
    {
      registrar: async () => ({ batchId: "lote", revision: 1, primeiraMs: 0 }),
      adquirir: async () => ({ chave: "lote", token: "reserva" }),
      validarConversa: async () => true,
      reivindicar: async () => ["m1", "m2"],
      lerMensagens: async () => [
        { id: "m1", tipo: "audio", texto: "Quero cardiologista" },
        { id: "m2", tipo: "text", texto: "amanhã" },
      ],
      lerRevisao: async () => 1,
      iniciar: async () => true,
      concluir: async () => {},
      liberar: async () => {},
      esperar: async () => {},
      agora: () => 10000,
    },
  );
  expect(turno?.recebeuAudio).toBe(true);
  expect(turno?.texto).toContain("Quero cardiologista");
  expect(turno?.texto).toContain("amanhã");
  expect(deveResponderEmAudio({ recebeuAudio: turno!.recebeuAudio!, mensagem: turno!.texto })).toBe(
    true,
  );
});

for (const mensagem of [
  "Pode responder em áudio?",
  "Me manda um audio por favor",
  "Quero ouvir a resposta",
  "Pode enviar uma mensagem de voz?",
  "Prefiro áudio",
  "Não consigo ler, mande em áudio",
])
  it(`atende pedido explícito: ${mensagem}`, () =>
    expect(deveResponderEmAudio({ mensagem, recebeuAudio: false })).toBe(true));
for (const mensagem of [
  "Não me mande áudio",
  "Prefiro por escrito",
  "Responda em texto",
  "Sem áudio, por favor",
])
  it(`texto prevalece sobre áudio recebido: ${mensagem}`, () =>
    expect(deveResponderEmAudio({ mensagem, recebeuAudio: true })).toBe(false));
it("responde falando ao áudio, mas não confunde audiometria ou menção de áudio com pedido", () => {
  expect(deveResponderEmAudio({ mensagem: "Quanto custa?", recebeuAudio: true })).toBe(true);
  for (const mensagem of [
    "Quero audiometria",
    "Não ouvi o áudio",
    "Quanto custa?",
    "Tem áudio no sistema?",
  ])
    expect(deveResponderEmAudio({ mensagem, recebeuAudio: false })).toBe(false);
});
it("transcrição legada remove marcador, não inventa fala para arquivo inaudível", () => {
  expect(transcricaoDoAudio({ body: "🎤 Bom dia" })).toBe("Bom dia");
  expect(transcricaoDoAudio({ body: "🎤 [áudio não transcrito]" })).toBe("");
  expect(transcricaoDoAudio({ body: "corpo", transcricao: "Fala real" })).toBe("Fala real");
});
for (const direction of ["in", "out"])
  it(`player e prévia expansível no áudio ${direction}`, () => {
    const html = renderToStaticMarkup(
      <AudioMensagem
        mensagem={{ direction, transcricao: "Quero uma consulta." }}
        url="/audio.ogg"
      />,
    );
    expect(html).toContain("<audio");
    expect(html).toContain(direction === "in" ? "Áudio recebido" : "Áudio enviado");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Ver transcrição");
    expect(html).toContain("Quero uma consulta.");
  });
it("arquivo ausente mantém a transcrição e bloqueio de links recebidos", () => {
  const html = renderToStaticMarkup(
    <AudioMensagem
      mensagem={{ direction: "in", transcricao: "Veja https://exemplo.com" }}
      url={null}
    />,
  );
  expect(html).toContain("Arquivo de áudio indisponível");
  expect(html).toContain("[link bloqueado]");
  expect(html).not.toContain("https://exemplo.com");
});
