import { describe, expect, it } from "bun:test";
import { mensagemErroGateway } from "../adapters/gemini-adapter.server";
import { MODELO_NINA_ALVO, modeloNinaParaClinica } from "../modelo-flag.server";

describe("Nina AI Gateway — modelo único", () => {
  it("não inventa model id: usa exatamente o pedido", () => {
    expect(MODELO_NINA_ALVO).toBe("google/gemini-3.8-flash");
  });

  it("todas as clínicas e perfis usam o Gemini 3.8, sem volta ao 2.5", async () => {
    for (const clinica of ["clinica-com-flag", "clinica-nova-sem-linha", null])
      for (const perfil of ["texto", "whatsapp", "voz"] as const) {
        const r = await modeloNinaParaClinica(clinica, perfil);
        expect(r.modelo).toBe("google/gemini-3.8-flash");
        expect(r.origem).toBe("fixo");
      }
  });

  it("traduz erros do provedor em português", () => {
    expect(mensagemErroGateway(429)).toContain("Limite de uso");
    expect(mensagemErroGateway(402)).toContain("Créditos");
    expect(mensagemErroGateway(500)).toContain("Falha na resposta da Nina");
  });
});
