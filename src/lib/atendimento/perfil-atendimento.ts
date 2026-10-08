/**
 * Perfil de atendimento: quem pode ser RESPONSÁVEL por uma conversa.
 *
 * Regra única do sistema: administrador enxerga toda a operação, mas nunca
 * atende paciente. Se a pessoa tem perfil de administrador, ela não recebe
 * conversa por nenhum caminho — automático, fila, transferência ou botão
 * "assumir" — mesmo que também tenha permissão de atendente.
 *
 * O perfil vem de `clinica_memberships.role`, a mesma fonte já usada pelas
 * telas. Não existe flag nova nem segunda lista de administradores.
 */

/** Perfil que nunca recebe conversa de atendimento. */
export const PERFIL_ADMIN = "admin";

/** Mensagem única mostrada quando um administrador tenta atender. */
export const MSG_ADMIN_NAO_ATENDE =
  "Administrador acompanha as conversas, mas não pode assumir nem responder ao paciente.";

/** Mensagem única mostrada quando alguém tenta transferir para quem está em pausa. */
export const MSG_DESTINO_EM_PAUSA =
  "Esta pessoa está em pausa e não pode receber conversas. Escolha alguém que esteja Online.";

/** Quem está em Pausa ou em Pausa para almoço não recebe transferência manual. */
export function estadoBloqueiaTransferencia(estadoManual: string | null | undefined): boolean {
  return estadoManual === "PAUSA" || estadoManual === "PAUSA_SAIDA";
}

/** É perfil de administrador? */
export function ehPerfilAdmin(role: string | null | undefined): boolean {
  return (role ?? "").trim().toLowerCase() === PERFIL_ADMIN;
}

/**
 * Pode receber/assumir conversa? Administrador nunca pode; a condição de
 * administrador prevalece sobre qualquer outra permissão da pessoa.
 */
export function podeReceberConversa(role: string | null | undefined): boolean {
  return !ehPerfilAdmin(role);
}

/** Filtra uma lista de pessoas deixando só quem pode receber conversa. */
export function apenasDestinatariosValidos<T extends { role?: string | null }>(
  pessoas: readonly T[],
): T[] {
  return pessoas.filter((p) => podeReceberConversa(p.role));
}

/* ---------------------------------------------------------------
 * Presença exibida ao lado do nome na transferência.
 * Fonte já existente: `atend_agente_presenca` + `atend_pausas_log`.
 * ------------------------------------------------------------- */

export type PresencaAtendente = "ONLINE" | "PAUSA" | "PAUSA_SAIDA" | "OFFLINE";

/**
 * FASE 2 — a presença é MANUAL. `visto_em` (heartbeat) é apenas sinal técnico
 * de conexão e não participa mais deste cálculo: aba oculta, queda de rede,
 * página fechada ou heartbeat vencido não derrubam a escolha do atendente.
 */
export function statusPresenca(p: {
  status: string | null | undefined;
  /** Informativo apenas — mantido por compatibilidade de chamadas. */
  vistoEm?: string | null | undefined;
  emPausa: boolean;
}): PresencaAtendente {
  // A pausa para almoço é um estado próprio; não se confunde com a pausa comum.
  if ((p.status ?? "").toUpperCase() === "PAUSA_SAIDA") return "PAUSA_SAIDA";
  // Pausa livre não cria o registro legado com motivo; a escolha manual basta.
  if (p.emPausa || (p.status ?? "").toUpperCase() === "PAUSA") return "PAUSA";
  if ((p.status ?? "").toUpperCase() === "ONLINE") return "ONLINE";
  return "OFFLINE";
}

/** Texto do status (a cor nunca é a única informação). */
export const ROTULO_PRESENCA: Record<PresencaAtendente, string> = {
  ONLINE: "Online",
  PAUSA: "Em pausa",
  PAUSA_SAIDA: "Em pausa para almoço",
  OFFLINE: "Offline",
};

/* ---------------------------------------------------------------
 * Supervisão (admin e gestor) respondendo no chat da atendente.
 *
 * A conversa continua com a atendente (responsável); o supervisor apenas
 * responde, e a mensagem fica gravada com o perfil exato dele — como a
 * resposta da Nina é identificada.
 * ------------------------------------------------------------- */

export type PerfilSupervisao = "admin" | "gestor";

export const ROTULO_PERFIL_SUPERVISAO: Record<PerfilSupervisao, string> = {
  admin: "Admin",
  gestor: "Gestor",
};

/** Mensagem do admin ao tentar responder numa conversa fora do que ele pode responder. */
export const MSG_ADMIN_NAO_RESPONDE_AQUI =
  "Administrador responde apenas conversas abertas que estão com uma atendente ou sem responsável.";

/**
 * Conversa aberta com a Nina: ninguém envia mensagem — admin, supervisão ou
 * atendente (regra de 08/10/2026). Para tirar a Nina, atribui-se a conversa.
 */
export const MSG_CONVERSA_DA_NINA =
  "Conversas atribuídas à Nina são bloqueadas: não é possível enviar mensagem enquanto a Nina estiver atendendo. Para responder, atribua a conversa a uma atendente.";

export function conversaComNina(conversa: { owner_type?: string | null; status?: string | null }): boolean {
  return conversa.owner_type === "AI" && conversa.status !== "closed" && conversa.status !== "finished";
}

/** Motivo exibido ao admin: conversa da Nina tem aviso próprio; os demais casos seguem o geral. */
export function motivoAdminNaoResponde(conversa: { owner_type?: string | null; status?: string | null }): string {
  return conversaComNina(conversa) ? MSG_CONVERSA_DA_NINA : MSG_ADMIN_NAO_RESPONDE_AQUI;
}

/** Perfil exato de supervisão: admin tem precedência sobre gestor. */
export function perfilSupervisao(args: { admin: boolean; gestor: boolean }): PerfilSupervisao | null {
  if (args.admin) return "admin";
  return args.gestor ? "gestor" : null;
}

/** Conversa aberta que está com uma atendente (não é da Nina nem está sem responsável). */
export function conversaComAtendente(conversa: {
  atribuida_user_id?: string | null;
  owner_type?: string | null;
  status?: string | null;
}): boolean {
  return (
    !!conversa.atribuida_user_id &&
    conversa.owner_type !== "AI" &&
    conversa.status !== "closed" &&
    conversa.status !== "finished"
  );
}

/**
 * Conversa aberta sem responsável (fila global): não é da Nina nem de nenhuma atendente.
 * A supervisão responde sem que ela seja atribuída a ninguém; só vira dela se clicar em Assumir.
 */
export function conversaSemResponsavel(conversa: {
  atribuida_user_id?: string | null;
  owner_type?: string | null;
  status?: string | null;
}): boolean {
  return (
    !conversa.atribuida_user_id &&
    conversa.owner_type !== "AI" &&
    conversa.status !== "closed" &&
    conversa.status !== "finished"
  );
}

/** O admin responde conversas com atendente ou sem responsável (não as da Nina nem as fechadas). */
export function adminPodeResponder(conversa: {
  atribuida_user_id?: string | null;
  owner_type?: string | null;
  status?: string | null;
}): boolean {
  return conversaComAtendente(conversa) || conversaSemResponsavel(conversa);
}

/** Etiqueta exibida na bolha quando a resposta foi de um supervisor; null nos demais casos. */
export function rotuloAutorSupervisao(
  perfil: string | null | undefined,
  nome?: string | null,
): string | null {
  if (perfil !== "admin" && perfil !== "gestor") return null;
  const rotulo = ROTULO_PERFIL_SUPERVISAO[perfil];
  const autor = nome?.trim();
  return autor ? `${rotulo} ${autor}` : rotulo;
}

/** Encerramento por responsável ou supervisão; não exige assumir a conversa. */
export function podeEncerrarConversa(args: {
  userId: string | null | undefined;
  responsavelId: string | null | undefined;
  admin: boolean;
  gestor: boolean;
}): boolean {
  return Boolean(args.userId && (args.admin || args.gestor || args.responsavelId === args.userId));
}
