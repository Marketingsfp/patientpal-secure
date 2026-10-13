import { describe, expect, test } from "bun:test";
import {
  filtrarListaPorHorario,
  janelaHorarioPedida,
  listaProfissionaisExtensa,
} from "../lista-profissionais-extensa";

const registro = (medico: string, inicio: string, fim: string) => ({
  tipo: "profissional",
  medico,
  extras: { horarios: [{ dia: "Segunda-feira", inicio, fim }] },
});

function listaCardiologia() {
  const records = [
    ...Array.from({ length: 7 }, (_, i) => registro(`Profissional Manhã ${i}`, "08:00", "12:00")),
    registro("Profissional Tarde A", "13:00", "18:00"),
    registro("Profissional Tarde B", "14:00", "19:30"),
  ];
  return {
    tipo_atendimento: "consulta",
    instrucao: "Instrução do catálogo.",
    records,
    doctors: records.map((r) => r.medico),
  };
}
const ARGS = JSON.stringify({ termo: "cardiologia", objetivos: ["medicos"] });

describe("janela de horário pedida pelo paciente", () => {
  test("lê depois/após/a partir/antes e períodos do dia", () => {
    expect(janelaHorarioPedida("só consigo depois das 17h pq trabalho")).toMatchObject({
      aPartir: "17:00",
    });
    expect(janelaHorarioPedida("após as 17:30")).toMatchObject({ aPartir: "17:30" });
    expect(janelaHorarioPedida("a partir das 18")).toMatchObject({ aPartir: "18:00" });
    expect(janelaHorarioPedida("antes das 10h")).toMatchObject({ ate: "10:00" });
    expect(janelaHorarioPedida("prefiro de manhã")).toMatchObject({ ate: "12:00" });
    expect(janelaHorarioPedida("à noite")).toMatchObject({ aPartir: "18:00" });
    expect(janelaHorarioPedida("quero marcar um cardio")).toBeNull();
  });
});

describe("lista de especialidade filtrada pelo horário", () => {
  test("9 cardiologistas, 2 depois das 17h: informa os 2 e não aciona a regra dos 8", () => {
    const dados = listaCardiologia();
    expect(listaProfissionaisExtensa("consultar_cadastro", ARGS, dados)).not.toBeNull();
    const filtrado = filtrarListaPorHorario(
      "consultar_cadastro",
      ARGS,
      dados,
      "qro marcar um cardio pra mim. só consigo depois das 17h",
    )!;
    expect(filtrado.doctors).toEqual(["Profissional Tarde A", "Profissional Tarde B"]);
    expect(filtrado.records).toHaveLength(2);
    expect(filtrado.instrucao).toContain("a partir das 17:00");
    expect(listaProfissionaisExtensa("consultar_cadastro", ARGS, filtrado)).toBeNull();
  });

  test("sem janela, com médico pedido ou sem ninguém na janela: não filtra", () => {
    const dados = listaCardiologia();
    expect(filtrarListaPorHorario("consultar_cadastro", ARGS, dados, "quero um cardio")).toBeNull();
    const comMedico = JSON.stringify({ termo: "cardiologia", medico: "Profissional Tarde A" });
    expect(
      filtrarListaPorHorario("consultar_cadastro", comMedico, dados, "depois das 17h"),
    ).toBeNull();
    expect(filtrarListaPorHorario("consultar_cadastro", ARGS, dados, "depois das 21h")).toBeNull();
  });
});
