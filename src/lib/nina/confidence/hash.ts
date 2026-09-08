/**
 * FASE 5 — impressão digital do texto avaliado.
 *
 * Serve a um único propósito: provar que o score persistido corresponde
 * EXATAMENTE ao texto que o paciente recebeu. Não é criptografia, é
 * correspondência determinística e barata (sem async, sem dependência).
 */
export function hashDoTexto(texto: string | null | undefined): string | null {
  if (texto === null || texto === undefined) return null;
  const t = normalizarTexto(texto);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
  }
  return `t1:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}:${t.length}`;
}

/** Só espaços em branco de borda são ignorados: qualquer outra mudança conta. */
export function normalizarTexto(texto: string): string {
  return texto.replace(/\r\n/g, "\n").trim();
}

/** A avaliação foi feita sobre este texto exato? */
export function avaliacaoCorrespondeAoTexto(
  hashAvaliado: string | null | undefined,
  texto: string | null | undefined,
): boolean {
  const atual = hashDoTexto(texto ?? null);
  return Boolean(hashAvaliado) && hashAvaliado === atual;
}
