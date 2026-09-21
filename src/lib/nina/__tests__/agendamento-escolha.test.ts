import { describe, expect, test } from "bun:test";
import { estadoVazio } from "../fluxo-estado-normalizar";
import {
  aceitarResumoEntregue,
  consentimentoDaEscolha,
  lerEscolhaHorario,
  registrarOpcoesAgendamento,
  selecionarVagaValidada,
  vagasDaEscolha,
  vagasDaSessao,
  type VagaAgendamento,
} from "../agendamento-escolha";

const vaga: VagaAgendamento = {
  modalidade: "hora_marcada",
  agenda_id: null,
  medico_id: "medico",
  medico: "Dra. Ana",
  procedimento: "Consulta",
  data: "2030-01-21",
  hora: "10:20",
  inicio: "2030-01-21T10:20:00-03:00",
  fim: "2030-01-21T10:40:00-03:00",
};
function preparar() {
  const e = estadoVazio();
  e.session_id = "sessao";
  registrarOpcoesAgendamento(e, "clinica", [vaga]);
  selecionarVagaValidada(e, "clinica", vaga, "Confirma Dra. Ana em 21/01/2030 às 10:20?");
  return e;
}
describe("escolha de horário e consentimento do resumo entregue", () => {
  test("reconsultar ou selecionar a mesma vaga preserva o resumo e o aceite", () => {
    const e = preparar();
    const resumo = e.appointment.confirmation!;
    registrarOpcoesAgendamento(e, "clinica", [vaga]);
    selecionarVagaValidada(e, "clinica", vaga, "Texto diferente não reinicia a etapa");
    expect(e.appointment.confirmation).toBe(resumo);
    aceitarResumoEntregue(e, "clinica", [{ role: "assistant", content: resumo.resumo }]);
    selecionarVagaValidada(e, "clinica", vaga, "Outro texto");
    expect(consentimentoDaEscolha(e)).toBe(resumo);
    expect(e.appointment.confirmation?.aceita).toBe(true);
  });
  for (const mensagem of [
    "10:20 fica melhor",
    "eu prefiro 10:20",
    "marca pra 10:20",
    "eu vou 10:20",
    "10:20",
    "pode deixar às 10h20",
    "consigo ir às 10:20, combinado?",
    "pra mim tá bom 10:20",
    "10:20 é perfeito",
    "pode reservar 10:20 por gentileza",
    "Quero esse das 10:20",
  ])
    test(`linguagem livre: ${mensagem}`, () =>
      expect(lerEscolhaHorario(mensagem)?.hora).toBe("10:20"));
  for (const mensagem of [
    "não quero 10:20",
    "nem 10:20",
    "10:20 ou 11:00",
    "antes de 10:20",
    "depois das 10:20",
    "talvez 10:20",
    "qual o valor das 10:20?",
    "amanhã às 10:20",
    "quero com Dra. Ana às 10:20",
    "dez e vinte",
    "o segundo horário",
    "10:200",
  ])
    test(`deixa qualificação/ambiguidade para interpretação: ${mensagem}`, () =>
      expect(lerEscolhaHorario(mensagem)).toBeNull());
  test("mesma hora em dias distintos exige a data", () => {
    const vagas = [vaga, { ...vaga, data: "2030-01-22" }];
    expect(vagasDaEscolha(vagas, lerEscolhaHorario("vou 10:20")!)).toHaveLength(2);
    expect(vagasDaEscolha(vagas, lerEscolhaHorario("dia 21/01 às 10:20")!)).toEqual([vaga]);
    expect(vagasDaEscolha(vagas, lerEscolhaHorario("2030-01-21 às 10:20")!)).toEqual([vaga]);
  });
  test("opções e resumos de outra sessão ou clínica não autorizam", () => {
    const e = preparar();
    expect(vagasDaSessao(e, "outra")).toEqual([]);
    expect(
      aceitarResumoEntregue(e, "outra", [
        { role: "assistant", content: e.appointment.confirmation!.resumo },
      ]),
    ).toBe(false);
    e.session_id = "nova";
    expect(vagasDaSessao(e, "clinica")).toEqual([]);
    expect(consentimentoDaEscolha(e)).toBeNull();
  });
  test("resumo precisa ser a mensagem realmente entregue antes do aceite", () => {
    const e = preparar();
    for (const historico of [
      [],
      [{ role: "user", content: e.appointment.confirmation!.resumo }],
      [{ role: "assistant", content: "Confirma às 08:00?" }],
      [{ role: "assistant", content: "Você se refere a este profissional? Sandro Prinscewal" }],
    ]) {
      expect(aceitarResumoEntregue(e, "clinica", historico)).toBe(false);
      expect(consentimentoDaEscolha(e)).toBeNull();
    }
    expect(
      aceitarResumoEntregue(e, "clinica", [
        { role: "assistant", content: e.appointment.confirmation!.resumo },
      ]),
    ).toBe(true);
    expect(consentimentoDaEscolha(e)?.vaga.hora).toBe("10:20");
  });
  for (const campo of [
    "doctor_id",
    "procedure",
    "date",
    "time",
    "slot_inicio",
    "slot_fim",
  ] as const)
    test(`mutação de ${campo} não reutiliza consentimento`, () => {
      const e = preparar();
      aceitarResumoEntregue(e, "clinica", [
        { role: "assistant", content: e.appointment.confirmation!.resumo },
      ]);
      e.appointment[campo] = "alterado";
      expect(consentimentoDaEscolha(e)).toBeNull();
    });
  test("nova consulta e tentativa de seleção não substituem vaga aceita", () => {
    const e = preparar();
    aceitarResumoEntregue(e, "clinica", [
      { role: "assistant", content: e.appointment.confirmation!.resumo },
    ]);
    registrarOpcoesAgendamento(e, "clinica", []);
    expect(consentimentoDaEscolha(e)?.vaga.hora).toBe("10:20");
    expect(() => selecionarVagaValidada(e, "clinica", { ...vaga, hora: "08:00" }, "Outro resumo")).toThrow();
  });
  test("modalidade e agenda também ficam vinculadas ao consentimento", () => {
    const e = preparar();
    aceitarResumoEntregue(e, "clinica", [
      { role: "assistant", content: e.appointment.confirmation!.resumo },
    ]);
    e.appointment.modalidade_atendimento = "ficha";
    expect(consentimentoDaEscolha(e)).toBeNull();
    e.appointment.modalidade_atendimento = "hora_marcada";
    e.appointment.agenda_id = "outra-agenda";
    expect(consentimentoDaEscolha(e)).toBeNull();
  });
});
