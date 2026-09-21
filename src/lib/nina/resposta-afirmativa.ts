/** Escrita informal só indica concordância; o chamador precisa comprovar
 * a pergunta respondida e a opção. Nunca autoriza uma operação por si só. */
export function normalizarRespostaInformal(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[.!…,;:]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      // Alongamentos expressivos apenas de palavras conhecidas, não nomes ou siglas.
      .replace(/\bs+i+m+\b/g, "sim")
      .replace(/\bi+s+o+\b/g, "isso")
      .replace(/\bok+\b/g, "ok")
      .replace(/\b(?:ss|s)\b/g, "sim")
      .replace(/\beh\b/g, "e")
      .replace(/\bmsm\b/g, "mesmo")
      .replace(/\b(?:pfv|pfvr)\b/g, "por favor")
  );
}

/** Não aceita fragmentos positivos dentro de uma recusa, condição ou pergunta. */
export function ehRespostaAfirmativaCurta(texto: string): boolean {
  if (!texto || texto.length > 160 || /[?¿]/.test(texto)) return false;
  const t = normalizarRespostaInformal(texto)
    .replace(/\s+(?:por favor|por gentileza|obrigad[oa])$/, "")
    .replace(/^sim\s+(?=(?:e |esse|essa|este|esta|isso|ele|ela)\b)/, "");
  return /^(?:sim(?: sim| confirmo| pode ser)?|isso(?: mesmo| ai| ae)?|(?:e )?(?:esse|essa|este|esta|ele|ela)(?: mesmo| mesma| ai)?|e(?: isso(?: mesmo)?| sim)?|confirmo|correto|correta|certo|certinho|exatamente|positivo|aham|uhum|claro|com certeza|ok|okay|okey|beleza|blz|pode ser|pode sim|quero esse|quero essa|esse ai mesmo|essa ai mesma|fechado|fechou|ta bom|ta certo|ta certo sim)$/.test(
    t,
  );
}
