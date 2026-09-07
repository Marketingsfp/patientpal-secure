/**
 * Regras puras do modal de auditoria "Ver conversa" (Revisão de aprendizados).
 *
 * Separadas da UI para poderem ser testadas: formatação de data/hora, autoria
 * explícita, montagem da linha do tempo, localização da mensagem reportada
 * (SEMPRE por id, nunca por texto) e o estado de vínculo do reporte.
 *
 * Proibido, por regra do projeto: cair na "primeira conversa do lead" quando
 * o vínculo exato não existir.
 */

export type MensagemAuditoria = {
  id: string;
  direction: string | null;
  body: string | null;
  tipo: string | null;
  enviada_por: string | null;
  recebida_em: string;
  media_url: string | null;
  media_mime: string | null;
};

/** Timestamp real persistido, sempre DD/MM/AAAA HH:mm:ss. */
export function fmtHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** Autoria explícita: não depender só do lado do balão. */
export function autorDe(
  m: Pick<MensagemAuditoria, "enviada_por" | "direction">,
  atendenteNome: string | null,
): string {
  const por = (m.enviada_por ?? "").toLowerCase();
  if (por === "sistema") return "Sistema";
  if (por === "nina" || por === "ia" || por === "bot") return "Nina";
  if (por === "humano" || por === "atendente")
    return atendenteNome ? `Atendente — ${atendenteNome}` : "Atendente";
  if (por === "paciente") return "Paciente";
  return m.direction === "out" ? "Nina" : "Paciente";
}

/** Código curto e legível para IDs longos (erro, conversa, mensagem). */
export function curto(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.slice(0, 8).toUpperCase();
}

/**
 * Localiza a mensagem reportada exclusivamente pelo id.
 * Duas mensagens com texto idêntico não confundem o resultado.
 */
export function localizarMensagem(
  mensagens: MensagemAuditoria[],
  mensagemId: string | null | undefined,
): MensagemAuditoria | null {
  if (!mensagemId) return null;
  return mensagens.find((m) => m.id === mensagemId) ?? null;
}

export type EstadoAuditoria =
  | "sem-conversa"
  | "falha-conversa"
  | "sem-mensagem-vinculada"
  | "mensagem-nao-encontrada"
  | "ok";

/** Estado do vínculo do reporte — nunca sugere abrir outra conversa. */
export function estadoAuditoria(args: {
  conversaId: string | null | undefined;
  mensagemId: string | null | undefined;
  erroCarregamento?: boolean;
  mensagemEncontrada?: boolean | null;
}): EstadoAuditoria {
  if (!args.conversaId) return "sem-conversa";
  if (args.erroCarregamento) return "falha-conversa";
  if (!args.mensagemId) return "sem-mensagem-vinculada";
  if (args.mensagemEncontrada === false) return "mensagem-nao-encontrada";
  return "ok";
}

export function avisoAuditoria(estado: EstadoAuditoria): string | null {
  switch (estado) {
    case "sem-conversa":
    case "falha-conversa":
      return "Não foi possível localizar a conversa exata vinculada a este reporte.";
    case "mensagem-nao-encontrada":
      return "Conversa localizada, mas a mensagem original do reporte não foi encontrada.";
    case "sem-mensagem-vinculada":
      return "Vínculo histórico exato indisponível.";
    default:
      return null;
  }
}

export type ItemTimeline<E extends { id: string; created_at: string }> =
  | { t: string; kind: "msg"; msg: MensagemAuditoria }
  | { t: string; kind: "evento"; ev: E };

/** Mensagens e eventos de sistema em uma única linha do tempo, por horário. */
export function montarTimeline<E extends { id: string; created_at: string }>(
  mensagens: MensagemAuditoria[],
  eventos: E[],
): ItemTimeline<E>[] {
  return [
    ...mensagens.map((m) => ({ t: m.recebida_em, kind: "msg" as const, msg: m })),
    ...eventos.map((ev) => ({ t: ev.created_at, kind: "evento" as const, ev })),
  ].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
}
