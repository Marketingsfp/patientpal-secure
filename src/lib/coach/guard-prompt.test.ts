/**
 * Testes das regras de prompt e de custo do Coach:
 * - a base nunca vai inteira para a IA (teto de caracteres);
 * - os tokens informados pelo gateway viram custo aproximado.
 */
import { describe, expect, it } from "bun:test";
import {
  baseParaPrompt,
  custoEstimado,
  scriptsEmTexto,
  tokensDaResposta,
  type ConfigCoachServidor,
} from "./guard.server";

function baseLonga(): string {
  const bloco = (n: number) =>
    `## Exame ${n}\nUltrassom ${n} — preparo, valor R$ ${100 + n},00 e orientações. ${"detalhe ".repeat(30)}`;
  return ["CLÍNICA EXEMPLO", ...Array.from({ length: 60 }, (_, i) => bloco(i))].join("\n\n");
}

function configFake(): ConfigCoachServidor {
  return {
    tabela: [],
    scripts: [],
    checklist: [],
    complemento: "Observação da clínica.",
    base: baseLonga(),
    limiteUsuario: 60,
    limiteClinica: 600,
    reterAudioDias: 30,
  } as unknown as ConfigCoachServidor;
}

describe("recorte da base", () => {
  it("respeita o teto de caracteres do treino", () => {
    const texto = baseParaPrompt(configFake(), "ultrassom", 10_000);
    expect(texto.length).toBeLessThanOrEqual(10_000);
  });

  it("um teto menor gera um texto menor ou igual", () => {
    const cfg = configFake();
    const curto = baseParaPrompt(cfg, "ultrassom", 2_000);
    const longo = baseParaPrompt(cfg, "ultrassom", 20_000);
    expect(curto.length).toBeLessThanOrEqual(2_000);
    expect(curto.length).toBeLessThanOrEqual(longo.length);
  });
});

describe("custo e tokens", () => {
  it("lê os tokens do gateway e ignora formato inesperado", () => {
    expect(tokensDaResposta({ usage: { prompt_tokens: 100, completion_tokens: 50 } })).toEqual({
      tokensIn: 100,
      tokensOut: 50,
    });
    expect(tokensDaResposta(null)).toEqual({ tokensIn: 0, tokensOut: 0 });
  });

  it("calcula custo aproximado positivo e proporcional", () => {
    const a = custoEstimado(1_000_000, 0);
    const b = custoEstimado(2_000_000, 0);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeCloseTo(a * 2, 6);
    expect(custoEstimado(0, 0)).toBe(0);
  });
});

describe("scripts no prompt", () => {
  it("numera e mantém os títulos", () => {
    const texto = scriptsEmTexto([
      { titulo: "Abertura", conteudo: " Olá " },
      { titulo: "", conteudo: "Fechamento" },
    ]);
    expect(texto).toContain("Script 1 — Abertura");
    expect(texto).toContain("Script 2 — Sem título");
    expect(texto).toContain("Olá");
  });
});
