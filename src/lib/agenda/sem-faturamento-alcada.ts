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
 *
 * `alcadasNominais` são os escopos liberados para AQUELA pessoa pelo ID dela
 * (tabela `usuario_alcadas`, hook `useAlcadasNominais`). É o caminho de quem
 * continua sendo da Recepção, sem acesso a dinheiro, mas recebeu da diretoria
 * o direito de isentar sozinha.
 */
export function podeAutorizarSemFaturamento(
  role: string | null | undefined,
  podeAutorizarMarcado: boolean | null | undefined,
  alcadasNominais?: Iterable<string> | null,
): boolean {
  return podeAutorizar("sem_faturamento", role, podeAutorizarMarcado, alcadasNominais);
}
