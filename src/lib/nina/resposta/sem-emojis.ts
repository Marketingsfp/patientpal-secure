/** Regra de emojis das mensagens da Nina (permitidos com moderação). */
export const REGRA_SEM_EMOJIS_NINA = `INSTRUÇÃO LING-03 — EMOJIS COM MODERAÇÃO
Tipo: LINGUAGEM.
Aplica-se: qualquer mensagem da Nina.
Conduta: emojis são permitidos para deixar a conversa acolhedora, no máximo um por mensagem, de preferência em saudações e despedidas. Não use emojis para identificar dias, horários, valores ou condições, nem em avisos de urgência, cancelamento ou reclamação.
Resultado esperado: tom humano e cordial, sem prejudicar a clareza das informações.`;

// Não use a propriedade Emoji sozinha: ela inclui os dígitos, # e *.
const EMOJIS =
  /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Regional_Indicator}]+/gu;
const COMPONENTES = /\u200D|\uFE0E|\uFE0F|\u20E3|[\u{E0020}-\u{E007F}]/gu;

/** Remove emojis de um texto (usado para dados como nome do paciente). */
export function removerEmojis(texto: string): string {
  const limpo = texto.replace(COMPONENTES, "").replace(EMOJIS, " ");
  if (limpo === texto) return texto;
  return limpo
    .split(/(\r?\n)/)
    .map((linha) => (/\n/.test(linha) ? linha : linha.replace(/[\t ]+/g, " ").trim()))
    .join("")
    .replace(/ +([,.;:!?])/g, "$1")
    .trim();
}

/**
 * Finalização das mensagens da Nina. Emojis passaram a ser permitidos
 * (decisão da clínica em 01/10/2026): o texto segue sem alteração.
 */
export function removerEmojisNina(texto: string): string {
  return texto;
}
