// Quem pode receber a marcação de gestão (`pode_autorizar`).
//
// Essa marcação é a que decide, pessoa a pessoa, quem autoriza desconto,
// cortesia e sem faturamento com a própria senha, e quem enxerga ferramenta
// de supervisão (por exemplo o relatório de marcações por atendente). O
// perfil de acesso sozinho não serve: nesta clínica quase toda a equipe tem
// perfil de administrador, porque é ele que abre as telas administrativas.
//
// Até 09/09/2026 não havia NENHUMA tela capaz de ligar ou desligar essa
// marcação — o formulário existia no código mas nenhuma rota o abria, e a
// única forma de marcar alguém era mexer direto no banco. Este módulo e a
// tela `/app/equipe-acessos` fecham esse buraco.

import { ESCOPOS_AUTORIZACAO } from "@/lib/autorizacao-supervisor";
import { normalizarNomeBusca } from "@/lib/busca-texto";

/**
 * Papéis que a marcação de gestão consegue habilitar para alguma coisa.
 *
 * É a união das alçadas de todos os escopos. Marcar uma recepcionista não
 * teria efeito nenhum — a segunda condição (`role`) barraria em todos os
 * escopos — e a tela ficaria mentindo para quem marcou.
 */
export const ROLES_ELEGIVEIS_GESTAO: readonly string[] = Array.from(
  new Set(Object.values(ESCOPOS_AUTORIZACAO).flatMap((roles) => [...roles])),
).sort();

/** `true` quando faz sentido oferecer a marcação para esse perfil. */
export function podeReceberMarcacaoGestao(role: string | null | undefined): boolean {
  return ROLES_ELEGIVEIS_GESTAO.includes(role ?? "");
}

/** Nome do perfil em português, para a lista da tela. */
export const ROTULO_ROLE: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  supervisor: "Supervisor",
  financeiro: "Financeiro",
  medico: "Médico",
  enfermeiro: "Enfermeiro",
  recepcao: "Recepção",
  caixa: "Caixa",
  telefonia: "Telefonia",
};

export function rotuloRole(role: string | null | undefined): string {
  const r = (role ?? "").trim();
  return ROTULO_ROLE[r] ?? (r || "—");
}

export type MembroEquipe = {
  membershipId: string;
  userId: string;
  nome: string;
  role: string;
  ativo: boolean;
  podeAutorizar: boolean;
  podeGerirHorarios: boolean;
};

/**
 * Ordena a lista da tela: quem já é gestão primeiro, depois o resto por nome.
 *
 * A pergunta que traz alguém a esta tela é quase sempre "quem está marcado
 * hoje?" — deixar os marcados no topo responde isso sem rolagem, mesmo numa
 * clínica com dezenas de pessoas cadastradas.
 */
export function ordenarMembros(membros: readonly MembroEquipe[]): MembroEquipe[] {
  return [...membros].sort((a, b) => {
    if (a.podeAutorizar !== b.podeAutorizar) return a.podeAutorizar ? -1 : 1;
    if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
    return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
  });
}

/**
 * Filtra pelo que a supervisão digitou na busca (nome ou perfil).
 *
 * Usa `normalizarNomeBusca`, a mesma normalização do resto do sistema, para
 * que procurar "tania" ache "TÂNIA" — os nomes estão gravados sem acento e em
 * maiúsculas, e quem digita não sabe disso.
 */
export function filtrarMembros(membros: readonly MembroEquipe[], termo: string): MembroEquipe[] {
  const t = normalizarNomeBusca(termo);
  if (!t) return [...membros];
  return membros.filter((m) => normalizarNomeBusca(`${m.nome} ${rotuloRole(m.role)}`).includes(t));
}
