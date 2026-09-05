import { podeAutorizar, rolesDoEscopo } from "@/lib/autorizacao-supervisor";

/**
 * Quem pode isentar um atendimento de cobrança.
 *
 * A lista em si mora em `@/lib/autorizacao-supervisor`, junto com a alçada das
 * outras ações privilegiadas do sistema, para que exista uma tabela única de
 * "quem autoriza o quê" — lida pela tela, pela server function que confere a
 * senha e, no caso do sem faturamento, também pelo gatilho do banco.
 *
 * Este arquivo continua existindo como o nome que a Agenda já usa, e por não
 * ter nenhum import de cliente Supabase: código de servidor consegue ler a
 * alçada sem arrastar junto o cliente do navegador.
 */
export const ROLES_AUTORIZAM_SEM_FATURAMENTO = rolesDoEscopo("sem_faturamento");

/**
 * true → esta pessoa marca/desmarca sozinha, sem pedir senha.
 *
 * Depende da permissão individual `pode_autorizar` do vínculo com a clínica,
 * e não só do perfil: quase toda a equipe tem perfil de administrador.
 */
export function podeAutorizarSemFaturamento(
  role: string | null | undefined,
  podeAutorizarMarcado: boolean | null | undefined,
): boolean {
  return podeAutorizar("sem_faturamento", role, podeAutorizarMarcado);
}
