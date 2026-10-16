import { describe, expect, it } from "bun:test";
import { ehMensagemNaoLida, segundaNaoLidaSeguida, TIPOS_NAO_LIDOS } from "../mensagem-nao-lida";
import { MAPA_TEMPLATES } from "../resposta/templates";

describe("mensagem que a Nina não lê", () => {
  it("visualização única/enquete (unsupported), vídeo, localização e contato", () => {
    for (const tipo of ["unsupported", "video", "location", "contacts"])
      expect(ehMensagemNaoLida(tipo)).toBe(true);
    for (const tipo of ["text", "image", "audio", "document", "sticker", "interactive", null])
      expect(ehMensagemNaoLida(tipo)).toBe(false);
  });

  it("a resposta pede para reenviar e não promete atendente", () => {
    const texto = MAPA_TEMPLATES["midia.nao_lida"]!.padrao;
    expect(texto).toContain("Pode me enviar de novo");
    expect(texto).not.toMatch(/atendente/i);
    expect(TIPOS_NAO_LIDOS.size).toBe(4);
  });

  it("segunda ilegível seguida vai para a equipe; primeira só pede reenvio", () => {
    const agora = Date.parse("2026-10-16T14:00:00Z");
    const atual = { tipo: "unsupported", created_at: "2026-10-16T14:00:00Z" };
    expect(segundaNaoLidaSeguida([atual], agora)).toBe(false);
    expect(
      segundaNaoLidaSeguida([atual, { tipo: "text", created_at: "2026-10-16T13:59:00Z" }], agora),
    ).toBe(false);
    expect(
      segundaNaoLidaSeguida([atual, { tipo: "video", created_at: "2026-10-16T13:59:00Z" }], agora),
    ).toBe(true);
    // Muito tempo depois, é um assunto novo: pede reenvio de novo.
    expect(
      segundaNaoLidaSeguida(
        [atual, { tipo: "unsupported", created_at: "2026-10-14T13:59:00Z" }],
        agora,
      ),
    ).toBe(false);
  });
});
