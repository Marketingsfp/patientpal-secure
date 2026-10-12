import { describe, expect, it } from "bun:test";
import { corrigirSaudacaoDoPeriodo, regraSaudacaoPeriodo } from "../resposta/saudacao-periodo";

// Instantes reais do servidor; as horas são de Brasília (UTC-3).
const manha = new Date("2026-10-11T12:30:00Z"); // 09:30
const tarde = new Date("2026-10-11T18:00:00Z"); // 15:00
const noite = new Date("2026-10-11T22:08:00Z"); // 19:08
const madrugada = new Date("2026-10-12T06:59:00Z"); // 03:59

describe("cumprimento de abertura pelo horário real do servidor", () => {
  it("corrige o caso real da homologação: 'bom dia' às 19:08 vira 'boa noite'", () => {
    const texto =
      "Olá, bom dia!\nEu sou a Maria, eu sou inteligência artificial da Policlínica Menino Jesus.\nComo posso ajudar você hoje?";
    expect(corrigirSaudacaoDoPeriodo(texto, noite)).toBe(
      "Olá, boa noite!\nEu sou a Maria, eu sou inteligência artificial da Policlínica Menino Jesus.\nComo posso ajudar você hoje?",
    );
  });

  it("mantém maiúsculas e pontuação do original", () => {
    expect(corrigirSaudacaoDoPeriodo("Bom dia! Como posso ajudar?", tarde)).toBe(
      "Boa tarde! Como posso ajudar?",
    );
    expect(corrigirSaudacaoDoPeriodo("*Boa noite*, tudo bem?", manha)).toBe("*Bom dia*, tudo bem?");
    expect(corrigirSaudacaoDoPeriodo("BOA TARDE!", manha)).toBe("BOM DIA!");
    expect(corrigirSaudacaoDoPeriodo("Oi! boa tarde.", madrugada)).toBe("Oi! boa noite.");
  });

  it("não altera quando o cumprimento já está certo", () => {
    const texto = "Boa noite! Me chamo Maria e eu sou inteligência artificial da Policlínica.";
    expect(corrigirSaudacaoDoPeriodo(texto, noite)).toBe(texto);
  });

  it("não mexe em mensagens sem cumprimento de abertura nem em frases no meio do texto", () => {
    const semAbertura = "Seu agendamento foi realizado. Tenha um bom dia!";
    expect(corrigirSaudacaoDoPeriodo(semAbertura, noite)).toBe(semAbertura);
    const palavraParecida = "Boa noitada de sexta? Não temos atendimento.";
    expect(corrigirSaudacaoDoPeriodo(palavraParecida, manha)).toBe(palavraParecida);
    expect(corrigirSaudacaoDoPeriodo("", noite)).toBe("");
  });

  it("respeita os limites dos períodos", () => {
    expect(corrigirSaudacaoDoPeriodo("Boa noite!", new Date("2026-10-11T08:00:00Z"))).toBe(
      "Bom dia!",
    ); // 05:00
    expect(corrigirSaudacaoDoPeriodo("Bom dia!", new Date("2026-10-11T15:00:00Z"))).toBe(
      "Boa tarde!",
    ); // 12:00
    expect(corrigirSaudacaoDoPeriodo("Boa tarde!", new Date("2026-10-11T21:00:00Z"))).toBe(
      "Boa noite!",
    ); // 18:00
  });
});

describe("regra do turno", () => {
  it("informa a saudação exata e manda ignorar o cumprimento de outro período", () => {
    const regra = regraSaudacaoPeriodo("Boa noite");
    expect(regra).toContain('use exatamente "Boa noite"');
    expect(regra).toContain("horário de Brasília");
    expect(regra).toContain('responda "Boa noite"');
  });
});
