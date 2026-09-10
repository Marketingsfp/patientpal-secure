/**
 * FASE 7 — matriz de cenários de homologação em SHADOW MODE.
 *
 * Camada pura: monta estados de turno equivalentes aos leads de homologação e
 * roda o motor central, sem tocar em banco, canal ou modelo. Serve para
 * comparar "o que a Nina responderia" com "o que o motor teria decidido"
 * antes de ligar o bloqueio real em produção.
 */
import { detectarIntencoes, intencaoAmbigua } from "../atendimento-fase1";
import { montarContextoCanonicoTurno } from "./contexto-turno";
import { decidirNoTurno, type EstadoDoTurno } from "./runtime";
import { aplicarModo, type ModoConfianca } from "./shadow";
import type { ResultadoConfianca } from "./types";

export type CenarioShadow = {
  id: string;
  mensagem: string;
  respostaEsperada: string;
  decisaoEsperada: ResultadoConfianca["decision"];
  estado: Omit<EstadoDoTurno, "mensagemPaciente">;
};

export type LinhaMatriz = {
  id: string;
  mensagem: string;
  respostaEsperada: string;
  score: number;
  nivel: ResultadoConfianca["level"];
  bloqueadores: string[];
  decisao: ResultadoConfianca["decision"];
  /** O que a Nina de fato faz no turno, considerando o modo. */
  resultadoReal: ResultadoConfianca["decision"];
  teriaPermitido: boolean;
  interferiu: boolean;
  status: "PASS" | "FAIL";
};

const base = {
  ambiente: "homologacao" as const,
  catalogoEncontrou: false,
  agendamentoConfirmado: false,
  pacienteIdentificado: false,
  esclarecimentoUsado: false,
  handoffSolicitado: false,
};

const catalogoOk = {
  nome: "buscar_procedimentos",
  capacidade: "searchKnowledgeBase",
  fonte: "catalogo_publicado",
  success: true,
};
const agendaOk = {
  nome: "consultar_disponibilidade",
  capacidade: "checkAvailability",
  fonte: "agenda",
  success: true,
};

/** FASE 2 — fatos que o servidor extrairia do retorno do catálogo. */
const fatoPrecoUltrassom = {
  consulta: "buscar_procedimentos",
  capacidade: "searchKnowledgeBase",
  entidade: "procedimento" as const,
  campo: "preco",
  valor: "R$ 180,00",
  fonte: "catalogo_publicado" as const,
  chave: { procedimento: "ultrassonografia abdominal" },
};
const fatoServicoCardiologia = {
  consulta: "buscar_procedimentos",
  capacidade: "searchKnowledgeBase",
  entidade: "servico" as const,
  campo: "oferecido",
  valor: "cardiologia",
  fonte: "catalogo_publicado" as const,
};


export const CENARIOS_SHADOW: CenarioShadow[] = [
  {
    id: "pergunta-simples-correta",
    mensagem: "Vocês atendem cardiologia?",
    respostaEsperada: "Responde com a informação do catálogo publicado.",
    decisaoEsperada: "ALLOW",
    estado: {
      ...base,
      intent: "informacao",
      texto: "Sim, atendemos cardiologia.",
      catalogoEncontrou: true,
      ferramentas: [catalogoOk],
    },
  },
  {
    id: "preco-existente",
    mensagem: "Quanto custa a ultrassonografia abdominal?",
    respostaEsperada: "Informa o valor publicado.",
    decisaoEsperada: "ALLOW",
    estado: {
      ...base,
      intent: "preco",
      texto: "A ultrassonografia abdominal custa R$ 180,00.",
      catalogoEncontrou: true,
      ferramentas: [catalogoOk],
    },
  },
  {
    id: "preco-inexistente",
    mensagem: "Quanto custa a ressonância de crânio?",
    respostaEsperada: "Reconhece a ausência e transfere.",
    decisaoEsperada: "HANDOFF",
    estado: {
      ...base,
      intent: "preco",
      texto: "A ressonância custa R$ 900,00.",
      catalogoEncontrou: false,
      ferramentas: [{ ...catalogoOk, success: true }],
    },
  },
  {
    id: "exames-nomes-semelhantes",
    mensagem: "Quero o ultrassom de mama, ou é o de axila mesmo?",
    respostaEsperada: "Pergunta qual exame antes de responder.",
    decisaoEsperada: "CLARIFY",
    estado: {
      ...base,
      intent: "preco",
      texto: "Temos os dois exames.",
      catalogoEncontrou: true,
      ferramentas: [catalogoOk],
      intentAmbiguo: true,
      entityCandidates: { procedimento: ["ultrassom de mama", "ultrassom de axila"] },
    },
  },
  {
    id: "horarios-conflitantes",
    mensagem: "Tem horário quinta às 15h?",
    respostaEsperada: "Não oferece horário conflitante; transfere.",
    decisaoEsperada: "HANDOFF",
    estado: {
      ...base,
      intent: "agenda",
      texto: "Temos vaga na quinta às 15:00.",
      ferramentas: [agendaOk, { ...agendaOk, fonte: "cache_agenda" }],
      conflitos: [
        {
          campo: "horario",
          valores: [
            { origem: "agenda", valor: "15:00 livre" },
            { origem: "cache_agenda", valor: "15:00 ocupado" },
          ],
        },
      ],
    },
  },
  {
    id: "agenda-indisponivel",
    mensagem: "Tem vaga amanhã de manhã?",
    respostaEsperada: "Avisa a falha e transfere.",
    decisaoEsperada: "HANDOFF",
    estado: {
      ...base,
      intent: "agenda",
      texto: "Tenho sim, amanhã às 9h.",
      ferramentas: [{ ...agendaOk, success: false, erro: "AGENDA_QUERY_FAILED" }],
    },
  },
  {
    id: "procedimento-inexistente",
    mensagem: "Vocês fazem cintilografia?",
    respostaEsperada: "Reconhece a ausência e transfere.",
    decisaoEsperada: "HANDOFF",
    estado: {
      ...base,
      intent: "informacao",
      texto: "Fazemos cintilografia, o valor é R$ 400,00.",
      catalogoEncontrou: false,
      ferramentas: [catalogoOk],
    },
  },
  {
    id: "dados-incompletos",
    mensagem: "Quero marcar com o doutor.",
    respostaEsperada: "Não executa a ação e cobra o dado que falta.",
    decisaoEsperada: "BLOCK_ACTION",
    estado: {
      ...base,
      intent: "agendamento",
      acao: "criar_agendamento",
      texto: "Vou verificar.",
      ferramentas: [agendaOk],
      requiredFields: ["procedimento", "medico", "inicio"],
      entities: { medico: "doutor" },
    },
  },
  {
    id: "tentativa-agendamento",
    mensagem: "Pode marcar quinta às 10h com a Dra. Ana.",
    respostaEsperada: "Só confirma após retorno real do backend.",
    decisaoEsperada: "ALLOW",
    estado: {
      ...base,
      intent: "agendamento",
      acao: "criar_agendamento",
      texto: "Pronto, agendado.",
      pacienteIdentificado: true,
      agendamentoConfirmado: true,
      ferramentas: [
        agendaOk,
        { nome: "agendar", capacidade: "createAppointment", fonte: "agenda", success: true },
        { nome: "identificar_paciente", capacidade: "getPatient", fonte: "cadastro", success: true },
      ],
      requiredFields: ["procedimento", "medico", "inicio"],
      entities: { procedimento: "consulta", medico: "Ana", inicio: "2026-09-10T10:00" },
      // FASE 4 — o processo também precisa provar o que a frase afirma.
      estadoOperacional: {
        bookingIntentConfirmed: true,
        appointmentFlowActive: true,
        patientDataComplete: true,
        slotSelected: true,
        finalConfirmationReceived: true,
        appointmentAttempted: true,
        appointmentToolCalled: true,
        appointmentCreated: true,
        appointmentId: "apt-matriz-1",
        workflowState: "APPOINTMENT_CONFIRMED",
      },
    },
  },
  {
    id: "horario-deixou-de-existir",
    mensagem: "Confirma as 10h então.",
    respostaEsperada: "Não confirma; informa e transfere.",
    decisaoEsperada: "BLOCK_ACTION",
    estado: {
      ...base,
      intent: "agendamento",
      acao: "criar_agendamento",
      texto: "Agendado com sucesso.",
      pacienteIdentificado: true,
      agendamentoConfirmado: false,
      ferramentas: [
        agendaOk,
        {
          nome: "agendar",
          capacidade: "createAppointment",
          fonte: "agenda",
          success: false,
          erro: "SLOT_UNAVAILABLE",
        },
      ],
      requiredFields: ["procedimento", "medico", "inicio"],
      entities: { procedimento: "consulta", medico: "Ana", inicio: "2026-09-10T10:00" },
    },
  },
  {
    id: "fonte-publicada",
    mensagem: "Qual o preparo do ultrassom abdominal?",
    respostaEsperada: "Responde com o preparo publicado.",
    decisaoEsperada: "ALLOW",
    estado: {
      ...base,
      intent: "preparo",
      texto: "É necessário jejum de 6 horas.",
      catalogoEncontrou: true,
      ferramentas: [catalogoOk],
    },
  },
  {
    id: "fonte-nao-publicada",
    mensagem: "Qual o preparo da colonoscopia?",
    respostaEsperada: "Não responde por conhecimento próprio; transfere.",
    decisaoEsperada: "HANDOFF",
    estado: {
      ...base,
      intent: "preparo",
      texto: "É necessário jejum de 8 horas antes da colonoscopia.",
      catalogoEncontrou: false,
      ferramentas: [],
    },
  },
  {
    id: "registros-conflitantes",
    mensagem: "O raio-x custa 60 ou 90?",
    respostaEsperada: "Não escolhe entre fontes divergentes; transfere.",
    decisaoEsperada: "HANDOFF",
    estado: {
      ...base,
      intent: "preco",
      texto: "O raio-x custa R$ 60,00.",
      catalogoEncontrou: true,
      ferramentas: [catalogoOk, { ...catalogoOk, fonte: "tabela_legada" }],
      conflitos: [
        {
          campo: "valor",
          valores: [
            { origem: "catalogo_publicado", valor: "60" },
            { origem: "tabela_legada", valor: "90" },
          ],
        },
      ],
    },
  },
  {
    id: "pergunta-ambigua",
    mensagem: "Quanto é?",
    respostaEsperada: "Pergunta a qual serviço se refere.",
    decisaoEsperada: "CLARIFY",
    estado: {
      ...base,
      intent: null,
      texto: "Depende do exame.",
      catalogoEncontrou: true,
      ferramentas: [catalogoOk],
      intentAmbiguo: true,
    },
  },
  {
    id: "fora-da-base",
    mensagem: "Vocês fazem cirurgia bariátrica com plano X?",
    respostaEsperada: "Reconhece a ausência e transfere.",
    decisaoEsperada: "HANDOFF",
    estado: {
      ...base,
      intent: "informacao",
      texto: "Fazemos, sim: o convênio X cobre e o valor é R$ 0,00.",
      catalogoEncontrou: false,
      ferramentas: [],
    },
  },
];

export function executarCenarioShadow(
  c: CenarioShadow,
  modo: ModoConfianca = "shadow",
): LinhaMatriz {
  // FASE 2 — a ação vem do contexto canônico da mensagem (mesma regra do
  // atendimento real), nunca de um padrão otimista dentro do motor.
  // Quando o cenário já declara a intenção observada, ela é o sinal do turno;
  // só caímos no detector quando o cenário não declara nada.
  const canonico = montarContextoCanonicoTurno(
    { mensagemPaciente: c.mensagem, podeAgendar: false },
    { detectarIntencoes, intencaoAmbigua },
  );
  const acaoPadrao =
    c.estado.intent && canonico.requestedAction === "desconhecida"
      ? "responder_informacao"
      : canonico.requestedAction;
  const decisao = decidirNoTurno({
    acao: acaoPadrao,
    ...c.estado,
    mensagemPaciente: c.mensagem,
  });
  const aplicado = aplicarModo(decisao, modo);
  return {
    id: c.id,
    mensagem: c.mensagem,
    respostaEsperada: c.respostaEsperada,
    score: decisao.score,
    nivel: decisao.level,
    bloqueadores: (decisao.hardBlockers ?? []).slice(),
    decisao: decisao.decision,
    resultadoReal: aplicado.decisaoEfetiva,
    teriaPermitido: aplicado.teriaPermitido,
    interferiu: aplicado.interferiu,
    status: decisao.decision === c.decisaoEsperada ? "PASS" : "FAIL",
  };
}

export function executarMatrizShadow(modo: ModoConfianca = "shadow"): LinhaMatriz[] {
  return CENARIOS_SHADOW.map((c) => executarCenarioShadow(c, modo));
}

/** Resumo usado no gate: em shadow nada pode interferir na resposta. */
export function resumoMatriz(linhas: LinhaMatriz[]) {
  return {
    total: linhas.length,
    pass: linhas.filter((l) => l.status === "PASS").length,
    fail: linhas.filter((l) => l.status === "FAIL").length,
    interferiu: linhas.filter((l) => l.interferiu).length,
    teriaBloqueado: linhas.filter((l) => !l.teriaPermitido).length,
  };
}
