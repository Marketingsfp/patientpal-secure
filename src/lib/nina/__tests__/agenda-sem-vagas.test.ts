import { describe, expect, test } from "bun:test";
import { encaminhamentoSemVagas, respostaSemVagas } from "../agenda-sem-vagas";
import { validarResultado } from "../tool-broker";

describe("encaminhamento após consulta de agenda sem vagas", () => {
  for (const ferramenta of ["consultar_disponibilidade", "verificar_horario", "proxima_vaga"]) {
    for (const motivo of ["NO_AVAILABILITY", "AGENDA_CHEIA", "NAO_ATENDE_NO_DIA"]) {
      test(`${ferramenta}: ${motivo} encaminha com o contexto consultado`, () => {
        const resultado = validarResultado(ferramenta, {
          ok: true,
          ...(ferramenta === "verificar_horario"
            ? { motivo, disponivel: false }
            : { reason: motivo }),
          horarios: [],
          alternativas: [],
        });
        const pedido = encaminhamentoSemVagas(
          resultado,
          '{"medico_id":"jorge","data":"2030-01-21"}',
        );
        expect(pedido?.motivo).toContain("AGENDA_SEM_VAGAS");
        expect(pedido?.resumo).toContain("jorge");
        expect(pedido?.resumo).toContain("2030-01-21");
        expect(pedido?.setor).toBe("Agendamento");
      });
    }
  }

  for (const campo of ["horarios", "slots", "alternativas", "proximos", "seguintes"]) {
    test(`preserva a continuação quando há ${campo} disponíveis`, () => {
      expect(
        encaminhamentoSemVagas(
          validarResultado("consultar_disponibilidade", {
            ok: true,
            reason: "AGENDA_CHEIA",
            [campo]: [{ hora: "14:00" }],
          }),
          {},
        ),
      ).toBeNull();
    });
  }
  for (const dados of [
    { ok: false, erro: "INTERNAL_ERROR", codigo: "AGENDA_QUERY_FAILED" },
    { ok: false, erro: "DOCTOR_NOT_FOUND" },
    { ok: false, motivo: "MEDICO_DIVERGENTE", consulta_realizada: false },
    { ok: true, reason: "NO_AVAILABILITY", consulta_realizada: false },
    { ok: true, reason: "ESPECIALIDADE_NAO_ATENDIDA", horarios: [] },
    { ok: true, motivo: "HORARIO_OCUPADO", alternativas: [{ hora: "15:00" }] },
    { ok: true, disponivel: true },
    { ok: true, proxima: { hora: "14:00" } },
    { ok: true, horarios: [] },
  ]) {
    test(`não inventa ausência de vagas: ${JSON.stringify(dados)}`, () => {
      expect(
        encaminhamentoSemVagas(validarResultado("consultar_disponibilidade", dados), {}),
      ).toBeNull();
    });
  }
  test("catálogo e confirmação de reserva não acionam a regra de consulta vazia", () => {
    for (const nome of ["buscar_medicos", "agendar", "solicitar_atendente_humano"])
      expect(
        encaminhamentoSemVagas(validarResultado(nome, { ok: true, reason: "NO_AVAILABILITY" }), {}),
      ).toBeNull();
  });
  test("falha de transferência não promete encaminhamento realizado", () => {
    expect(respostaSemVagas(true)).toContain("Encaminhei sua conversa");
    expect(respostaSemVagas(false)).toContain("não consegui transferir");
    expect(respostaSemVagas(false)).not.toContain("Encaminhei");
  });
  for (const nome of ["selecionar_horario", "agendar"]) {
    test(`${nome}: vaga escolhida perdida encaminha mesmo existindo outras opções`, () => {
      const pedido = encaminhamentoSemVagas(validarResultado(nome, {
        ok: false, erro: "SLOT_UNAVAILABLE", alternativas: [{ hora: "08:00" }],
      }), {});
      expect(pedido?.motivo).toContain("VAGA_ESCOLHIDA_INDISPONIVEL");
      expect(respostaSemVagas(true, true)).toContain("Não fiz nenhuma reserva alternativa");
      expect(respostaSemVagas(false, true)).not.toContain("Encaminhei");
    });
  }
});
