/**
 * Mensagem que a Nina não consegue ler (decisão do usuário, 16/10/2026).
 *
 * - `unsupported`: o WhatsApp não entrega pela API (erro 131051 da Meta) —
 *   foto/vídeo de visualização única, enquete, mensagem editada, evento.
 * - `video`, `location`, `contacts`: chegam, mas a Nina não lê.
 *
 * Antes, essas mensagens não acionavam a Nina nem a equipe: a conversa ficava
 * com a Nina, bloqueada para as atendentes, e o paciente sem resposta. Agora a
 * Nina pede para reenviar; se a mensagem seguinte também não puder ser lida,
 * a conversa vai para a equipe.
 */
export const TIPOS_NAO_LIDOS: ReadonlySet<string> = new Set([
  "unsupported",
  "video",
  "location",
  "contacts",
]);

export function ehMensagemNaoLida(tipo: string | null | undefined): boolean {
  return TIPOS_NAO_LIDOS.has(String(tipo ?? ""));
}

export const MOTIVO_MENSAGEM_NAO_LIDA = "MENSAGEM_NAO_LIDA";

/** Intervalo em que duas mensagens ilegíveis contam como "seguidas". */
export const JANELA_NAO_LIDA_SEGUIDA_MS = 24 * 60 * 60 * 1000;

/**
 * Entradas do paciente na conversa, da mais nova para a mais antiga (a atual
 * primeiro). Verdadeiro quando a anterior também não pôde ser lida, dentro da
 * janela: a Nina já pediu para reenviar e não adiantou.
 */
export function segundaNaoLidaSeguida(
  entradas: readonly { tipo?: string | null; created_at?: string | null }[],
  agora = Date.now(),
): boolean {
  const anterior = entradas[1];
  if (!anterior || !ehMensagemNaoLida(anterior.tipo)) return false;
  const quando = Date.parse(String(anterior.created_at ?? ""));
  return Number.isFinite(quando) && agora - quando <= JANELA_NAO_LIDA_SEGUIDA_MS;
}
