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

/**
 * Chave LÓGICA da mensagem (Fase 2).
 *
 * A bolha da tela e a linha do banco são a MESMA mensagem quando compartilham
 * o `client_message_id` — mesmo que o `id` local ("optimistic:...") seja
 * diferente do id do banco. Mensagens antigas (sem esse campo) continuam
 * identificadas pelo próprio `id`.
 */
export function chaveLogica(m: any): string {
  const c = m?.client_message_id;
  if (typeof c === "string" && c) return `cmid:${c}`;
  return `id:${String(m?.id ?? "")}`;
}

export function ehOtimista(m: any): boolean {
  return !!m?.optimistic || (typeof m?.id === "string" && m.id.startsWith(PREFIXO_OTIMISTA));
}

/** Sempre um UUID: o servidor valida o formato antes de aceitar o envio. */
export function novoClientMessageId(): string {
  const c: any = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
  const cmid = otimista?.client_message_id;
  // Caminho oficial (Fase 2): o par é provado pelo identificador do envio.
  if (cmid && lista.some((m) => !ehOtimista(m) && m?.client_message_id === cmid)) return true;
  // Se a mensagem oficial JÁ traz identificador de envio, ela não pode ser
  // confundida com outra: sem par por identificador, não há par.
  if (cmid && lista.some((m) => !ehOtimista(m) && m?.client_message_id)) {
    const iguais = lista.filter((m) => !ehOtimista(m) && m?.client_message_id === cmid);
    if (iguais.length === 0) {
      // Continua valendo a comparação antiga apenas para linhas SEM
      // identificador (mensagens gravadas antes desta fase).
      return paridadePorTexto(otimista, lista.filter((m) => !m?.client_message_id));
    }
  }
  return paridadePorTexto(otimista, lista);
}

/** Compatibilidade com mensagens antigas: texto + autoria humana + janela. */
function paridadePorTexto(otimista: any, lista: any[]): boolean {
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
 * lista. A prioridade é o `client_message_id`; o texto só é usado como
 * compatibilidade com mensagens antigas, que não têm esse identificador.
 */
export function conciliarOtimistas(msgs: any[]): any[] {
  const lista = msgs ?? [];
  if (!lista.some(ehOtimista)) return lista;
  return lista.filter((m) => !ehOtimista(m) || !temEquivalenteReal(m, lista));
}

/**
 * Mescla a mensagem oficial (resposta do servidor ou Realtime) sobre a bolha
 * otimista de mesmo `client_message_id`: a bolha não some e reaparece, apenas
 * muda de estado (`sending` → `sent`) e passa a usar o id do banco.
 */
export function mesclarOficial(msgs: any[], oficial: any): any[] {
  const cmid = oficial?.client_message_id;
  const lista = msgs ?? [];
  if (!cmid) return ordenar([...lista.filter((m) => m?.id !== oficial?.id), oficial]);
  let trocou = false;
  const nova = lista.flatMap((m) => {
    if (m?.client_message_id !== cmid) return [m];
    if (trocou) return [];
    trocou = true;
    return [{ ...m, ...oficial, optimistic: false }];
  });
  return ordenar(trocou ? nova : [...nova, oficial]);
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
