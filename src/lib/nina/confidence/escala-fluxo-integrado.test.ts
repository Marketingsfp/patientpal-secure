/** Regressão do fluxo completo do motor com catálogo fictício no formato real. Sem banco ou modelo. */
import { describe, expect, it } from "bun:test";
import {
  montarResultadoCatalogo,
  type ProfissionalPublicado,
  type ServicoPublicado,
} from "../catalogo-conhecimento";
import { detectarIntencoes, intencaoAmbigua } from "../atendimento-fase1";
import { montarInstrucoesDoTurno } from "./contexto-avaliacao";
import { montarContextoCanonicoTurno } from "./contexto-turno";
import { extrairEvidencia } from "./evidencia-extrator";
import { aplicarEtapa } from "./etapas";
import { decidirHandoff } from "./handoff-decision";
import { revisarSaida } from "./revisao-final";
import { PROMPT_PUBLICADO_V15 } from "./fixtures/prompt-publicado-v15";
import { decidirNoTurno, verificarRespostaFinalDoTurno, type EstadoDoTurno } from "./runtime";

function profissional(
  id: string,
  nome: string,
  horarios: unknown,
  infantil = false,
): ProfissionalPublicado {
  return {
    id,
    nome,
    horarios,
    especialidades: [
      { nome: "Cardiologia" },
      ...(infantil ? [{ nome: "Cardiologia Infantil" }] : []),
    ],
    atende_consultorio: null,
    formas_pagamento: [
      { forma: "Dinheiro", valor: 120, condicao: "Consulta Cardiologia" },
      { forma: "Cartão", valor: 145, condicao: "Consulta Cardiologia" },
      ...(infantil
        ? [
            { forma: "Dinheiro", valor: 160, condicao: "Consulta Cardiologia Infantil" },
            { forma: "Cartão", valor: 190, condicao: "Consulta Cardiologia Infantil" },
          ]
        : []),
    ],
    convenios: [],
    tipo_atendimento: "Consulta",
    observacao_publica: null,
    aviso_dia: null,
    aviso_valido_de: null,
    aviso_valido_ate: null,
  };
}

const profissionais = [
  profissional("prof-a", "Marina Oliveira", [{ dia: "Segunda a Sábado", inicio: "09:30" }]),
  profissional("prof-b", "Bruno Costa", [{ dia: "Quinta", inicio: "13:30" }]),
  profissional(
    "prof-c",
    "Carlos Silva",
    [
      { dia: "Quarta", inicio: "13:00" },
      { dia: "Quinta", inicio: "08:00" },
      { dia: "Sexta", inicio: "13:00" },
      { dia: "Sábado", inicio: "08:00" },
    ],
    true,
  ),
  profissional("prof-d", "Daniel Souza", [{ dia: "Segunda", inicio: "09:30" }]),
];
const servicos: ServicoPublicado[] = [
  "ELETROCARDIOGRAMA",
  "ECOCARDIOGRAMA",
  "HOLTER 24H",
  "MAPA 24H",
  "TESTE ERGOMETRICO",
].map((nome, i) => ({
  id: `exame-${i}`,
  nome,
  valor: null,
  valor_observacao: null,
  descricao_publica: null,
  preparo: null,
  restricoes: null,
  executantes: [],
  formas_pagamento: [],
}));
const retorno = montarResultadoCatalogo({
  servicos,
  profissionais,
  hojeISO: "2026-09-13",
  priorizar: "profissional",
});
const evidencia = extrairEvidencia({
  ferramenta: "consultar_base_conhecimento",
  capacidade: "searchKnowledgeBase",
  fonte: "base_conhecimento",
  success: true,
  dados: retorno,
});
// Mesmo wrapper de buscar_medicos, a segunda ferramenta da execução reproduzida.
const evidenciaProfissionais = extrairEvidencia({
  ferramenta: "buscar_medicos",
  capacidade: "searchKnowledgeBase",
  fonte: "base_conhecimento",
  success: true,
  dados: {
    fonte: "catalogo_publicado",
    profissionais: retorno.doctors,
    dias: retorno.days,
    observacoes: retorno.notes,
    registros: retorno.records,
  },
});

const resposta = `Sim, temos atendimento em **Cardiologia** na Policlínica Menino Jesus!

**Profissionais e horários habituais de atendimento:**
- **Dra. Marina Oliveira:** de segunda a sábado, a partir das 09:30.
- **Dr. Bruno Costa:** quintas-feiras, a partir das 13:30.
- **Dr. Carlos Silva:** quartas e sextas a partir das 13:00, quintas e sábados a partir das 08:00. Também atende Cardiologia Infantil.
- **Dr. Daniel Souza:** segundas-feiras, a partir das 09:30.

**Valores da consulta:**
- Consulta em Cardiologia: R$ 120,00 no dinheiro ou R$ 145,00 no cartão.
- Consulta em Cardiologia Infantil com Dr. Carlos Silva: R$ 160,00 no dinheiro ou R$ 190,00 no cartão.

Também realizamos exames cardiológicos (como Eletrocardiograma, Ecocardiograma, Holter, MAPA e Teste Ergométrico).
Gostaria que eu verificasse as vagas disponíveis do Dr. Carlos Silva?`;

function estado(texto: string): EstadoDoTurno {
  const mensagemPaciente = "vcs tem cardiologista?";
  const canonico = montarContextoCanonicoTurno(
    { mensagemPaciente, podeAgendar: false },
    { detectarIntencoes, intencaoAmbigua },
  );
  return {
    mensagemPaciente,
    texto,
    acao: canonico.requestedAction,
    tipoTurno: canonico.turnType,
    intent: canonico.intent,
    intentAmbiguo: canonico.intentAmbiguo,
    ambiente: "homologacao",
    catalogoEncontrou: true,
    agendamentoConfirmado: false,
    pacienteIdentificado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
    apresentacaoJaFeita: true,
    evidenciasFluxo: {
      registroFerramentasCompleto: true,
      historicoCompleto: true,
      sessionId: "sessao-catalogo",
      historico: [
        { role: "user", content: "oi bom dia" },
        { role: "assistant", content: "Olá! Sou a Nina. Como posso ajudar?" },
      ],
    },
    estadoOperacional: {
      workflowState: "QUALIFICATION",
      bookingIntentConfirmed: false,
      appointmentFlowActive: true,
      appointmentToolCalled: false,
      appointmentAttempted: false,
      appointmentCreated: false,
    },
    ferramentas: ["consultar_base_conhecimento", "buscar_medicos"].map((nome) => ({
      nome,
      capacidade: nome === "buscar_medicos" ? "listCatalog" : "searchKnowledgeBase",
      fonte: "base_conhecimento",
      success: true,
    })),
    fatos: [...evidencia.fatos, ...evidenciaProfissionais.fatos],
    consultas: [evidencia.consulta, evidenciaProfissionais.consulta],
    instrucoes: montarInstrucoesDoTurno({
      escopo: "whatsapp",
      versao: "15",
      versaoId: "e8ecc58b-7186-42ce-8e3f-a90c42c25c1a",
      texto: PROMPT_PUBLICADO_V15,
    }),
  };
}

describe("catálogo → intenção → evidência → motor de ação e resposta final", () => {
  it("entrega a resposta factual correta depois da revisão completa da saída em etapa A", () => {
    const turno = estado(resposta);
    const avaliacao = verificarRespostaFinalDoTurno(turno, resposta);
    const revisao = revisarSaida({
      origem: "modelo",
      textoFinal: resposta,
      avaliacao,
      etapa: "A",
      risco: "informativo",
    });
    expect(revisao.bloqueiaEntrega).toBe(false);
    expect(revisao.acaoAplicada).toBe("LIBERAR");
  });

  it("não classifica como LOW nem encaminha informações publicadas de quatro médicos e cinco exames", () => {
    expect(retorno.found).toBe(true);
    const turno = estado(resposta);
    expect(turno.ferramentas).toHaveLength(2);
    expect(evidencia.fatos.some((f) => f.fonte === "agenda")).toBe(false);
    for (const r of [decidirNoTurno(turno), verificarRespostaFinalDoTurno(turno, resposta)]) {
      expect(r.hardBlockers ?? []).toEqual([]);
      expect(r.level).not.toBe("LOW");
      expect(r.decision).toBe("ALLOW");
      expect(r.validators?.find((v) => v.validator === "IntentClarityValidator")?.status).toBe(
        "PASS",
      );
      expect(
        r.validators?.find((v) => v.validator === "EntityResolutionValidator")?.reasonCode,
      ).toBe("OPCOES_INFORMATIVAS_PUBLICADAS");
      expect(r.validators?.find((v) => v.validator === "ClaimGroundingValidator")?.status).toBe(
        "PASS",
      );
    }
    const avaliacaoAcao = decidirNoTurno(turno);
    // Mesma configuração da execução analisada: etapa A, sem alterar flags.
    const aplicacao = aplicarEtapa(avaliacaoAcao, "A");
    const desfecho = decidirHandoff({
      avaliacaoAcao,
      decisaoEfetiva: aplicacao.decisaoEfetiva,
      tipoTurno: turno.tipoTurno ?? null,
    });
    expect(aplicacao.decisaoEfetiva).toBe("ALLOW");
    expect(desfecho.decision).toBe("CONTINUE");
    expect(desfecho.reason).toBe("ANSWER_ALLOWED");
  });

  it("a consulta única ao catálogo também comprova os profissionais retornados em doctors", () => {
    const turno = estado(resposta);
    turno.ferramentas = turno.ferramentas.slice(0, 1);
    turno.fatos = evidencia.fatos;
    turno.consultas = [evidencia.consulta];
    const avaliacao = decidirNoTurno(turno);
    expect(
      avaliacao.validators?.find((v) => v.validator === "ClaimGroundingValidator")?.status,
    ).toBe("PASS");
    expect(avaliacao.hardBlockers ?? []).toEqual([]);
    expect(avaliacao.level).not.toBe("LOW");
  });

  it.each([
    [
      "dia incorreto",
      resposta.replace("quintas-feiras, a partir das 13:30", "segundas-feiras, a partir das 13:30"),
    ],
    [
      "hora incorreta",
      resposta.replace("quintas-feiras, a partir das 13:30", "quintas-feiras, a partir das 17:30"),
    ],
    ["exame inventado", resposta.replace("Holter, MAPA", "Exame Fantasia, MAPA")],
    [
      "vaga sem agenda",
      resposta.replace(
        "Gostaria que eu verificasse as vagas disponíveis do Dr. Carlos Silva?",
        "Temos vaga quinta às 08:00 com o Dr. Carlos Silva.",
      ),
    ],
  ])("mantém o bloqueio quando existe %s", (_motivo, texto) => {
    const turno = estado(texto);
    for (const r of [decidirNoTurno(turno), verificarRespostaFinalDoTurno(turno, texto)]) {
      expect(r.level).toBe("LOW");
      expect(r.hardBlockers).toContain("UNGROUNDED_CLAIM");
      expect(r.decision).not.toBe("ALLOW");
    }
  });
});
