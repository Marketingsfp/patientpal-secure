import { describe, expect, test } from "bun:test";
import {
  AVISO_AGENDAMENTO_PELA_EQUIPE,
  REGRA_ACOMPANHANTE,
  REGRA_AGENDAMENTO_PELA_EQUIPE,
  REGRA_DEBITO_CREDITO,
  REGRA_EXPLICACAO_ESPECIALIDADE,
} from "../regras-administrativas-confirmadas";
import { REGRA_INFORMACAO_NAO_CADASTRADA } from "../informacao-nao-cadastrada";
import { REGRA_MODALIDADES_PAGAMENTO } from "../eficiencia-turno";
import { perguntasConferencia } from "../jev-conferencia";
import { motivoSemHorariosHabituais, orientacaoHorariosHabituais } from "../horarios-habituais";
import { registrosQueDecidemFluxo } from "../fluxo-agendamento-item";
import { profissionalParaRegistro, type ProfissionalPublicado } from "../catalogo-conhecimento";
import type { ResultadoBroker } from "../tool-broker";

// Decisões da clínica de 14/10/2026 (Fase 6 da homologação de consultas). Dados fictícios.

describe("regras confirmadas", () => {
  test("débito e crédito usam o valor de Pix/cartão, também na conferência do Jev", () => {
    expect(REGRA_DEBITO_CREDITO).toContain("PAGAMENTO-02");
    expect(REGRA_DEBITO_CREDITO).toMatch(/débito e para crédito à vista/);
    expect(REGRA_MODALIDADES_PAGAMENTO).toMatch(/Débito e crédito à vista são cartão/);
    const perguntas = perguntasConferencia({
      agendaConsultada: false,
      agendamentoConfirmado: false,
      dadosConsultados: ['{"preco_cartao":145}'],
    });
    expect(perguntas.dado_sem_fonte!.instructions).toMatch(/débito e no crédito/);
  });

  test("acompanhante, explicação geral e exceções na regra de informação não cadastrada", () => {
    expect(REGRA_ACOMPANHANTE).toMatch(/pode, sim/);
    expect(REGRA_EXPLICACAO_ESPECIALIDADE).toMatch(/Não dê diagnóstico/);
    for (const codigo of ["PAGAMENTO-02", "ACOMPANHANTE-01", "EXPLICACAO-01"])
      expect(REGRA_INFORMACAO_NAO_CADASTRADA).toContain(codigo);
    expect(REGRA_AGENDAMENTO_PELA_EQUIPE).toContain(AVISO_AGENDAMENTO_PELA_EQUIPE);
  });
});

describe("profissional agendado pela equipe (EQUIPE-01)", () => {
  const registro = (nome: string, horarios: unknown[], equipe = false) => ({
    id: nome,
    tipo: "profissional",
    medico: nome,
    extras: {
      catalogo_tipo: "profissional",
      horarios,
      ...(equipe ? { atendimento_humano_obrigatorio: true } : {}),
    },
  });
  const retorno = (records: unknown[]): ResultadoBroker => ({
    ferramenta: "consultar_cadastro",
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    success: true,
    reused: false,
    appointment_confirmed: false,
    dados: { found: true, knowledge_status: "found", records },
  });

  test("entra na lista com o aviso, não como 'sem horários'", () => {
    const r = retorno([
      registro("Medico Teste", [{ dia: "Quarta-feira", inicio: "13:00", fim: "15:00" }]),
      registro("Equipe Teste", [], true),
    ]);
    expect(orientacaoHorariosHabituais(r)).toMatchObject({
      com_horarios: [{ nome: "Medico Teste" }],
      sem_horarios: [],
      agendamento_pela_equipe: [{ nome: "Equipe Teste" }],
    });
    expect(orientacaoHorariosHabituais(r)!.instrucao).toContain(AVISO_AGENDAMENTO_PELA_EQUIPE);
    // Escolhido, encaminha pela regra de atendimento humano, não por falta de escala.
    expect(motivoSemHorariosHabituais(r, ["Equipe Teste"])).toBeNull();
  });

  test("registro sem escala leva o aviso no campo de dias", () => {
    const p: ProfissionalPublicado = {
      id: "p-equipe",
      nome: "Equipe Teste",
      especialidades: [{ id: null, nome: "Urologia" }],
      atende_consultorio: null,
      formas_pagamento: [],
      convenios: [],
      horarios: [],
      tipo_atendimento: "Consulta",
      observacao_publica: null,
      estrutura: { encaminhamento_humano: true },
    } as ProfissionalPublicado;
    expect(profissionalParaRegistro(p, "2026-10-14").dia).toBe(AVISO_AGENDAMENTO_PELA_EQUIPE);
    expect(
      profissionalParaRegistro({ ...p, estrutura: {} } as ProfissionalPublicado, "2026-10-14").dia,
    ).toBeNull();
  });

  test("não decide o fluxo dos demais profissionais da lista", () => {
    const agenda = { id: "a", estrutura: { nina_pode_agendar: true } };
    const equipe = { id: "b", estrutura: { encaminhamento_humano: true } };
    expect(registrosQueDecidemFluxo([agenda, equipe])).toEqual([agenda]);
    expect(registrosQueDecidemFluxo([equipe])).toEqual([equipe]);
  });
});
