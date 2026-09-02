import { describe, expect, it } from "bun:test";
import { erroCodigoProntuario, prontuarioExibicao } from "./prontuario";

// A importação do sistema antigo (junho/2026) gravou a numeração histórica em
// `codigo_prontuario_anterior` e criou um número interno novo em
// `codigo_prontuario`. Em 241.261 dos 252.062 pacientes os dois são
// diferentes, e a recepção precisa ver o histórico — é ele que está na ficha
// de papel. Estes testes travam essa ordem de preferência para que uma
// refatoração futura não volte a exibir o número interno.

describe("prontuarioExibicao", () => {
  it("prefere a numeração histórica do sistema antigo", () => {
    expect(
      prontuarioExibicao({ codigo_prontuario: "2435051", codigo_prontuario_anterior: "01234" }),
    ).toBe("01234");
  });

  it("cai no número interno quando o paciente não veio da importação", () => {
    expect(
      prontuarioExibicao({ codigo_prontuario: "2435051", codigo_prontuario_anterior: null }),
    ).toBe("2435051");
  });

  it("trata histórico em branco como ausente", () => {
    expect(
      prontuarioExibicao({ codigo_prontuario: "2435051", codigo_prontuario_anterior: "   " }),
    ).toBe("2435051");
  });

  it("remove espaços em volta do número exibido", () => {
    expect(prontuarioExibicao({ codigo_prontuario_anterior: " 01234 " })).toBe("01234");
  });

  it("devolve null quando não há nenhum número", () => {
    expect(prontuarioExibicao({ codigo_prontuario: null, codigo_prontuario_anterior: null })).toBe(
      null,
    );
    expect(prontuarioExibicao({ codigo_prontuario: "", codigo_prontuario_anterior: "" })).toBe(
      null,
    );
  });

  it("aceita paciente ainda não carregado", () => {
    expect(prontuarioExibicao(null)).toBe(null);
    expect(prontuarioExibicao(undefined)).toBe(null);
  });
});

// Em 19/08/2026 alguém digitou 24378101 no cadastro de um paciente — o
// prontuário 2437810 de outra paciente com um dígito a mais. Como o número
// automático é calculado a partir do maior número da clínica, os 415 cadastros
// seguintes nasceram na faixa dos 8 dígitos, fora da régua do sistema antigo.
// Estes testes travam a recusa na origem, para o erro de digitação não voltar a
// arrastar a numeração inteira.

describe("erroCodigoProntuario", () => {
  it("aceita número dentro da régua de 7 dígitos", () => {
    expect(erroCodigoProntuario("2656813")).toBeNull();
  });

  it("recusa número com 8 dígitos", () => {
    expect(erroCodigoProntuario("24378101")).toContain("7 dígitos");
  });

  it("aceita campo vazio, que faz o banco gerar o número", () => {
    expect(erroCodigoProntuario("")).toBeNull();
    expect(erroCodigoProntuario(null)).toBeNull();
    expect(erroCodigoProntuario(undefined)).toBeNull();
  });

  it("não mexe em código antigo com letra, que continua válido", () => {
    expect(erroCodigoProntuario("AB12345678")).toBeNull();
  });

  it("ignora espaços em volta antes de contar os dígitos", () => {
    expect(erroCodigoProntuario("  2656813  ")).toBeNull();
  });
});
