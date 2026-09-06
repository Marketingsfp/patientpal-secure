/**
 * Quem pode zerar o contador de mensagens não lidas de uma conversa da Inbox.
 *
 * Hoje o contador (`atend_conversas.unread_count`) é ÚNICO por conversa: ele é
 * somado pelo gatilho de mensagem recebida e é o mesmo número visto por todo
 * mundo. Por isso, uma supervisão que marcasse "lido" apagaria o aviso da
 * atendente responsável.
 *
 * Regra conservadora desta fase: só a atendente responsável pela conversa
 * marca leitura automaticamente. Quem tem perfil administrativo/gestor apenas
 * acompanha — mesmo que também atenda, mesmo que a conversa seja dele. Nada
 * aqui altera responsável, status, fila ou os recibos enviados ao WhatsApp.
 */

export const MOTIVO_LEITURA = {
  /** Pode marcar: é a atendente responsável e não está supervisionando. */
  responsavel: "responsavel",
  /** Perfil administrativo/gestor: acompanha sem alterar a leitura alheia. */
  supervisao: "supervisao",
  /** Conversa de outra pessoa (ou sem responsável): não é leitura dele. */
  nao_responsavel: "nao_responsavel",
} as const;

export type MotivoLeitura = (typeof MOTIVO_LEITURA)[keyof typeof MOTIVO_LEITURA];

export type ContextoLeitura = {
  /** Usuário autenticado (vem do backend, nunca do que a tela informar). */
  userId: string;
  /** Responsável atual pela conversa. */
  atribuidaUserId: string | null | undefined;
  /** Perfil administrativo/gestor/supervisor na clínica da conversa. */
  ehGestor: boolean;
};

export function avaliarLeituraAutomatica(ctx: ContextoLeitura): {
  pode: boolean;
  motivo: MotivoLeitura;
} {
  // Acumulou perfil administrativo e de atendente? Regra conservadora:
  // a abertura não marca nada como lido.
  if (ctx.ehGestor) return { pode: false, motivo: MOTIVO_LEITURA.supervisao };
  if (!ctx.atribuidaUserId || ctx.atribuidaUserId !== ctx.userId) {
    return { pode: false, motivo: MOTIVO_LEITURA.nao_responsavel };
  }
  return { pode: true, motivo: MOTIVO_LEITURA.responsavel };
}

/** Atalho booleano para a tela decidir se sequer chama o backend. */
export function podeMarcarLidaAutomaticamente(ctx: ContextoLeitura): boolean {
  return avaliarLeituraAutomatica(ctx).pode;
}

/* ============================================================
 * FASE 3 — quando a ABERTURA da conversa conta como leitura.
 * Prefetch, cache, hover, skeleton, aba em segundo plano e
 * localização de mensagem antiga não são leitura.
 * ========================================================== */

export type ContextoAbertura = ContextoLeitura & {
  /** Conversa selecionada agora. */
  conversaId: string | null | undefined;
  /** Conversa cujo conteúdo terminou de carregar na tela. */
  conversaCarregadaId: string | null | undefined;
  /** Aba/janela realmente visível. */
  abaVisivel: boolean;
  /** Aberta apontando para uma mensagem antiga ("Ver conversa" de um erro). */
  aberturaPorAlvo: boolean;
  /** Última mensagem exibida na tela (o limite da leitura). */
  ultimaMensagemId: string | null | undefined;
  /** Marcador já registrado nesta sessão para esta conversa. */
  ultimaRegistradaId?: string | null;
};

export function deveRegistrarLeituraAoAbrir(ctx: ContextoAbertura): boolean {
  if (!ctx.conversaId || !ctx.abaVisivel) return false;
  if (ctx.conversaCarregadaId !== ctx.conversaId) return false; // skeleton/troca
  if (ctx.aberturaPorAlvo) return false;
  if (!ctx.ultimaMensagemId) return false;
  if (ctx.ultimaRegistradaId === ctx.ultimaMensagemId) return false;
  return podeMarcarLidaAutomaticamente(ctx);
}
