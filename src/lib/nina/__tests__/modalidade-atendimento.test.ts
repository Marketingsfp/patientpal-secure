import { describe, expect, test } from "bun:test";
import { interpretarModalidade, modalidadeDoCatalogo, resolverModalidade, permiteReserva } from "../modalidade-atendimento";
import { resultadoAgendamentoConfirmado } from "../resposta/agendamento";
import { estadoVazio } from "../fluxo-estado-normalizar";
import { textoDaChave } from "../resposta/templates";

describe("modalidades oficiais de atendimento", () => {
  for (const [texto, modo] of [
    ["Hora marcada", "hora_marcada"], ["Horário marcado", "hora_marcada"],
    ["ORDEM DE CHEGADA COM PRÉ-AGENDAMENTO", "chegada_com_pre_agendamento"],
    ["Ordem de chegada c/ agendamento", "chegada_com_pre_agendamento"],
    ["Ordem de chegada sem pré-agendamento", "chegada_sem_pre_agendamento"],
    ["Ordem de chegada s/ agendamento", "chegada_sem_pre_agendamento"],
    ["Por numeração (ficha)", "ficha"], ["Por ficha", "ficha"],
    ["Ordem de chegada", "chegada_sem_pre_agendamento"], ["consulta, retorno", null],
    ["Agendado", "hora_marcada"], ["Por agendamento", "hora_marcada"],
    ["Não agendado", null], ["Agendado somente após confirmação", null],
    ["Hora marcada / por ficha", "nao_definida"], ["Ordem de chegada com hora marcada", "nao_definida"],
  ] as const) test(String(texto), () => expect(interpretarModalidade(texto)).toBe(modo));
  test("chegada simples dispensa reserva; pré-agendamento explícito mantém reserva", () => {
    expect(permiteReserva(interpretarModalidade("Ordem de chegada"))).toBe(false);
    expect(permiteReserva(interpretarModalidade("Ordem de chegada com pré-agendamento"))).toBe(true);
    expect(modalidadeDoCatalogo(["Ordem de chegada", "Ordem de chegada sem pré-agendamento"])).toBe("chegada_sem_pre_agendamento");
    expect(modalidadeDoCatalogo(["Ordem de chegada", "Ordem de chegada com pré-agendamento"])).toBe("nao_definida");
  });
  test("booleano de chegada e conflitos não inventam modalidade", () => {
    expect(resolverModalidade(null, true)).toBe("nao_definida");
    expect(resolverModalidade(null, false)).toBe("hora_marcada");
    expect(resolverModalidade(null, null)).toBe("nao_definida");
    expect(modalidadeDoCatalogo(["Hora marcada", "Por ficha"])).toBe("nao_definida");
    expect(resolverModalidade("ficha", false)).toBe("ficha");
  });
  for (const modo of ["hora_marcada", "chegada_com_pre_agendamento", "ficha"] as const)
    test(`confirmação ${modo} usa regra, ficha e horário comprovados`, () => {
      const e = estadoVazio();
      const r = resultadoAgendamentoConfirmado({ appointment_id: "ag1", modalidade_atendimento: modo,
        date: "21/01/2030", time: "10:20", medico: "Dra. Ana", ficha_numero: "007" }, e, "Clínica Teste")!;
      expect(r.texto).toContain("10:20");
      expect(r.texto).toContain("Uma hora antes");
      expect(r.texto).toContain("A Clínica Teste agradece");
      expect(r.texto.includes("15 minutos")).toBe(modo !== "chegada_com_pre_agendamento");
      if (modo === "chegada_com_pre_agendamento") {
        expect(r.texto).toContain("quem chegar primeiro");
        expect(r.texto).toContain("entre os pacientes daquele horário");
      }
      if (modo === "ficha") expect(r.texto).toContain("*Sua ficha:* 007");
      expect(textoDaChave(r.chaveTemplate!, r.variaveis).texto).toBe(r.texto);
    });
  test("falha na leitura da ficha não inventa número nem nega reserva comprovada", () => {
    const r = resultadoAgendamentoConfirmado({ appointment_id: "ag1", modalidade_atendimento: "ficha",
      date: "21/01/2030", time: "10:20", medico: "Dra. Ana" }, estadoVazio(), "Clínica")!;
    expect(r.texto).toContain("Seu agendamento foi realizado");
    expect(r.texto).toContain("Não consegui consultar seu número");
    expect(r.texto).not.toContain("001");
  });
  test("sem pré-agendamento não cria confirmação de reserva", () => {
    expect(resultadoAgendamentoConfirmado({ appointment_id: "indevido", modalidade_atendimento: "chegada_sem_pre_agendamento" }, estadoVazio(), "Clínica")).toBeNull();
    const r = textoDaChave("fluxo.agendamento.sem_pre_agendamento", { profissional: "Dra. Ana", unidade: "Clínica" });
    expect(r.texto).toContain("Não é necessário marcar horário");
    expect(r.texto).not.toMatch(/15|antecedência|confirmar se você/);
  });
  test("template publicado recebe o atendimento completo conferido, mantendo suas orientações", () => {
    const textos = { "fluxo.agendamento.confirmado": "Reserva confirmada com {profissional}, {data} às {horario}. Traga documento." };
    const r = resultadoAgendamentoConfirmado({ appointment_id: "ag1", modalidade_atendimento: "hora_marcada",
      date: "22/09/2026", time: "10:40", medico: "Conceição Martins", agendamento: { procedimento: "CONSULTA + PREVENTIVO — GINECOLOGIA" } },
      estadoVazio(), "Clínica", textos)!;
    expect(r.texto).toContain("Traga documento.");
    expect(r.texto).toContain("*Atendimento:* CONSULTA + PREVENTIVO — GINECOLOGIA");
    expect(r.texto.match(/CONSULTA \+ PREVENTIVO/g)).toHaveLength(1);
    expect(textoDaChave(r.chaveTemplate!, r.variaveis, textos).texto).toBe(r.texto);
  });
});
