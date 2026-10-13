/**
 * Regras puras da fila de análise de ligações (testáveis sem banco).
 * Nada aqui recebe telefone nem texto de conversa.
 */
import type { ResultadoTranscricao } from "./telefonia-sufficit.server";

export type EstadoFila = "pendente" | "transcrito" | "analisado" | "sem_gravacao" | "erro";

export const MAX_TENTATIVAS = 3;
export const MIN_CARACTERES = 20;
export const ORCAMENTO_RODADA_MS = 60_000;

/** Prazo da transcrição dentro da rodada: o que sobra até ~55 s, mínimo 15 s. */
export function prazoTranscricao(decorridoMs: number): number {
  return Math.max(15_000, 55_000 - decorridoMs);
}

/** Só o código do erro (ex.: "HTTP 500"); nunca o corpo da resposta. */
export function codigoDoErro(mensagem: string): string {
  const m = /HTTP (\d{3})/.exec(mensagem);
  return m ? `HTTP ${m[1]}` : mensagem.slice(0, 120);
}

/**
 * Próximo estado depois de pedir a transcrição. `tentativas` já inclui esta.
 * - em processamento (202 / prazo estourado): continua pendente, não é erro;
 * - erro HTTP: pendente até a 3ª tentativa, depois `erro`;
 * - texto vazio ou < 20 caracteres: `sem_gravacao`, não tenta de novo;
 * - texto válido: `transcrito`.
 */
export function estadoAposTranscricao(
  r: ResultadoTranscricao,
  tentativas: number,
): { estado: EstadoFila; ultimoErro: string | null } {
  if (!r.ok) {
    return {
      estado: tentativas >= MAX_TENTATIVAS ? "erro" : "pendente",
      ultimoErro: codigoDoErro(r.erro),
    };
  }
  if (r.situacao === "em_processamento") return { estado: "pendente", ultimoErro: null };
  if (r.caracteres < MIN_CARACTERES) return { estado: "sem_gravacao", ultimoErro: null };
  return { estado: "transcrito", ultimoErro: null };
}
