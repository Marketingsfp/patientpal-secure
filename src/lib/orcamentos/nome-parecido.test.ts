import { describe, expect, it } from "bun:test";
import {
  chaveFonetica,
  pacientesComNomeParecido,
  semelhancaNome,
  termosParaBuscaParecida,
} from "./nome-parecido";

// Nomes fictícios.
const cadastro = [
  { id: "1", nome: "QUEDIMA TESTE DAS SOARES E SILVA" },
  { id: "2", nome: "PACIENTE TESTE SOARES" },
  { id: "3", nome: "MARIA TESTE DA SILVA" },
];

describe("pacientesComNomeParecido", () => {
  it("acha o cadastro quando a letra cursiva vira outra vogal e o sobrenome vem abreviado", () => {
    const r = pacientesComNomeParecido("QUAIDIMA TESTE DAS S. SOARES E", cadastro);
    expect(r.map((p) => p.id)).toEqual(["1"]);
  });

  it("não sugere quem só divide sobrenomes com o nome lido", () => {
    expect(pacientesComNomeParecido("QUAIDIMA SOARES SILVA", [cadastro[1], cadastro[2]])).toEqual(
      [],
    );
  });

  it("grafias que soam igual contam como iguais", () => {
    expect(semelhancaNome("KELLY CRISTINA SOUSA", "KELI CRISTINA SOUZA")).toBeGreaterThan(0.9);
    expect(chaveFonetica("thaynna")).toBe(chaveFonetica("taina"));
  });

  it("mais parecido vem primeiro e repetidos saem", () => {
    const r = pacientesComNomeParecido("MARIA TESTE SILVA", [
      { id: "a", nome: "MARIANA TESTE SILVA" },
      { id: "b", nome: "MARIA TESTE DA SILVA" },
      { id: "b", nome: "MARIA TESTE DA SILVA" },
    ]);
    expect(r.map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("termosParaBuscaParecida", () => {
  it("usa as palavras longas, sem partículas nem abreviações", () => {
    expect(termosParaBuscaParecida("QUAIDIMA TESTE DAS S. SOARES E")).toEqual([
      "quaidima",
      "soares",
      "teste",
    ]);
  });
});
