import type { ConhecimentoSessao } from "./confidence/conhecimento-sessao";
import type { ResultadoBroker } from "./tool-broker";
import type { ResultadoConhecimento } from "./knowledge-contract";

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
  if ((!resultado.success || resultado.erro) && !ausenciaTipada) return null;
  return dados?.esclarecimento ||
    (dados?.found === false && dados.knowledge_status === "not_found") ||
    ausenciaTipada
    ? dados
    : null;
}

/** A segunda pergunta aproveita as opções atuais, sem repetir a primeira. */
export function prepararSegundaPergunta(
  anterior: ConhecimentoSessao | null,
  resultado: ResultadoBroker,
): ResultadoBroker {
  if (contarEsclarecimentos(anterior) !== 1) return resultado;
  const dados = identificacaoPendente(resultado);
  if (!dados) return resultado;
  const tipo = dados.esclarecimento?.tipo ?? anterior!.esclarecimento!.tipo;
  const opcoes = dados.esclarecimento?.opcoes ?? [];
  const nomes = opcoes.map((o) => [o.nome, o.especialidade, o.unidade].filter(Boolean).join(" — "));
  const consulta = (dados.tipo_atendimento ?? anterior!.consulta.tipo_atendimento) === "consulta";
  const pergunta =
    tipo === "profissional"
      ? `Para identificar o profissional, pode confirmar o nome completo, a especialidade ou a unidade?${nomes.length ? `\nAs opções encontradas são:\n${nomes.join("\n")}` : ""}`
      : nomes.length
        ? `Qual destas opções corresponde ${consulta ? "à consulta" : "ao exame ou procedimento"} que você deseja? Confira também os complementos do nome, se houver:\n${nomes.join("\n")}`
        : consulta
          ? "Pode confirmar a especialidade ou o nome completo do profissional com quem deseja a consulta?"
          : "Pode conferir e copiar o nome completo da consulta, do exame ou do procedimento que deseja? Se houver um pedido médico, escreva como está nele, incluindo os complementos do nome.";
  return { ...resultado, dados: { ...dados, esclarecimento: { tipo, opcoes, pergunta } } };
}

export const MOTIVO_IDENTIFICACAO_PENDENTE =
  "CATALOGO_IDENTIFICACAO_NAO_ESCLARECIDA: a Nina pediu esclarecimento duas vezes e ainda não conseguiu identificar o atendimento ou profissional";

/** A tentativa pertence à sessão anterior, não ao número de consultas deste turno. */
export function encaminharAposEsclarecimento(
  anterior: ConhecimentoSessao | null,
  resultado: ResultadoBroker,
  respostaPaciente: string,
) {
  if (
    !anterior?.esclarecimento ||
    contarEsclarecimentos(anterior) < LIMITE_ESCLARECIMENTOS ||
    !identificacaoPendente(resultado)
  )
    return null;
  const perguntas = anterior.esclarecimentoPerguntas?.length
    ? anterior.esclarecimentoPerguntas
    : [anterior.esclarecimento.pergunta];
  return {
    motivo: MOTIVO_IDENTIFICACAO_PENDENTE,
    resumo: `Não foi possível identificar com segurança a consulta, o procedimento ou o profissional após duas tentativas de esclarecimento. Pedido anterior: ${anterior.consulta.termo.slice(0, 200)}. Perguntas feitas: ${perguntas
      .slice(0, LIMITE_ESCLARECIMENTOS)
      .map((p, i) => `${i + 1}) ${p.slice(0, 600)}`)
      .join(
        " | ",
      )}. Resposta recebida: ${respostaPaciente.slice(0, 400)}. A equipe deve conferir o pedido e continuar o atendimento. Nenhum candidato foi escolhido automaticamente.`,
    urgencia: "normal" as const,
  };
}
