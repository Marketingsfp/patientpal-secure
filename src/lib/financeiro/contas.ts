/**
 * Utilidades da lista de contas (fin_contas) usada nos selects do financeiro.
 *
 * O cadastro de produção tem contas repetidas: em 27/08/2026 existiam três
 * linhas ativas chamadas "CAIXA" na mesma clínica (uma com 8.575 lançamentos e
 * duas com 1 cada), todas criadas no mesmo instante pela carga inicial. Na
 * tela isso virava um select com "CAIXA, CAIXA, CAIXA" — a recepção escolhia
 * qualquer uma e o mesmo caixa acabava partido em três contas diferentes.
 *
 * `dedupContas` colapsa essas repetições só na exibição (o mapa id → nome
 * continua vindo da lista completa, para não perder o nome de lançamentos
 * antigos que apontam para uma duplicata), com um critério estável: dentro do
 * grupo de mesmo nome e mesmo tipo, fica a conta mais antiga; empatou na data,
 * decide o id. Assim todo mundo enxerga sempre a mesma conta.
 */

export type ContaOpcao = {
  id: string;
  nome: string;
  tipo?: string | null;
  created_at?: string | null;
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Remove contas repetidas (mesmo nome e mesmo tipo), preservando a ordem. */
export function dedupContas<T extends ContaOpcao>(contas: T[]): T[] {
  const escolhida = new Map<string, T>();
  for (const c of contas) {
    const chave = `${norm(c.nome ?? "")}|${norm(String(c.tipo ?? ""))}`;
    const atual = escolhida.get(chave);
    if (!atual) {
      escolhida.set(chave, c);
      continue;
    }
    const antesDe =
      (c.created_at ?? "") !== (atual.created_at ?? "")
        ? (c.created_at ?? "") < (atual.created_at ?? "")
        : c.id < atual.id;
    if (antesDe) escolhida.set(chave, c);
  }
  const vencedoras = new Set([...escolhida.values()].map((c) => c.id));
  return contas.filter((c) => vencedoras.has(c.id));
}

/**
 * Conta que já vem escolhida ao abrir um lançamento novo: o CAIXA da recepção.
 * Sem isso o campo abria em "—" e exigia um clique a mais em cada lançamento —
 * e, quando ninguém clicava, a despesa era gravada sem conta nenhuma.
 * Se a clínica só tem uma conta cadastrada, é ela, qualquer que seja o nome.
 */
export function contaPadrao<T extends ContaOpcao>(contas: T[]): T | null {
  const lista = dedupContas(contas);
  const caixa =
    lista.find((c) => norm(String(c.tipo ?? "")) === "caixa" && norm(c.nome ?? "") === "caixa") ??
    lista.find((c) => norm(c.nome ?? "") === "caixa") ??
    lista.find((c) => norm(String(c.tipo ?? "")) === "caixa");
  if (caixa) return caixa;
  return lista.length === 1 ? lista[0] : null;
}
