import { ehOtimista } from "./envio-otimista";

/**
 * Responder citando (16/10/2026): o paciente ou a atendente responde a uma
 * mensagem específica. O vínculo é o `wa_message_id` da Meta, guardado em
 * `whatsapp_mensagens.quoted_message_id` (coluna que já existia sem uso).
 */
export type MensagemCitada = {
  wa_message_id: string;
  direction: string | null;
  enviada_por: string | null;
  tipo: string | null;
  body: string | null;
};

export type CitacaoExibida = { autor: string; texto: string; encontrada: boolean };

const LIMITE_TEXTO = 160;

/** Só mensagem que chegou de fato ao WhatsApp pode ser citada (tem id da Meta). */
export function waIdCitavel(m: {
  id?: unknown;
  optimistic?: unknown;
  wa_message_id?: unknown;
  status?: unknown;
}): string | null {
  if (!m || ehOtimista(m) || m.status === "system") return null;
  const id = typeof m.wa_message_id === "string" ? m.wa_message_id.trim() : "";
  return id || null;
}

export function autorDaCitacao(c: Pick<MensagemCitada, "direction" | "enviada_por">): string {
  if (c.direction === "in") return "Paciente";
  return c.enviada_por === "nina" ? "Nina" : "Equipe";
}

export function textoDaCitacao(c: Pick<MensagemCitada, "tipo" | "body">): string {
  const corpo = String(c.body ?? "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!corpo) return c.tipo === "audio" ? "🎤 Áudio" : `[${c.tipo ?? "mensagem"}]`;
  return corpo.length > LIMITE_TEXTO ? `${corpo.slice(0, LIMITE_TEXTO - 1).trimEnd()}…` : corpo;
}

/**
 * Trecho mostrado acima do texto da bolha. Usa a citação que veio do servidor
 * ou, para mensagens que chegaram pelo tempo real, a mensagem já carregada.
 */
export function exibirCitacao(
  m: { quoted_message_id?: unknown; citacao?: MensagemCitada | null },
  porWaId: ReadonlyMap<string, MensagemCitada>,
): CitacaoExibida | null {
  const alvo = typeof m.quoted_message_id === "string" ? m.quoted_message_id : "";
  if (!alvo) return null;
  const citada = m.citacao ?? porWaId.get(alvo);
  if (!citada)
    return { autor: "", texto: "Mensagem citada não está disponível.", encontrada: false };
  return { autor: autorDaCitacao(citada), texto: textoDaCitacao(citada), encontrada: true };
}

/** Ids citados que não estão entre as mensagens já carregadas. */
export function citacoesFaltantes(
  mensagens: ReadonlyArray<{ quoted_message_id?: unknown; wa_message_id?: unknown }>,
): string[] {
  const carregadas = new Set(
    mensagens.map((m) => m.wa_message_id).filter((v): v is string => typeof v === "string"),
  );
  const faltam = new Set<string>();
  for (const m of mensagens) {
    const q = m.quoted_message_id;
    if (typeof q === "string" && q && !carregadas.has(q)) faltam.add(q);
  }
  return [...faltam];
}
