/**
 * Utilitários centrais de sanitização de entrada do usuário.
 *
 * Regra do projeto: todo texto livre digitado pelo usuário passa por
 * `limparTexto` antes de ir ao banco, e todo HTML renderizado com
 * `dangerouslySetInnerHTML` passa por `sanitizarHtmlRico`.
 */
import DOMPurify from "isomorphic-dompurify";

/** Limites de tamanho padrão para campos de texto do sistema. */
export const LIMITES = {
  /** Códigos, siglas, números de documento. */
  codigo: 40,
  /** Nomes de pessoa, títulos curtos, cidades. */
  nome: 120,
  /** E-mails. */
  email: 254,
  /** Endereços, descrições de uma linha. */
  linha: 255,
  /** Observações, justificativas. */
  observacao: 2000,
  /** Texto clínico longo (evolução, anamnese, laudo). */
  textoLongo: 20000,
  /** Documentos ricos em HTML (contratos, modelos). */
  html: 500000,
} as const;

/** Escapa caracteres perigosos para interpolação segura em HTML. */
export function escapeHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Normaliza texto simples vindo de formulário: remove caracteres de
 * controle invisíveis, normaliza quebras de linha e apara espaços.
 * Não escapa HTML — o React já escapa ao renderizar como texto.
 */
export function limparTexto(valor: unknown): string {
  return (
    String(valor ?? "")
      .replace(/\r\n?/g, "\n")
      // Caracteres de controle e marcas invisíveis usadas em ataques de
      // spoofing. Casar caracteres de controle É o propósito desta função,
      // então `no-control-regex` é falso positivo aqui.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g, "")
      .trim()
  );
}

/** Igual a `limparTexto`, mas também colapsa espaços internos (nomes, títulos). */
export function limparLinha(valor: unknown): string {
  return limparTexto(valor).replace(/\s+/g, " ");
}

/** Mantém apenas dígitos (CPF, CNPJ, telefone, CEP). */
export function somenteDigitos(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "");
}

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

/** Bloqueia URLs com esquemas executáveis (javascript:, data:, vbscript:). */
export function urlSegura(valor: unknown): string | null {
  const bruto = limparTexto(valor);
  if (!bruto) return null;
  if (/^(javascript|data|vbscript|file):/i.test(bruto)) return null;
  if (!/^(https?:\/\/|\/)/i.test(bruto)) return null;
  return bruto;
}
