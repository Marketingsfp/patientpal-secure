/**
 * Canal para abrir a Tabela de Valores de qualquer lugar do sistema.
 *
 * Fica separado do componente porque quem dispara (o atalho global de
 * teclado) não deve importar a gaveta inteira só para pedir que ela abra.
 */

/** Evento disparado no `window` para abrir a gaveta de valores. */
export const EVENTO_ABRIR_TABELA_VALORES = "tabela-valores:abrir";

export function abrirTabelaValores(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_TABELA_VALORES));
}
