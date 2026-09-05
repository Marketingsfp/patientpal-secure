import { describe, it, expect } from "bun:test";
import {
  selectThinkingLevel,
  escalonar,
  nivelNaoRegride,
  rotuloDebug,
} from "../reasoning-router";

const nivel = (mensagem: string, extra = {}) =>
  selectThinkingLevel({ mensagem, temFerramentas: true, ...extra }).nivel;

describe("Reasoning Router — LOW", () => {
  it("endereço é LOW", () => expect(nivel("Qual o endereço?")).toBe("low"));
  it("valor é LOW", () => expect(nivel("Quanto custa Cardiologia?")).toBe("low"));
  it("saudação é LOW", () => expect(nivel("Oi, bom dia!")).toBe("low"));
  it("documentos é LOW", () => expect(nivel("Quais documentos preciso levar?")).toBe("low"));
  it("pagamento é LOW", () => expect(nivel("Aceitam pix ou cartão?")).toBe("low"));
  it("mensagem longa sem agenda continua LOW", () =>
    expect(nivel("Boa tarde, ".repeat(40) + "qual o endereço da clínica?")).toBe("low"));
});

describe("Reasoning Router — MEDIUM", () => {
  it("agenda simples é MEDIUM", () =>
    expect(nivel("Quero cardiologista sábado de manhã.")).toBe("medium"));
  it("múltiplas restrições de agenda é MEDIUM", () =>
    expect(nivel("Pode ser Dr. A ou Dra. B, sábado ou segunda depois das 14h.")).toBe("medium"));
  it("cancelamento é MEDIUM", () => expect(nivel("Preciso cancelar minha consulta")).toBe("medium"));
  it("etapa com ferramenta já executada é MEDIUM", () =>
    expect(nivel("obrigado", { rodada: 1, ferramentasExecutadas: 1 })).toBe("medium"));
});

describe("Reasoning Router — HIGH (raro)", () => {
  it("conflito de ferramenta sobe para HIGH", () =>
    expect(nivel("Quero sábado", { houveConflito: true })).toBe("high"));
  it("várias ferramentas interdependentes sobe para HIGH", () =>
    expect(
      nivel("Quero sábado", {
        rodada: 2,
        ferramentasExecutadas: 2,
        nomesFerramentas: ["disponibilidade", "buscar_paciente"],
      }),
    ).toBe("high"));
  it("pergunta clínica fora de escopo NÃO vira HIGH", () =>
    expect(nivel("Estou com dor no peito, o que devo tomar?")).not.toBe("high"));
});

describe("Escalonamento", () => {
  it("LOW → MEDIUM → HIGH e para em HIGH", () => {
    expect(escalonar("low")).toBe("medium");
    expect(escalonar("medium")).toBe("high");
    expect(escalonar("high")).toBe("high");
  });
  it("não regride dentro do mesmo turno", () =>
    expect(nivelNaoRegride("low", "medium")).toBe("medium"));
  it("nova mensagem depois de HIGH volta para LOW", () =>
    expect(nivel("Qual o endereço?")).toBe("low"));
});

describe("Debug interno", () => {
  it("rotula modelo e nível", () =>
    expect(rotuloDebug("google/gemini-3.6-flash", "medium")).toBe(
      "Model: google/gemini-3.6-flash | Reasoning: MEDIUM",
    ));
});
