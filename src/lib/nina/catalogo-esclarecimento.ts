import type { ConhecimentoSessao } from "./confidence/conhecimento-sessao";
import type { ResultadoBroker } from "./tool-broker";
import type { ResultadoConhecimento } from "./knowledge-contract";
import { MOTIVO_SEM_REGISTRO, MOTIVO_MEDICO_SEM_REGISTRO } from "./catalogo-sem-registro";

export const LIMITE_ESCLARECIMENTOS = 2;

/** Estados anteriores à contagem representam a primeira pergunta já feita. */
export function contarEsclarecimentos(
  anterior: Pick<ConhecimentoSessao, "esclarecimento" | "esclarecimentoTentativas"> | null,
): number {
  if (!anterior?.esclarecimento) return 0;
  const n = anterior.esclarecimentoTentativas;
  return typeof n === "number" && Number.isFinite(n)
    ? Math.max(1, Math.min(LIMITE_ESCLARECIMENTOS, Math.floor(n)))
    : 1;
}

function identificacaoPendente(resultado: ResultadoBroker) {
  if (!["searchKnowledgeBase", "listCatalog"].includes(resultado.capacidade ?? "")) return null;
  const dados = resultado.dados as
    | (Partial<ResultadoConhecimento> & { fonte?: string; encaminhar_para_humano?: boolean })
    | null;
  const ausenciaTipada =
    dados?.fonte === "catalogo_publicado" &&
    dados.encaminhar_para_humano === true &&
    ["DOCTOR_NOT_FOUND", "PROCEDURE_NOT_FOUND"].includes(resultado.erro ?? "");
  if (dados?.limitacao_catalogo) return null;
  if ((!resultado.success || resultado.erro) && !ausenciaTipada) return null;
  return dados?.esclarecimento ||
    (dados?.found === false && dados.knowledge_status === "not_found") ||
    ausenciaTipada
    ? dados
    : null;
}

/** Compatibilidade dos chamadores: uma reformulação inconclusiva já encaminha. */
export function prepararSegundaPergunta(
  _anterior: ConhecimentoSessao | null,
  resultado: ResultadoBroker,
): ResultadoBroker {
  return resultado;
}

export const MOTIVO_IDENTIFICACAO_PENDENTE =
  "CATALOGO_IDENTIFICACAO_NAO_ESCLARECIDA: a Nina pediu confirmação e ainda não conseguiu identificar o atendimento ou profissional após a resposta";

export const MOTIVO_MEDICO_NAO_IDENTIFICADO =
  "CATALOGO_MEDICO_NAO_IDENTIFICADO: consulta encontrada; médico não identificado após repetir a lista e pedir nova escolha";

/** A tentativa pertence à sessão anterior, não ao número de consultas deste turno. */
export function encaminharAposEsclarecimento(
  anterior: ConhecimentoSessao | null,
  resultado: ResultadoBroker,
  respostaPaciente: string,
) {
  if (
    anterior?.esclarecimento?.motivo === "medico_nao_identificado" &&
    identificacaoPendente(resultado)
  ) {
    return {
      motivo: MOTIVO_MEDICO_NAO_IDENTIFICADO,
      resumo: `Consulta encontrada: ${anterior.esclarecimento.atendimento ?? anterior.consulta.termo}. Não foi possível identificar o médico após pedir uma nova escolha. Pergunta feita: ${anterior.esclarecimento.pergunta.slice(0, 1000)}. Resposta recebida: ${respostaPaciente.slice(0, 400)}. A equipe deve confirmar o profissional desejado e continuar o atendimento.`,
      urgencia: "normal" as const,
    };
  }
  // Já perguntamos uma vez após "não encontrado": nova falha encaminha.
  if (
    anterior?.esclarecimento?.motivo === "sem_registro_confirmar" &&
    identificacaoPendente(resultado)
  ) {
    return {
      motivo:
        anterior.esclarecimento.tipo === "profissional"
          ? MOTIVO_MEDICO_SEM_REGISTRO
          : MOTIVO_SEM_REGISTRO,
      resumo: `O atendimento solicitado não foi encontrado na base publicada, nem após pedir confirmação ao paciente. Busca inicial: ${anterior.consulta.termo.slice(0, 200)}. Pergunta feita: ${anterior.esclarecimento.pergunta.slice(0, 600)}. Resposta recebida: ${respostaPaciente.slice(0, 400)}. A equipe deve conferir e continuar a conversa; a ausência no catálogo não comprova que a clínica não oferece o serviço.`,
      urgencia: "normal" as const,
    };
  }
  if (
    (resultado.dados as Partial<ResultadoConhecimento> | null)?.esclarecimento?.motivo ===
    "medico_nao_identificado"
  )
    return null;
  if (
    !anterior?.esclarecimento ||
    contarEsclarecimentos(anterior) < 1 ||
    !identificacaoPendente(resultado)
  )
    return null;
  const perguntas = anterior.esclarecimentoPerguntas?.length
    ? anterior.esclarecimentoPerguntas
    : [anterior.esclarecimento.pergunta];
  return {
    motivo: MOTIVO_IDENTIFICACAO_PENDENTE,
    resumo: `Não foi possível identificar com segurança a consulta, o procedimento ou o profissional após a resposta ao esclarecimento. Pedido anterior: ${anterior.consulta.termo.slice(0, 200)}. Perguntas feitas: ${perguntas
      .slice(0, LIMITE_ESCLARECIMENTOS)
      .map((p, i) => `${i + 1}) ${p.slice(0, 600)}`)
      .join(
        " | ",
      )}. Resposta recebida: ${respostaPaciente.slice(0, 400)}. A equipe deve conferir o pedido e continuar o atendimento. Nenhum candidato foi escolhido automaticamente.`,
    urgencia: "normal" as const,
  };
}
