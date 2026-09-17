import { describe, expect, it } from "bun:test";
import {
  montarOpcoesProfissional,
  rotuloProfissionalAgenda,
} from "@/lib/agenda/opcoes-profissional";

const medicos = [
  { id: "m1", nome: "ANTONIO CARLOS SIQUEIRA COBUCCI" },
  { id: "m2", nome: "DRA MARIA" },
];
const agendasPorMedico = new Map([
  [
    "m1",
    [
      { id: "a1", nome: "CONSULTAS" },
      { id: "a2", nome: "TESTE ERGOMETRICO" },
    ],
  ],
  ["m2", [{ id: "a3", nome: "CONSULTAS" }]],
]);
const comGrade = new Set(["a1", "a2", "a3"]);

describe("opções do seletor PROFISSIONAL", () => {
  it("desdobra em NOME — AGENDA só quem tem mais de uma agenda ativa", () => {
    const { opcoes } = montarOpcoesProfissional({
      medicos,
      agendasPorMedico,
      agendasComGrade: comGrade,
    });
    expect(opcoes.map((o) => o.rotulo)).toEqual([
      "ANTONIO CARLOS SIQUEIRA COBUCCI — CONSULTAS",
      "ANTONIO CARLOS SIQUEIRA COBUCCI — TESTE ERGOMETRICO",
      "DRA MARIA",
    ]);
  });

  it("agenda sem grade não vira entrada própria", () => {
    const { opcoes } = montarOpcoesProfissional({
      medicos,
      agendasPorMedico,
      agendasComGrade: new Set(["a1", "a3"]),
    });
    expect(opcoes.map((o) => o.rotulo)).toEqual(["ANTONIO CARLOS SIQUEIRA COBUCCI", "DRA MARIA"]);
  });

  it("rótulo de um lançamento usa a agenda do atendimento", () => {
    const { opcoes, rotuloMedico } = montarOpcoesProfissional({
      medicos,
      agendasPorMedico,
      agendasComGrade: comGrade,
    });
    expect(rotuloProfissionalAgenda(opcoes, rotuloMedico, "m1", "teste ergometrico")).toBe(
      "ANTONIO CARLOS SIQUEIRA COBUCCI — TESTE ERGOMETRICO",
    );
    // Sem agenda conhecida cai no nome limpo, sem inventar sufixo.
    expect(rotuloProfissionalAgenda(opcoes, rotuloMedico, "m1", null)).toBe(
      "ANTONIO CARLOS SIQUEIRA COBUCCI",
    );
    expect(rotuloProfissionalAgenda(opcoes, rotuloMedico, "m2", "CONSULTAS")).toBe("DRA MARIA");
  });
});
