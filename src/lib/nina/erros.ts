/**
 * FASE 5 — POLÍTICA ÚNICA DE ERROS, TIMEOUT E RETRY DA NINA.
 *
 * Arquivo PURO (sem rede, sem banco) para poder ser testado e para que ninguém
 * espalhe `if (status === 429)` pelo sistema.
 *
 * Princípio: só repete o que é tecnicamente recuperável (instabilidade do
 * provedor, limite momentâneo, timeout de rede). Informação que NÃO EXISTE
 * (knowledge_not_found), regra de negócio e erro de configuração nunca entram
 * em laço de repetição — repetir não faria a informação aparecer.
 */

export type CategoriaErro =
  | "gemini_error" // o modelo respondeu erro (5xx do provedor/upstream)
  | "timeout" // estourou tempo/rede caiu no meio
  | "provider_temporary" // limite de uso / indisponibilidade momentânea (429, 503)
  | "provider_config" // chave ausente/inválida, créditos, bloqueio (401/402/403)
  | "bad_request" // pedido inválido (400) — repetir devolve o mesmo erro
  | "knowledge_error" // falha ao LER a Base de Conhecimentos
  | "knowledge_not_found" // a Base não tem o dado — não é falha técnica
  | "tool_error" // ferramenta real (agenda/CRM) devolveu erro
  | "business_rule" // regra de negócio impediu a operação
  | "unknown";

export type EntradaClassificacao = {
  /** HTTP status do provedor, quando houver. */
  status?: number | null;
  /** Mensagem/erro cru. Nunca guardamos raciocínio, só o texto do erro. */
  erro?: unknown;
  /** Origem da falha, quando quem chama já sabe. */
  origem?: "modelo" | "base" | "ferramenta" | "regra";
};

const TIMEOUT_RE = /timeout|timed out|aborted|abort|etimedout|econnreset|network|fetch failed/i;
const NOT_FOUND_RE = /not_found|não encontrad|nao encontrad|sem resultado/i;
const REGRA_RE = /regra de neg|não permitido|nao permitido|conflito de hor|já existe|ja existe|indispon/i;

export function classificarErro(entrada: EntradaClassificacao): CategoriaErro {
  const texto =
    entrada.erro instanceof Error
      ? entrada.erro.message
      : typeof entrada.erro === "string"
        ? entrada.erro
        : "";
  const status = entrada.status ?? null;

  if (entrada.origem === "regra") return "business_rule";
  if (entrada.origem === "base") {
    return NOT_FOUND_RE.test(texto) ? "knowledge_not_found" : "knowledge_error";
  }
  if (entrada.origem === "ferramenta") {
    return REGRA_RE.test(texto) ? "business_rule" : "tool_error";
  }

  if (TIMEOUT_RE.test(texto)) return "timeout";
  if (status === 429 || status === 503) return "provider_temporary";
  if (status === 401 || status === 402 || status === 403) return "provider_config";
  if (status === 400 || status === 404 || status === 422) return "bad_request";
  if (status !== null && status >= 500) return "gemini_error";
  if (texto) return "unknown";
  return "unknown";
}

/** Categorias tecnicamente recuperáveis. Todo o resto é terminal. */
export const CATEGORIAS_RECUPERAVEIS: readonly CategoriaErro[] = [
  "gemini_error",
  "timeout",
  "provider_temporary",
  "knowledge_error",
];

export const MAX_TENTATIVAS = 3; // 1 chamada + 2 repetições

export type DecisaoRetry = {
  repetir: boolean;
  /** Espera antes da próxima tentativa (backoff simples com teto). */
  esperaMs: number;
  motivo: string;
};

/**
 * @param tentativa número da tentativa já executada (1 = primeira chamada).
 */
export function decidirRetry(
  categoria: CategoriaErro,
  tentativa: number,
  opcoes?: { retryAfterMs?: number | null; maxTentativas?: number },
): DecisaoRetry {
  const max = opcoes?.maxTentativas ?? MAX_TENTATIVAS;
  if (!CATEGORIAS_RECUPERAVEIS.includes(categoria)) {
    return { repetir: false, esperaMs: 0, motivo: `${categoria}: erro terminal` };
  }
  if (tentativa >= max) {
    return { repetir: false, esperaMs: 0, motivo: `limite de ${max} tentativas atingido` };
  }
  const base = Math.min(4000, 500 * 2 ** (tentativa - 1));
  const espera = Math.max(base, opcoes?.retryAfterMs ?? 0);
  return { repetir: true, esperaMs: espera, motivo: `${categoria}: recuperável` };
}

/** Mensagem curta em português para a clínica. Nunca expõe detalhe interno. */
export function mensagemCategoria(categoria: CategoriaErro): string {
  switch (categoria) {
    case "timeout":
      return "A Nina demorou demais para responder. Tente novamente.";
    case "provider_temporary":
      return "Serviço de IA ocupado no momento. Tente em alguns segundos.";
    case "provider_config":
      return "Configuração de IA indisponível no momento.";
    case "knowledge_not_found":
      return "Essa informação não está cadastrada na Base de Conhecimentos.";
    case "knowledge_error":
      return "Não foi possível consultar a Base de Conhecimentos agora.";
    case "tool_error":
      return "Não foi possível concluir a consulta no sistema.";
    case "business_rule":
      return "A operação não é permitida pelas regras atuais.";
    case "bad_request":
      return "Pedido inválido para o serviço de IA.";
    case "gemini_error":
      return "Falha temporária na resposta da Nina.";
    default:
      return "Falha na resposta da Nina.";
  }
}
