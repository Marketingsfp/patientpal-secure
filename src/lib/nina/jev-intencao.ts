/**
 * Jev — Fase 1: entender o pedido. Puro (sem rede), testável.
 * Com confiança alta a intenção do Jev prevalece; senão, fica a leitura atual.
 */
import type { IntencaoNina } from "./atendimento-fase1";
import type { PerguntaJev, RespostaJev } from "./jev";

export const CONFIANCA_MINIMA_INTENCAO = 0.8;

const OPCOES: Record<IntencaoNina | "continuacao" | "outro", string> = {
  agendamento: "Quer marcar uma consulta, exame ou procedimento.",
  disponibilidade: "Pergunta se há vaga ou horário livre, sem pedir para marcar ainda.",
  remarcacao: "Quer mudar o dia ou horário de algo já marcado.",
  cancelamento: "Quer cancelar ou desmarcar algo já marcado.",
  valor: "Pergunta preço, valores ou formas de pagamento.",
  medico: "Pergunta sobre médicos, profissionais ou especialidades atendidas.",
  consulta: "Fala de uma consulta sem dizer o que quer (preço, vaga ou marcar).",
  exame: "Fala de exames ou resultados de exame.",
  procedimento: "Fala de procedimento, vacina, curativo ou cirurgia.",
  preparo: "Pergunta sobre preparo, jejum ou o que fazer antes.",
  documentos: "Pergunta que documentos levar.",
  endereco: "Pergunta endereço ou como chegar.",
  horario: "Pergunta o horário de funcionamento da clínica.",
  financeiro: "Boleto, segunda via, nota fiscal, reembolso ou pagamento já feito.",
  falar_humano: "Pede explicitamente para falar com um atendente humano.",
  administrativo: "Convênio, cadastro, contrato, currículo ou reclamação.",
  // 25/09/2026: "continuação" separada de "outro". Antes, uma resposta curta no
  // meio do atendimento ("neuro", "carlos eduardo") se dividia entre outro,
  // agendamento e médico e parecia incompreensão.
  continuacao:
    "Responde ou continua a última pergunta ou oferta da atendente, sem trazer um pedido novo (ex.: escolhe uma das opções, informa especialidade, médico, data ou período — “de manhã”, “à tarde”, “depois do almoço”, “depois das 14h”, “tanto faz” —, pede mais horários — “mostra os outros”, “tem mais?” —, confirma ou recusa).",
  outro: "Saudação, agradecimento ou nada acima.",
};

export function perguntaIntencao(): Record<string, PerguntaJev> {
  return {
    intencao: {
      type: "choice",
      instructions:
        "Qual é o pedido principal do paciente na `mensagem_atual`? Use `mensagens_anteriores` (em ordem cronológica) e `contexto_atendimento` (etapa atual e opções já oferecidas) só como contexto para entender respostas curtas, como a escolha de uma das opções oferecidas.",
      criteria: OPCOES,
    },
  };
}

export function estadoIntencao(
  mensagemAtual: string,
  anteriores: Array<{ de: string; texto: string }>,
  contexto?: Record<string, unknown>,
) {
  return {
    mensagem_atual: mensagemAtual,
    mensagens_anteriores: anteriores.slice(-6),
    ...(contexto ? { contexto_atendimento: contexto } : {}),
  };
}

/** Devolve a intenção a aplicar, ou null (segue a leitura atual). */
export function intencaoAplicavel(r: RespostaJev | undefined): IntencaoNina | null {
  if (!r || typeof r.choice !== "string" || typeof r.confidence !== "number") return null;
  // "continuação" e "outro" não trocam a intenção: a Nina segue a etapa atual.
  if (r.choice === "outro" || r.choice === "continuacao" || !(r.choice in OPCOES)) return null;
  if (r.confidence < CONFIANCA_MINIMA_INTENCAO) return null;
  return r.choice as IntencaoNina;
}
