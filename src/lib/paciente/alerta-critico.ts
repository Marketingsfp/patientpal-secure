import { podeAutorizar, rolesDoEscopo } from "@/lib/autorizacao-supervisor";

/**
 * Alerta crítico do paciente — processo judicial, Procon, disputa em curso.
 *
 * Este arquivo guarda só a REGRA (quem pode marcar e o que é um motivo
 * válido). Ele não importa o cliente Supabase de propósito, para que a mesma
 * regra possa ser lida por código de servidor sem arrastar junto o cliente do
 * navegador — é o mesmo desenho de `@/lib/agenda/sem-faturamento-alcada`.
 */

/** Papéis com alçada para mexer no alerta. */
export const ROLES_MARCAM_ALERTA_CRITICO = rolesDoEscopo("alerta_critico");

/** Tamanho máximo do motivo, igual ao CHECK gravado no banco. */
export const MAX_MOTIVO_ALERTA = 500;

/**
 * true → esta pessoa marca/retira o alerta crítico do paciente.
 *
 * São DUAS condições, como em toda ação restrita deste sistema: a marcação
 * individual `pode_autorizar` do vínculo com a clínica (tela de Equipe) E um
 * perfil compatível. O perfil sozinho não serve — quase toda a equipe tem
 * perfil de administrador porque é ele que dá acesso às telas do dia a dia.
 *
 * O banco confere a mesma regra num gatilho, então adulterar a tela não
 * consegue gravar o alerta.
 */
export function podeMarcarAlertaCritico(
  role: string | null | undefined,
  podeAutorizarMarcado: boolean | null | undefined,
): boolean {
  return podeAutorizar("alerta_critico", role, podeAutorizarMarcado);
}

/**
 * Normaliza o motivo digitado. Devolve `null` quando não sobrou texto.
 *
 * Um alerta vermelho sem motivo é pior do que nenhum alerta: a recepcionista
 * vê a tarja, não sabe o que fazer e trata o paciente de forma estranha sem
 * saber por quê. Por isso motivo vazio é recusado antes de gravar.
 */
export function limparMotivoAlerta(motivo: string | null | undefined): string | null {
  const t = (motivo ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.slice(0, MAX_MOTIVO_ALERTA);
}
