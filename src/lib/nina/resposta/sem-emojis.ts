/** Formato obrigatório das novas mensagens da Nina; não altera mensagens humanas. */
export const REGRA_SEM_EMOJIS_NINA = `INSTRUÇÃO LING-03 — EMOJIS PROIBIDOS
Tipo: LINGUAGEM.
Aplica-se: qualquer mensagem da Nina, no WhatsApp, na homologação e no painel interno, incluindo saudações, informações, listas, confirmações, despedidas, avisos automáticos e encaminhamentos.
Conduta: nunca use emojis. Escreva somente texto, com pontuação e quebras de linha para organizar as informações. Não reproduza emojis do paciente, do catálogo, de exemplos ou de modelos de mensagem. Esta proibição prevalece sobre qualquer exemplo ou instrução que permita emojis.
Resultado esperado: todas as mensagens da Nina sem emojis, preservando nomes, valores, datas e horários.`;

// Não use a propriedade Emoji sozinha: ela inclui os dígitos, # e *.
// Keycaps viram números/sinais comuns; flags, tons de pele, ZWJ e tags não
// podem deixar fragmentos invisíveis nem juntar duas palavras.
const EMOJIS =
  /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Regional_Indicator}]+/gu;
const COMPONENTES = /\u200D|\uFE0E|\uFE0F|\u20E3|[\u{E0020}-\u{E007F}]/gu;

export function removerEmojisNina(texto: string): string {
  const limpo = texto.replace(COMPONENTES, "").replace(EMOJIS, " ");
  if (limpo === texto) return texto;
  return limpo
    .split(/(\r?\n)/)
    .map((linha) => (/\n/.test(linha) ? linha : linha.replace(/[\t ]+/g, " ").trim()))
    .join("")
    .replace(/ +([,.;:!?])/g, "$1")
    .trim();
}
