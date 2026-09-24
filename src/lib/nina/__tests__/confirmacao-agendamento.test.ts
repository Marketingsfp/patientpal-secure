import { describe, expect, test } from "bun:test";
import { ehConfirmacaoDeAgendamento } from "../confirmacao-agendamento";
import type { VagaAgendamento } from "../agendamento-escolha";

const vaga: VagaAgendamento = {
  medico_id: "paulo",
  medico: "PAULO GUILHERME NADER DAMASCENO",
  procedimento: "Consulta — ANGIOLOGIA",
  data: "2026-09-25",
  hora: "08:30",
  inicio: "2026-09-25T08:30:00-03:00",
  fim: "2026-09-25T08:45:00-03:00",
  modalidade: "hora_marcada",
  agenda_id: "agenda",
};
describe("aceite natural vinculado ao resumo", () => {
  test.each([
    "Sim",
    "Isso", "esse mesmo", "esse", "é esse", "ss", "simmm", "esse msm",
    "Confirmo",
    "já é, pode confirmar", "formou, pode agendar", "demorou, pode marcar",
    "blz, pode confirmar", "ss, pode agendar pfv", "fechou, confirmo às 08:30",
    "Sim, confirmo.",
    "isso mesmo, pode confirmar",
    "sim, tudo certo por aqui",
    "confirmo sim, obrigado!",
    "tá tudo certo, pode confirmar",
    "Sim, pode agendar nesse horário",
    "Está tudo correto, pode confirmar. Obrigada!",
    "Sim, pode marcar.",
    "Sim, confirmo o agendamento com esses dados.",
    "Sim, confirmo todos esses dados para concluir o agendamento.",
    "Sim, confirmo a consulta com o Dr. Paulo Guilherme no dia 25/09 às 08:30.",
    "Confirmo o agendamento de angiologia com Paulo Guilherme em 25/09/2026 às 08:30. Pode finalizar?",
  ])("reconhece: %s", (texto) => expect(ehConfirmacaoDeAgendamento(texto, vaga)).toBe(true));
  test.each([
    "Sim, mas qual o valor?",
    "já é, pode confirmar às 10:00", "formou, pode agendar com outro médico",
    "demorou, pode marcar amanhã", "blz, pode confirmar se tiver desconto",
    "ss, pode agendar nn", "fechou, confirmo cardiologia",
    "sim, tudo certo por aqui, mas quero outro horário",
    "isso mesmo, pode confirmar se tiver desconto",
    "confirmo sim, obrigado, mas com outro médico",
    "tá tudo certo, pode confirmar amanhã",
    "sim, tudo certo por aqui?",
    "isso mesmo, pode confirmar cardiologia",
    "isso mesmo, pode confirmar às 10:00",
    "confirmo sim, obrigado, não",
    "Não confirmo",
    "Confirmo se tiver desconto",
    "Sim, talvez",
    "Sim, confirmo?",
    "Sim, confirmo com Dr. Rafael Barros",
    "Confirmo cardiologia",
    "Confirmo 08:45",
    "Confirmo em 26/09/2026",
    "Confirmo em 2026-09-26 às 08:30",
    "Confirmo amanhã",
    "Confirmo ou prefiro outro horário",
    "Sim, pode cancelar",
    "Confirmo apenas a data",
    "Sim, confirmo às 08:300",
    "Pode me informar o endereço?",
    "Marina Teste, 20/04/1995",
  ])("não inventa aceite da vaga: %s", (texto) =>
    expect(ehConfirmacaoDeAgendamento(texto, vaga)).toBe(false),
  );
  test("qualificadores não viram aceite genérico sem vaga", () => {
    expect(ehConfirmacaoDeAgendamento("Confirmo em 25/09 às 08:30")).toBe(false);
    expect(ehConfirmacaoDeAgendamento("Confirmo com Paulo Guilherme")).toBe(false);
  });
});
