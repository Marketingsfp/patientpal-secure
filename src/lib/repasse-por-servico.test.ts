/**
 * Testes do plano que copia o repasse "por serviço" da planilha para a grade
 * de cada médico. O que não pode quebrar: acordo existente nunca é
 * sobrescrito (nem o 0 digitado de propósito), e linha em branco é preenchida.
 */
import { describe, expect, it } from "bun:test";

import {
  camposDaGrade,
  linhaEmBranco,
  planejarRepasseServicos,
  type LinhaGradeExistente,
} from "./repasse-por-servico";

const vazia = (id: string, medicoId: string, nome: string): LinhaGradeExistente => ({
  id,
  medicoId,
  nome,
  percentual: null,
  valor: null,
  convenio_percentual: null,
  convenio_valor: null,
  cartao_consulta_valor: null,
  cartao_desconto_valor: null,
});

describe("plano de repasse por serviço", () => {
  const regras = [
    {
      procedimentoId: "p-consulta",
      procedimentoNome: "CONSULTA UROLOGIA",
      repasse: { tipo: "valor" as const, valor: 60 },
    },
    {
      procedimentoId: "p-usg",
      procedimentoNome: "USG PÉLVICA",
      repasse: { tipo: "percentual" as const, valor: 40 },
    },
    {
      procedimentoId: "p-sem",
      procedimentoNome: "RESTAURAÇÃO",
      repasse: { tipo: "valor" as const, valor: 80 },
    },
  ];
  const vinculos = [
    { medicoId: "m1", medicoNome: "ANA", procedimentoId: "p-consulta" },
    { medicoId: "m1", medicoNome: "ANA", procedimentoId: "p-consulta" },
    { medicoId: "m2", medicoNome: "BRUNO", procedimentoId: "p-consulta" },
    { medicoId: "m3", medicoNome: "CARLA", procedimentoId: "p-consulta" },
    { medicoId: "m1", medicoNome: "ANA", procedimentoId: "p-usg" },
  ];

  it("cria, preenche linha em branco e mantém qualquer acordo — inclusive zero", () => {
    const grade = [
      { ...vazia("g1", "m2", "consulta urologia") },
      { ...vazia("g2", "m3", "CONSULTA UROLOGIA"), valor: 0 },
      { ...vazia("g3", "m1", "USG PELVICA (GINECOLOGIA)"), percentual: 50 },
      { ...vazia("g4", "m1", "USG PÉLVICA"), cartao_consulta_valor: 20 },
    ];
    const p = planejarRepasseServicos(regras, vinculos, grade);

    expect(p.inserir.map((i) => `${i.medicoNome}|${i.procedimentoNome}`)).toEqual([
      "ANA|CONSULTA UROLOGIA",
    ]);
    expect(p.atualizar.map((i) => i.linhaId)).toEqual(["g1"]);
    expect(p.mantidos.map((m) => `${m.medicoNome}|${m.procedimentoNome}|${m.atual}`)).toEqual([
      "ANA|USG PÉLVICA|cartão consulta",
      "CARLA|CONSULTA UROLOGIA|R$ 0,00",
    ]);
    expect(p.semMedico).toEqual(["RESTAURAÇÃO"]);
  });

  it("linha em branco só quando nenhuma coluna tem número", () => {
    expect(linhaEmBranco(vazia("a", "m", "x"))).toBe(true);
    expect(linhaEmBranco({ ...vazia("a", "m", "x"), convenio_valor: 0 })).toBe(false);
  });

  it("grava só a coluna Particular, no tipo da planilha", () => {
    expect(camposDaGrade({ tipo: "valor", valor: 60 })).toEqual({
      tipo_repasse: "valor",
      percentual: null,
      valor: 60,
    });
    expect(camposDaGrade({ tipo: "percentual", valor: 40 })).toEqual({
      tipo_repasse: "percentual",
      percentual: 40,
      valor: null,
    });
  });
});
