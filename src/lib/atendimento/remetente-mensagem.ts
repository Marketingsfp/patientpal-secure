import { mensagemDoFrancisco } from "@/lib/francisco/autoria";

export type RotuloRemetente = "Francisco" | "Nina" | "Sistema";

/**
 * Quem enviou uma mensagem de saída, para o rótulo ao lado da hora (16/10/2026).
 * "Sistema" = mensagem pronta enviada pelo código (aviso de encaminhamento,
 * encerramento, pesquisa…), gravada com `enviada_por = 'sistema'`. O Francisco
 * também grava "sistema", mas se identifica por `raw.agente` (aqui `agente`,
 * lido sem carregar o `raw` inteiro). Atendente e supervisão têm rótulo próprio.
 */
export function rotuloRemetente(m: {
  direction?: string | null;
  enviada_por?: string | null;
  agente?: string | null;
  raw?: unknown;
}): RotuloRemetente | null {
  if (m.direction !== "out") return null;
  if (m.agente === "francisco" || mensagemDoFrancisco(m.raw)) return "Francisco";
  if (m.enviada_por === "nina") return "Nina";
  if (m.enviada_por === "sistema") return "Sistema";
  return null;
}
