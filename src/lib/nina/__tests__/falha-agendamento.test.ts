import { expect, test } from "bun:test";
import { encaminhamentoFalhaAgendamento, respostaFalhaAgendamento } from "../falha-agendamento";
import { encaminhamentoSemVagas } from "../agenda-sem-vagas";
import { validarResultado } from "../tool-broker";
import { motivoParaAtendimento } from "../../atendimento/texto-interno-apresentacao";

for (const ferramenta of [
  "selecionar_horario",
  "identificar_paciente",
  "agendar",
  "verificar_horario",
])
  test(`${ferramenta}: falha técnica mantém causa operacional`, () => {
    const r = validarResultado(ferramenta, {
      ok: false,
      erro: "INTERNAL_ERROR",
      codigo: "AGENDA_QUERY_FAILED",
    });
    const pedido = encaminhamentoFalhaAgendamento(r);
    expect(pedido?.motivo).toContain("FALHA_OPERACIONAL_AGENDAMENTO");
    expect(pedido?.resumo).toContain(ferramenta);
    expect(motivoParaAtendimento(pedido?.motivo)).toContain("falha operacional");
    expect(encaminhamentoSemVagas(r, {})).toBeNull();
  });
test("vínculo ausente é identificado para a atendente", () => {
  const r = validarResultado("consultar_disponibilidade", {
    ok: false,
    erro: "ACTION_NOT_AUTHORIZED",
    codigo: "ATENDIMENTO_AGENDA_NAO_VINCULADO",
  });
  expect(motivoParaAtendimento(encaminhamentoFalhaAgendamento(r)?.motivo)).toContain(
    "ligação entre o catálogo e a agenda",
  );
});
test("agenda vazia, SFP e identificação ambígua mantêm seus tratamentos", () => {
  for (const resultado of [
    { ok: true, reason: "NO_AVAILABILITY" },
    { ok: false, erro: "PROFISSIONAL_SFP" },
    { ok: false, erro: "DOCTOR_NOT_FOUND", opcoes: [{ nome: "Alex" }] },
    { ok: false, erro: "PATIENT_AMBIGUOUS" },
  ])
    expect(
      encaminhamentoFalhaAgendamento(validarResultado("verificar_horario", resultado)),
    ).toBeNull();
});
test("texto não afirma agenda cheia, base ausente ou sucesso sem prova", () => {
  for (const ok of [true, false])
    expect(respostaFalhaAgendamento(ok)).not.toMatch(/sem vagas|não encontrei|agendado/i);
  expect(respostaFalhaAgendamento(false)).not.toContain("Encaminhei");
});
