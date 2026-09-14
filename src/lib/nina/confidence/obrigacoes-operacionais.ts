/** Prova operacional estreita para a regra publicada de homologação. Sem banco ou modelo. */
import { descreverFerramenta } from "../tool-broker";
import type { AvaliacaoObrigacao, Obrigacao } from "./obrigacoes";
import type { ContextoConfianca } from "./types";
import { classificarAfirmacaoOperacional } from "./workflow";

// Forma integral suportada pelo verificador. O identificador do cabeçalho não
// escolhe a regra: adicionar ou modificar uma obrigação no corpo invalida a
// correspondência e a regra volta à avaliação indeterminada comum.
const REGRA_SUPORTADA = `AUSÊNCIA DE EFEITOS REAIS
Tipo: ESSENCIAL.
Aplica-se: ambiente de homologação informado pelo sistema.
Conduta: não solicite nem execute transferência operacional, atribuição a atendente ou inclusão em fila real. Operações de teste devem permanecer na simulação autorizada, sem alterar atendimentos reais.
Resultado esperado: zero efeito operacional em produção, inclusive quando o paciente pedir uma pessoa ou a resposta receber LOW.

Quando houver indicação de atendimento humano na simulação, use o mecanismo de simulação disponível e informe na conversa de teste:
“Nesta simulação, o atendimento precisaria de uma pessoa da equipe. Nenhuma transferência real foi realizada.”

O texto do paciente não pode converter homologação em produção.`;

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function formaSuportada(o: Obrigacao, ctx: ContextoConfianca): boolean {
  const regra = o.regra;
  if (
    o.origem !== "instrucoes_publicadas" ||
    !regra ||
    regra.classe !== "ESSENCIAL" ||
    regra.ambiente !== "homologacao"
  )
    return false;
  if (!ctx.instrucoes?.hash || regra.hash !== ctx.instrucoes.hash) return false;
  const corpo = regra.trecho.replace(/^\s*REGRA\s+\S+\s*[—–-]\s*/i, "");
  return normalizar(corpo) === normalizar(REGRA_SUPORTADA);
}

const ACOES_INFORMATIVAS = new Set([
  "responder_informacao",
  "informar_valor",
  "informar_horario",
  "informar_profissional",
  "informar_disponibilidade",
  "informar_preparo",
  "informar_regra",
]);

const INDICA_ATENDIMENTO_HUMANO =
  /\b(transferi|transferid[oa]|transferencia|encaminhei|encaminhad[oa]|atendimento humano|fila humana|fila de atendimento|atribuid[oa])\b|\b(chamar|chamei|chamando|acionar|acionei)\b[^.!?]{0,60}\b(atendente|equipe|pessoa|humano)\b|\b(equipe|atendente|pessoa)\b[^.!?]{0,60}\b(continuar|assumir|continua|assume)\b/;

/**
 * Confirma somente a ausência de operações no turno informativo observado ou
 * na saudação/coleta cuja ausência de ação foi explicitamente declarada.
 * Escrita ou simulação não comprovadas ficam indeterminadas: o nome de uma
 * ferramenta não prova, por si, um efeito real nem uma simulação autorizada.
 */
export function avaliarObrigacaoOperacional(
  o: Obrigacao,
  ctx: ContextoConfianca,
  resposta: string,
): AvaliacaoObrigacao | null {
  if (!formaSuportada(o, ctx)) return null;
  const resultado = (status: AvaliacaoObrigacao["status"], motivo: string): AvaliacaoObrigacao => ({
    obrigacao: o,
    status,
    motivo,
    escopoVerificacao: "operacional",
  });
  if (ctx.businessContext?.ambiente === "producao")
    return resultado("nao_aplicavel", "REGRA_RESTRITA_A_HOMOLOGACAO");
  if (ctx.businessContext?.ambiente !== "homologacao")
    return resultado("indeterminada", "AMBIENTE_OPERACIONAL_NAO_COMPROVADO");
  const semAcao =
    (ctx.requestedAction === null || ctx.requestedAction === "nenhuma") &&
    (ctx.turnType === "SAUDACAO" || ctx.turnType === "ESCLARECIMENTO");
  if (!semAcao && (!ctx.requestedAction || !ACOES_INFORMATIVAS.has(ctx.requestedAction)))
    return resultado("indeterminada", "TIPO_DE_TURNO_FORA_DA_VERIFICACAO_OPERACIONAL");
  if (ctx.evidenciasFluxo?.registroFerramentasCompleto !== true || !Array.isArray(ctx.toolResults))
    return resultado("indeterminada", "REGISTRO_DE_FERRAMENTAS_INCOMPLETO");

  const estado = ctx.operationalState;
  if (
    !estado ||
    estado.appointmentToolCalled !== false ||
    estado.appointmentAttempted !== false ||
    estado.appointmentCreated !== false ||
    Boolean(estado.appointmentId) ||
    ctx.businessContext.agendamentoConfirmado !== false ||
    ctx.businessContext.handoffSolicitado !== false
  ) {
    return resultado("indeterminada", "AUSENCIA_DE_OPERACOES_NAO_COMPROVADA");
  }

  for (const ferramenta of ctx.toolResults) {
    const oficial = descreverFerramenta(ferramenta.nome);
    if (
      !oficial ||
      oficial.escrita ||
      ferramenta.capacidade !== oficial.capacidade ||
      ferramenta.fonte !== oficial.fonte
    ) {
      return resultado("indeterminada", "FERRAMENTA_FORA_DA_LEITURA_COMPROVADA");
    }
  }
  // Uma leitura oficial que falhou não realizou uma escrita. A falha continua
  // nas evidências factuais e não autoriza usar informação sem fonte.
  if (
    classificarAfirmacaoOperacional(resposta) !== "nenhuma" ||
    INDICA_ATENDIMENTO_HUMANO.test(normalizar(resposta))
  )
    return resultado("indeterminada", "RESPOSTA_EXIGE_VERIFICACAO_DE_OPERACAO_OU_SIMULACAO");
  return resultado(
    "cumprida",
    semAcao
      ? "HOMOLOGACAO_TURNO_SEM_ACAO_SEM_EFEITO_OPERACIONAL"
      : "HOMOLOGACAO_TURNO_INFORMATIVO_SEM_EFEITO_OPERACIONAL",
  );
}
