/**
 * Utilitários centrais de sanitização de entrada do usuário.
 *
 * Regra do projeto: todo texto livre digitado pelo usuário passa por
 * `limparTexto` antes de ir ao banco, e todo HTML renderizado com
 * `dangerouslySetInnerHTML` passa por `sanitizarHtmlRico`.
 */
import DOMPurify from "isomorphic-dompurify";

export { LIMITES, escapeHtml, limparTexto, limparLinha, somenteDigitos, urlSegura } from "./texto";

/**
 * Sanitiza HTML rico (contratos, modelos, landing pages) removendo
 * scripts, handlers de evento e elementos capazes de executar código.
 */
export function sanitizarHtmlRico(html: string): string {
  return DOMPurify.sanitize(html ?? "", {
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "link", "meta", "base"],
    FORBID_ATTR: ["srcdoc", "formaction", "ping"],
    ALLOW_DATA_ATTR: true,
  });
}
