import type { ConhecimentoSessao } from "./confidence/conhecimento-sessao";
import type { ResultadoBroker } from "./tool-broker";

export const MOTIVO_IDENTIFICACAO_PENDENTE =
  "CATALOGO_IDENTIFICACAO_NAO_ESCLARECIDA: a Nina pediu esclarecimento uma vez e ainda não conseguiu identificar o atendimento ou profissional";

/** A tentativa pertence à sessão anterior, não ao número de consultas deste turno. */
export function encaminharAposEsclarecimento(
  anterior: ConhecimentoSessao | null,
  resultado: ResultadoBroker,
  respostaPaciente: string,
) {
  if (!anterior?.esclarecimento || !resultado.success || resultado.erro) return null;
  if (!["searchKnowledgeBase", "listCatalog"].includes(resultado.capacidade ?? "")) return null;
  const dados = resultado.dados as {
    esclarecimento?: unknown;
    found?: boolean;
    knowledge_status?: string;
  } | null;
  if (!dados?.esclarecimento && !(dados?.found === false && dados.knowledge_status === "not_found"))
    return null;
  return {
    motivo: MOTIVO_IDENTIFICACAO_PENDENTE,
    resumo: `Não foi possível identificar com segurança a consulta, o procedimento ou o profissional após uma tentativa de esclarecimento. Pedido anterior: ${anterior.consulta.termo.slice(0, 200)}. Pergunta feita: ${anterior.esclarecimento.pergunta.slice(0, 600)}. Resposta recebida: ${respostaPaciente.slice(0, 400)}. A equipe deve conferir o pedido e continuar o atendimento. Nenhum candidato foi escolhido automaticamente.`,
    urgencia: "normal" as const,
  };
}
