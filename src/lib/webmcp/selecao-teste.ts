/**
 * Pequeno registro em memória com o lead de homologação aberto no console de
 * testes da Nina. Existe só para que a ferramenta WebMCP de leitura saiba qual
 * conversa sintética está em foco, sem precisar consultar o banco.
 *
 * Não guarda nada além de identificadores e do nome fictício do lead.
 */
import type { SelecaoTesteWebmcp } from "./contexto";

let selecao: SelecaoTesteWebmcp | null = null;

export function definirSelecaoTeste(valor: SelecaoTesteWebmcp | null): void {
  selecao = valor;
}

export function obterSelecaoTeste(): SelecaoTesteWebmcp | null {
  return selecao;
}
