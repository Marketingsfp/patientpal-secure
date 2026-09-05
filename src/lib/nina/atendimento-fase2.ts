/**
 * FASE 2 do novo fluxo de atendimento da Nina — respostas factuais
 * fundamentadas na Base de Conhecimentos (a planilha oficial da clínica).
 *
 * Módulo PURO: só monta TEXTO DE PROMPT. Não lê banco, não altera a planilha,
 * não cria base paralela e não muda ferramentas nem regras existentes. A
 * consulta em si continua sendo feita pela ferramenta
 * "consultar_base_conhecimento" já existente.
 */
import type { IntencaoNina } from "./atendimento-fase1";

/** Intenções cuja resposta é FACTUAL e, portanto, precisa vir da planilha. */
export const INTENCOES_FACTUAIS: IntencaoNina[] = [
  "consulta",
  "exame",
  "procedimento",
  "valor",
  "medico",
  "endereco",
  "horario",
  "documentos",
  "preparo",
  "administrativo",
];

export function exigeBaseConhecimento(intencoes: IntencaoNina[]): boolean {
  return intencoes.some((i) => INTENCOES_FACTUAIS.includes(i));
}

/** Frase padrão quando a planilha não tem a informação. Nunca inventar. */
export const FRASE_SEM_INFORMACAO =
  "Não encontrei essa informação na minha base no momento. Vou encaminhar sua dúvida para nossa equipe.";

export type EntradaFase2 = {
  intencoes: IntencaoNina[];
  /** A clínica tem planilha ativa na Base de Conhecimentos? */
  baseAtiva: boolean;
};

export function blocoPromptFase2({ intencoes, baseAtiva }: EntradaFase2): string {
  const factual = exigeBaseConhecimento(intencoes);

  if (!baseAtiva) {
    return `FONTE DE VERDADE: esta clínica ainda não tem planilha ativa na Base de Conhecimentos. NÃO invente valores, médicos, dias, preparos, documentos ou regras: informe que vai confirmar com a equipe e siga o fluxo de atendimento humano.`;
  }

  return `FONTE OFICIAL DE VERDADE — PLANILHA DA BASE DE CONHECIMENTOS:
- A planilha cadastrada na Base de Conhecimentos é a ÚNICA fonte válida para: consultas, exames, procedimentos, valores, médicos, unidades, dias, horários administrativos, preparos, documentos, formas de pagamento, regras e orientações.
- Seu conhecimento próprio, prática de outras clínicas, média de mercado e internet estão PROIBIDOS para completar qualquer um desses fatos.

CAMINHO OBRIGATÓRIO DA RESPOSTA FACTUAL:
1. Entenda a intenção.
2. Chame "consultar_base_conhecimento".
3. Use apenas os fatos retornados.
4. Escreva a resposta com naturalidade, em 2 a 4 frases.
${
  factual
    ? "- A mensagem atual é FACTUAL: consulte a base ANTES de responder, mesmo que pareça óbvio ou já tenha sido citado antes na conversa."
    : "- A mensagem atual não parece factual; se ela virar pergunta de valor, médico, dia, preparo ou documento, consulte a base antes de responder."
}

ORDEM DA RESPOSTA:
- Responda PRIMEIRO exatamente o que foi perguntado (ex.: "A consulta de Cardiologia custa R$ X.").
- Só depois, e apenas quando fizer sentido, ofereça o próximo passo em UMA frase curta (ex.: "Se quiser, posso verificar a disponibilidade para você. 😊"). Nunca comece pela oferta e nunca insista.

INFORMAÇÃO AUSENTE (knowledge_status = not_found):
- Não invente, não estime, não pesquise fora da base e não presuma.
- Responda: "${FRASE_SEM_INFORMACAO}" e siga o fluxo de atendimento humano já existente.

INFORMAÇÃO CONFLITANTE (knowledge_status = conflict):
- Não escolha nenhuma das versões: diga que precisa confirmar com a equipe e siga o handoff.

NOMES PARECIDOS:
- Se a base retornar mais de um item semelhante (ex.: ultrassonografia de abdome total x abdome superior), NÃO escolha: pergunte em uma frase qual está no pedido médico.

LEMBRETE: horário da planilha é escala administrativa do profissional, não vaga. Disponibilidade real vem sempre das ferramentas de agenda.`;
}
