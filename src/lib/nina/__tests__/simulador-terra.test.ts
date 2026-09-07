import { describe, expect, it } from "bun:test";
import {
  LIMITES_MAXIMOS,
  MARCADOR_FIM,
  PERSONA_PADRAO,
  montarInputTerra,
  montarInstrucoesTerra,
  normalizarLimites,
  pediuFim,
  podeContinuar,
  sanitizarMensagemPaciente,
  LIMITES_PADRAO,
} from "@/lib/nina/simulador-terra";

describe("limites da simulação", () => {
  it("aplica padrões e tetos", () => {
    expect(normalizarLimites(undefined)).toEqual(LIMITES_PADRAO);
    const l = normalizarLimites({ maxTurnos: 9999, maxDuracaoS: 1, maxTokens: 10, timeoutS: 9999 });
    expect(l.maxTurnos).toBe(LIMITES_MAXIMOS.maxTurnos);
    expect(l.maxDuracaoS).toBe(30);
    expect(l.maxTokens).toBe(500);
    expect(l.timeoutS).toBe(LIMITES_MAXIMOS.timeoutS);
  });

  it("nunca deixa loop infinito: para por turnos, duração ou tokens", () => {
    const base = {
      status: "executando",
      turnos: 0,
      inputTokens: 0,
      outputTokens: 0,
      iniciadaEm: 1000,
      limites: normalizarLimites({ maxTurnos: 3, maxDuracaoS: 60, maxTokens: 1000 }),
    };
    expect(podeContinuar(base, 1000)).toEqual({ ok: true });
    expect(podeContinuar({ ...base, turnos: 3 }, 1000)).toEqual({
      ok: false,
      motivo: "limite_turnos",
    });
    expect(podeContinuar(base, 1000 + 60_000)).toEqual({ ok: false, motivo: "limite_duracao" });
    expect(podeContinuar({ ...base, outputTokens: 1000 }, 1000)).toEqual({
      ok: false,
      motivo: "limite_tokens",
    });
    expect(podeContinuar({ ...base, status: "parada" }, 1000)).toEqual({
      ok: false,
      motivo: "operador",
    });
  });
});

describe("instruções do paciente simulado", () => {
  const texto = montarInstrucoesTerra(
    "Paciente quer marcar cardiologista.",
    { ...PERSONA_PADRAO, estilo: "confuso", errosDigitacao: true },
    LIMITES_PADRAO,
  );

  it("descreve o papel de paciente e o cenário", () => {
    expect(texto).toContain("PACIENTE");
    expect(texto).toContain("Paciente quer marcar cardiologista.");
    expect(texto).toContain("erros leves de digitação");
    expect(texto).toContain(MARCADOR_FIM);
  });

  it("não vaza prompt da Nina, avaliação nem raciocínio", () => {
    expect(texto.toLowerCase()).not.toContain("prompt principal");
    expect(texto.toLowerCase()).not.toContain("gpt-5.6-sol");
    expect(texto.toLowerCase()).not.toContain("avaliador");
    expect(texto).toContain("nunca avalia");
  });
});

describe("histórico visto pelo paciente", () => {
  it("mapeia papéis invertidos e usa placeholder no início", () => {
    expect(montarInputTerra([])).toHaveLength(1);
    const itens = montarInputTerra([
      { autor: "paciente", texto: "oi" },
      { autor: "nina", texto: "olá, como posso ajudar?" },
    ]) as any[];
    expect(itens[0].role).toBe("assistant");
    expect(itens[0].content[0].type).toBe("output_text");
    expect(itens[1].role).toBe("user");
    expect(itens[1].content[0].type).toBe("input_text");
  });
});

describe("saneamento da mensagem", () => {
  it("vira uma linha simples", () => {
    expect(sanitizarMensagemPaciente("- **Oi**\n\nquero marcar")).toBe("Oi quero marcar");
    expect(sanitizarMensagemPaciente("a".repeat(900)).length).toBe(500);
  });

  it("reconhece o pedido de fim", () => {
    expect(pediuFim(" [fim] ")).toBe(true);
    expect(pediuFim("obrigado")).toBe(false);
  });
});
