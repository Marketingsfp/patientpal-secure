import { describe, expect, test } from "bun:test";
import {
  especialidadeAplicavel,
  estadoEspecialidade,
  opcoesCatalogo,
  perguntaEspecialidade,
} from "../jev-especialidade";

const SERVICOS = [{ nome: "USG ABDOMEN" }, { nome: "usg abdomen" }, { nome: "Ultrassonografía de tireoide" }];
const PROFISSIONAIS = [{ especialidades: [{ nome: "ODONTOLOGIA" }, { nome: "PNEUMOLOGIA" }] }, { especialidades: null }];

describe("Jev Fase 3 — especialidade", () => {
  const opcoes = opcoesCatalogo(SERVICOS, PROFISSIONAIS);

  test("sem tipo definido: junta especialidades e serviços sem repetir", () => {
    expect(opcoes).toEqual(["ODONTOLOGIA", "PNEUMOLOGIA", "USG ABDOMEN", "Ultrassonografía de tireoide"]);
    expect(Object.keys((perguntaEspecialidade(opcoes).especialidade as any).criteria)).toContain("nenhuma");
  });

  test("mesmo recorte da busca normal: consulta só especialidades; exame só serviços", () => {
    expect(opcoesCatalogo(SERVICOS, PROFISSIONAIS, "consulta")).toEqual(["ODONTOLOGIA", "PNEUMOLOGIA"]);
    expect(opcoesCatalogo(SERVICOS, PROFISSIONAIS, "exame_procedimento")).toEqual([
      "USG ABDOMEN",
      "Ultrassonografía de tireoide",
    ]);
  });

  test("repetição com acento diferente não vira outra opção", () => {
    expect(opcoesCatalogo([{ nome: "Ultrassonografia" }, { nome: "ULTRASSONOGRAFÍA" }], [], "exame_procedimento")).toEqual([
      "Ultrassonografia",
    ]);
  });

  test("o estado enviado ao Jev tem todos os campos que a pergunta cita", () => {
    const estado = estadoEspecialidade("pulmao", "quero marcar com médico do pulmão", "consulta");
    expect(estado).toEqual({ pedido: "pulmao", mensagem_atual: "quero marcar com médico do pulmão", tipo_atendimento: "consulta" });
    const instrucao = String((perguntaEspecialidade(["PNEUMOLOGIA"]).especialidade as any).instructions);
    for (const campo of Object.keys(estado)) expect(instrucao).toContain(`\`${campo}\``);
    expect(estadoEspecialidade("pulmao", null, undefined)).toEqual({
      pedido: "pulmao",
      mensagem_atual: "pulmao",
      tipo_atendimento: "nao_identificado",
    });
  });

  test("aplica só com confiança >= 0,8 e opção da lista", () => {
    expect(especialidadeAplicavel({ choice: "ODONTOLOGIA", confidence: 0.9 }, opcoes)).toBe("ODONTOLOGIA");
    expect(especialidadeAplicavel({ choice: "ODONTOLOGIA", confidence: 0.7 }, opcoes)).toBeNull();
    expect(especialidadeAplicavel({ choice: "nenhuma", confidence: 0.99 }, opcoes)).toBeNull();
    expect(especialidadeAplicavel({ choice: "INVENTADA", confidence: 0.99 }, opcoes)).toBeNull();
    expect(especialidadeAplicavel(undefined, opcoes)).toBeNull();
  });
});
