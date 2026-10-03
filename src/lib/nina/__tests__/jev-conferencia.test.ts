import { describe, expect, test } from "bun:test";
import { instrucaoCorrecao, perguntasConferencia, problemasConferencia, type FatosTurno } from "../jev-conferencia";

const fatos = (f: Partial<FatosTurno> = {}): FatosTurno => ({
  agendaConsultada: false, agendamentoConfirmado: false, dadosConsultados: [], ...f,
});
const n = (v: number) => ({ noul: v });
const limpo = { afirma_vaga: n(0.1), afirma_agendado: n(0.1), cancelamento: n(0.1), dado_sem_fonte: n(0.1) };

describe("Jev Fase 6 — conferência antes do envio", () => {
  test("resposta limpa não tem problema", () => {
    expect(problemasConferencia(limpo, fatos({ dadosConsultados: ["x"] }))).toEqual([]);
  });
  test("vaga só é problema sem agenda consultada", () => {
    expect(problemasConferencia({ ...limpo, afirma_vaga: n(0.9) }, fatos())).toEqual(["vaga_sem_agenda"]);
    expect(problemasConferencia({ ...limpo, afirma_vaga: n(0.9) }, fatos({ agendaConsultada: true }))).toEqual([]);
  });
  test("agendado só é problema sem gravação confirmada", () => {
    expect(problemasConferencia({ ...limpo, afirma_agendado: n(0.8) }, fatos())).toEqual(["agendado_sem_confirmacao"]);
    expect(problemasConferencia({ ...limpo, afirma_agendado: n(0.8) }, fatos({ agendamentoConfirmado: true }))).toEqual([]);
  });
  test("cancelamento pela Maria é sempre problema", () => {
    expect(problemasConferencia({ ...limpo, cancelamento: n(0.7) }, fatos({ agendamentoConfirmado: true }))).toEqual(["cancelamento"]);
  });
  test("dado sem fonte só é conferido quando há dados do turno", () => {
    expect(Object.keys(perguntasConferencia(fatos()))).not.toContain("dado_sem_fonte");
    expect(problemasConferencia({ ...limpo, dado_sem_fonte: n(0.9) }, fatos())).toEqual([]);
    expect(problemasConferencia({ ...limpo, dado_sem_fonte: n(0.9) }, fatos({ dadosConsultados: ["R$ 100"] }))).toEqual(["dado_sem_fonte"]);
  });
  test("resposta ausente nunca bloqueia; abaixo de 0,7 não conta", () => {
    expect(problemasConferencia({}, fatos())).toEqual([]);
    expect(problemasConferencia({ ...limpo, cancelamento: n(0.69) }, fatos())).toEqual([]);
  });
  test("instrução de correção não autoriza ação nova", () => {
    expect(instrucaoCorrecao(["cancelamento"])).toContain("não autoriza");
  });
});
