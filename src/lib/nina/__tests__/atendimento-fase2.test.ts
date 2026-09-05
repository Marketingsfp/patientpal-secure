import { describe, it, expect } from "bun:test";
import { detectarIntencoes } from "../atendimento-fase1";
import {
  blocoPromptFase2,
  exigeBaseConhecimento,
  FRASE_SEM_INFORMACAO,
} from "../atendimento-fase2";

describe("quando a planilha precisa ser consultada", () => {
  it("valor exige base", () => expect(exigeBaseConhecimento(detectarIntencoes("Quanto custa Cardiologia?"))).toBe(true));
  it("médico exige base", () => expect(exigeBaseConhecimento(detectarIntencoes("Quais médicos atendem?"))).toBe(true));
  it("preparo exige base", () => expect(exigeBaseConhecimento(detectarIntencoes("Precisa de jejum?"))).toBe(true));
  it("falar com humano não exige base", () =>
    expect(exigeBaseConhecimento(detectarIntencoes("Quero falar com uma atendente"))).toBe(false));
});

describe("bloco de prompt da Fase 2", () => {
  const prompt = (msg: string, baseAtiva = true) =>
    blocoPromptFase2({ intencoes: detectarIntencoes(msg), baseAtiva });

  it("pergunta factual manda consultar a base antes de responder", () => {
    const p = prompt("Quanto custa Cardiologia?");
    expect(p).toContain("consultar_base_conhecimento");
    expect(p).toContain("A mensagem atual é FACTUAL");
  });

  it("proíbe inventar e usar internet", () => {
    const p = prompt("Quanto custa Cardiologia?");
    expect(p).toContain("PROIBIDOS");
    expect(p).toContain(FRASE_SEM_INFORMACAO);
  });

  it("responde primeiro e só depois oferece agendamento", () => {
    const p = prompt("Quanto custa Cardiologia?");
    expect(p).toContain("Responda PRIMEIRO");
    expect(p).toContain("Nunca comece pela oferta");
  });

  it("pede clarificação para nomes parecidos", () => {
    expect(prompt("Quanto custa ultrassonografia?")).toContain("NOMES PARECIDOS");
  });

  it("sem planilha ativa, não inventa e encaminha à equipe", () => {
    const p = prompt("Quanto custa Cardiologia?", false);
    expect(p).toContain("não tem planilha ativa");
    expect(p).toContain("NÃO invente");
    expect(p).not.toContain("CAMINHO OBRIGATÓRIO");
  });
});
