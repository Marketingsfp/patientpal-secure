import { describe, expect, it } from "bun:test";
import { mensagemErroGateway } from "../adapters/gemini-adapter.server";
import {
  FLAG_NINA_GEMINI,
  MODELO_ALVO_DISPONIVEL,
  MODELO_ATUAL,
  MODELO_NINA_ALVO,
} from "../modelo-flag.server";

describe("Nina AI Gateway — modelo e flag", () => {
  it("mantém o nome da flag combinada com o time", () => {
    expect(FLAG_NINA_GEMINI).toBe("nina_gemini_37_enabled");
  });

  it("não inventa model id: usa exatamente o pedido", () => {
    expect(MODELO_NINA_ALVO).toBe("google/gemini-3.7-flash");
  });

  it("registra que o modelo alvo está publicado pelo provedor", () => {
    expect(MODELO_ALVO_DISPONIVEL).toBe(true);
  });

  it("preserva os modelos atuais por perfil (rollback imediato)", () => {
    expect(MODELO_ATUAL.texto).toBe("google/gemini-2.5-flash");
    expect(MODELO_ATUAL.whatsapp).toBe("google/gemini-2.5-flash");
    expect(MODELO_ATUAL.voz).toBe("google/gemini-3.1-flash-lite");
  });

  it("traduz erros do provedor em português", () => {
    expect(mensagemErroGateway(429)).toContain("Limite de uso");
    expect(mensagemErroGateway(402)).toContain("Créditos");
    expect(mensagemErroGateway(500)).toContain("Falha na resposta da Nina");
  });
});
