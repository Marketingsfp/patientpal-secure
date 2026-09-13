import { describe, expect, it } from "bun:test";
import { afirmaOuPrometeAgendamento, detectarAfirmacaoAgendamento } from "./afirmacao-agendamento";

describe("modalidade administrativa não é reserva do paciente", () => {
  it.each([
    "Atendimento agendado.",
    "Modalidade: consulta agendada.",
    "Modalidade: consulta agendada para segunda-feira às 10h.",
    "Escala habitual: consulta agendada para segunda-feira às 10h.",
    "Dra. Laura Silva — Quinta-feira a partir de 13:30 (agendado).",
    "Dr. Carlos Souza: segunda-feira, 09:30. Observação: Agendado.",
    "O atendimento é agendado; a escala habitual começa às 09h30.",
    "As consultas são agendadas. Quer verificar vagas na agenda?",
    "A médica atende com hora marcada.",
    "O paciente deve chegar no horário agendado.",
    "Para atendimento agendado, leve o documento.",
    "Atendimento agendado para segunda-feira às 10h, conforme a escala habitual.",
    "Modalidade: atendimento agendado para segunda-feira às 10h.",
    "Reservado para pacientes da Cardiologia.",
    "Quer que eu agende sua consulta?",
    "Posso reservar esse horário?",
    "Vou agendar sua consulta?",
    "Não agendei sua consulta.",
    "Não consegui concluir seu agendamento.",
    "Ainda não está agendada sua consulta.",
    "",
  ])("não dispara por %s", (texto) => {
    expect(afirmaOuPrometeAgendamento(texto)).toBe(false);
  });

  it("preserva a resposta completa de cardiologia com modalidades e oferta de vagas", () => {
    const texto = `Temos atendimento em Cardiologia com os seguintes profissionais:
* Dra. Laura Silva: quinta-feira às 13h30 (agendado).
* Dr. Carlos Souza: segunda a sábado às 09h30 (agendado).
Valores da consulta: R$ 120,00 no dinheiro e R$ 145,00 no cartão.
Gostaria de verificar vagas na agenda? Qual profissional você prefere?`;
    expect(detectarAfirmacaoAgendamento(texto)).toEqual({ tipo: "nenhuma", trecho: null });
  });
});

describe("ato, resultado ou promessa de reserva continuam exigindo comprovação", () => {
  it.each([
    "Agendei sua consulta.",
    "Marquei o seu horário.",
    "Reservei para você amanhã às 10h.",
    "Sua consulta está agendada.",
    "Seu exame foi marcado para amanhã.",
    "Seu horário está reservado.",
    "Agendamento concluído com sucesso.",
    "Consulta confirmada.",
    "Horário reservado.",
    "Confirmada sua consulta.",
    "Está agendado para amanhã às 10h.",
    "Agendado para amanhã às 10h.",
    "Consulta agendada para amanhã às 10h.",
    "Consulta marcada para 14/09 às 10h.",
    "Ficou marcado para 14/09 às 10:00.",
    "Reservado para segunda-feira.",
    "Confirmado para as 10h.",
    "Não houve erro. Agendei sua consulta.",
    "Atendimento agendado. Agendei sua consulta para amanhã.",
  ])("detecta resultado: %s", (texto) => {
    expect(detectarAfirmacaoAgendamento(texto).tipo).toBe("sucesso_agendamento");
  });

  it.each([
    "Vou agendar sua consulta.",
    "Estou agendando para você.",
    "Irei agendar esse horário.",
    "Já vou marcar sua consulta.",
    "Vou reservar seu horário.",
    "Estamos agendando seu exame.",
    "A modalidade é atendimento agendado. Vou agendar agora.",
  ])("detecta promessa: %s", (texto) => {
    expect(detectarAfirmacaoAgendamento(texto).tipo).toBe("promessa_agendamento");
  });
});
