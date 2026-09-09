/**
 * ENVIO OTIMISTA DA MENSAGEM HUMANA (Fase 1 — desempenho do envio).
 *
 * A atendente clica em "Enviar" e a mensagem precisa aparecer na hora na
 * conversa. O envio real (validações, WhatsApp, gravação) continua igual no
 * servidor: aqui é só a representação local da intenção.
 *
 * Regras de segurança mantidas:
 * - a mensagem otimista nasce presa ao `conversa_id` capturado no clique e
 *   nunca é aplicada em outra conversa;
 * - otimista NÃO é confirmação: enquanto não houver a mensagem real do
 *   servidor, a bolha fica com estado "enviando" (ou "falhou").
 */

const TOLERANCIA_MS = 5 * 60 * 1000;

export const PREFIXO_OTIMISTA = "optimistic:";

export type MensagemOtimista = {
  id: string;
  client_message_id: string;
  conversa_id: string;
  direction: "out";
  body: string;
  tipo: "text";
  enviada_por: "humano";
  status: "sending" | "failed";
  recebida_em: string;
  enviada_por_user_id: string | null;
  optimistic: true;
};

export function ehOtimista(m: any): boolean {
  return !!m?.optimistic || (typeof m?.id === "string" && m.id.startsWith(PREFIXO_OTIMISTA));
}

export function novoClientMessageId(): string {
  const c: any = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function criarMensagemOtimista(p: {
  conversaId: string;
  texto: string;
  usuarioId?: string | null;
  clientMessageId?: string;
  agora?: Date;
}): MensagemOtimista {
  const clientMessageId = p.clientMessageId ?? novoClientMessageId();
  return {
    id: `${PREFIXO_OTIMISTA}${clientMessageId}`,
    client_message_id: clientMessageId,
    conversa_id: p.conversaId,
    direction: "out",
    body: p.texto,
    tipo: "text",
    enviada_por: "humano",
    status: "sending",
    recebida_em: (p.agora ?? new Date()).toISOString(),
    enviada_por_user_id: p.usuarioId ?? null,
    optimistic: true,
  };
}

function instante(m: any): number {
  return new Date(m?.recebida_em ?? m?.created_at ?? 0).getTime();
}

function ordenar(lista: any[]): any[] {
  return [...lista].sort((a, b) => instante(a) - instante(b));
}

/** Insere a mensagem otimista na lista da conversa correta (sem duplicar). */
export function inserirOtimista(msgs: any[], otimista: MensagemOtimista): any[] {
  const atuais = (msgs ?? []).filter((m) => m?.id !== otimista.id);
  return ordenar([...atuais, otimista]);
}

export function removerOtimista(msgs: any[], clientMessageId: string): any[] {
  return (msgs ?? []).filter((m) => m?.client_message_id !== clientMessageId || !ehOtimista(m));
}

export function marcarFalhaOtimista(msgs: any[], clientMessageId: string): any[] {
  return (msgs ?? []).map((m) =>
    ehOtimista(m) && m.client_message_id === clientMessageId ? { ...m, status: "failed" } : m,
  );
}

function temEquivalenteReal(otimista: any, lista: any[]): boolean {
  const corpo = String(otimista?.body ?? "").trim();
  const nascida = instante(otimista);
  return lista.some(
    (m) =>
      !ehOtimista(m) &&
      m?.direction === "out" &&
      m?.enviada_por === "humano" &&
      String(m?.body ?? "").trim() === corpo &&
      instante(m) >= nascida - TOLERANCIA_MS,
  );
}

/**
 * Remove as mensagens otimistas que já têm a mensagem real correspondente na
 * lista (o servidor não devolve o `client_message_id`, então o par é feito
 * pelo texto + autoria humana + janela de tempo).
 */
export function conciliarOtimistas(msgs: any[]): any[] {
  const lista = msgs ?? [];
  if (!lista.some(ehOtimista)) return lista;
  return lista.filter((m) => !ehOtimista(m) || !temEquivalenteReal(m, lista));
}

/**
 * Uma carga do servidor não pode apagar a mensagem que a atendente acabou de
 * mandar: as otimistas ainda sem par real são preservadas.
 */
export function preservarOtimistas(anteriores: any[], doServidor: any[]): any[] {
  const pendentes = (anteriores ?? []).filter(ehOtimista);
  if (pendentes.length === 0) return doServidor ?? [];
  return conciliarOtimistas(ordenar([...(doServidor ?? []), ...pendentes]));
}
