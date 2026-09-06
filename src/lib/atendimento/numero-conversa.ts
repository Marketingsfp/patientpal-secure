/**
 * FASE 2 — Número permanente da conversa (#1342).
 *
 * O número é apenas uma etiqueta para a equipe localizar e citar a conversa.
 * O identificador técnico usado em todos os endpoints continua sendo o id
 * interno (UUID) — o número NUNCA o substitui.
 *
 * Regras de busca combinadas com a equipe:
 * - `#1342` → busca EXATA pelo número (não é prefixo: `#134` não acha `#1342`).
 * - `1342`  → continua valendo como texto/telefone, mas a correspondência
 *   exata do número aparece destacada em separado.
 * - Entrada inválida (`#`, `#abc`, `#0`) nunca quebra a tela: vira busca de
 *   texto comum ou nenhuma busca por número.
 */

/** Formato visível do número: sempre `#1342`. */
export function formatarNumeroConversa(numero: number | null | undefined): string | null {
  if (numero === null || numero === undefined) return null;
  const n = Number(numero);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return `#${n}`;
}

export type BuscaConversa = {
  /** Texto que continua indo para a busca por nome/telefone/protocolo. */
  texto: string;
  /** Número exato a procurar no backend, quando houver. */
  numero: number | null;
  /** `true` só quando a pessoa digitou `#`: aí a lista mostra só esse número. */
  exigeNumero: boolean;
};

const MAX_NUMERO = 1_000_000_000_000;

/** Interpreta o que foi digitado no campo de busca da Inbox. */
export function interpretarBuscaConversa(entrada: string | null | undefined): BuscaConversa {
  const bruto = typeof entrada === "string" ? entrada.trim() : "";
  if (!bruto) return { texto: "", numero: null, exigeNumero: false };

  if (bruto.startsWith("#")) {
    // Aceita "#1342", "# 1342" e "#1.342" (separadores digitados sem querer).
    const corpo = bruto.slice(1).replace(/[\s.]/g, "");
    const numero = numeroValido(corpo);
    if (numero === null) {
      // "#abc" não é número: segue como texto, sem erro na tela.
      return { texto: bruto.slice(1).trim(), numero: null, exigeNumero: false };
    }
    return { texto: "", numero, exigeNumero: true };
  }

  const numero = numeroValido(bruto);
  // Sem "#": a busca por nome/telefone continua igual; o número é um extra.
  return { texto: bruto, numero, exigeNumero: false };
}

function numeroValido(texto: string): number | null {
  if (!/^\d+$/.test(texto)) return null;
  const n = Number(texto);
  if (!Number.isSafeInteger(n) || n <= 0 || n >= MAX_NUMERO) return null;
  return n;
}
