/**
 * FASE 4 — consistência de cache, busca, contadores e realtime da Inbox.
 *
 * O backend já entrega apenas as conversas do filtro escolhido. Este módulo
 * acrescenta a segunda camada de proteção, no navegador: nada que não pertença
 * ao filtro atual pode entrar (ou continuar) na lista, nem sobrar em cache,
 * nem aparecer numa busca.
 *
 * Tudo aqui é função pura, para ser testável sem tela.
 */
import {
  conversaVisivelNoEscopo,
  type ConversaEscopo,
  type EscopoInbox,
} from "./escopo-inbox";

export type LinhaCache = ConversaEscopo & { id: string };

export interface ContextoEscopo {
  escopo: EscopoInbox;
  userId: string | null;
  gestor: boolean;
}

/**
 * Chave de cache/consulta da Inbox. Cada combinação de clínica + usuário +
 * filtro tem a sua própria caixa: a lista de um filtro nunca reaproveita a
 * lista de outro, e a lista de um atendente nunca reaproveita a de outro.
 */
export function chaveInbox(args: {
  clinicaId: string | null;
  userId: string | null;
  escopo: EscopoInbox;
}): string {
  return ["inbox", args.clinicaId ?? "-", args.userId ?? "-", args.escopo].join("|");
}

/**
 * Segunda checagem no navegador: mantém só o que pertence ao filtro atual.
 * Sem o id do usuário ainda carregado, a lista é mantida como veio do
 * servidor (que já filtrou), para não esvaziar a tela por engano.
 */
export function filtrarPorEscopo<T extends LinhaCache>(linhas: T[], ctx: ContextoEscopo): T[] {
  if (!ctx.userId) return linhas;
  const visiveis = linhas.filter((l) =>
    conversaVisivelNoEscopo(l, { escopo: ctx.escopo, userId: ctx.userId as string, gestor: ctx.gestor }),
  );
  return visiveis.length === linhas.length ? linhas : visiveis;
}

/** Um registro recebido em tempo real pode entrar na lista deste filtro? */
export function podeEntrarNaLista(linha: LinhaCache, ctx: ContextoEscopo): boolean {
  if (!ctx.userId) return true;
  return conversaVisivelNoEscopo(linha, {
    escopo: ctx.escopo,
    userId: ctx.userId,
    gestor: ctx.gestor,
  });
}

/** Ids que estavam na tela e não pertencem mais ao filtro — o cache deles cai. */
export function idsQueSairam(anteriores: { id: string }[], atuais: { id: string }[]): string[] {
  const agora = new Set(atuais.map((c) => c.id));
  return anteriores.filter((c) => !agora.has(c.id)).map((c) => c.id);
}

/**
 * A conversa aberta deve sair da tela?
 *
 * Durante uma busca a lista fica reduzida pelo texto digitado, então "não
 * estar na lista" não prova nada. Nesse caso vale a checagem de propriedade do
 * próprio registro — é isso que impede a busca de manter na tela uma conversa
 * que já é de outro atendente.
 */
export function selecaoDeveSair(args: {
  selecionada: LinhaCache | null | undefined;
  linhas: LinhaCache[] | null | undefined;
  buscando: boolean;
  ctx: ContextoEscopo;
}): boolean {
  const { selecionada, linhas, buscando, ctx } = args;
  if (!selecionada || !linhas) return false;
  const naLista = linhas.find((l) => l.id === selecionada.id);
  if (naLista) return !podeEntrarNaLista(naLista, ctx);
  if (buscando) return !podeEntrarNaLista(selecionada, ctx);
  return true;
}

export type ContadoresInbox = Record<EscopoInbox, number>;

/**
 * Ajuste imediato do número do filtro que está na tela, antes mesmo de o
 * servidor responder com a contagem oficial.
 */
export function ajustarContadorAtual(
  contadores: ContadoresInbox,
  escopo: EscopoInbox,
  total: number,
): ContadoresInbox {
  if (contadores[escopo] === total) return contadores;
  return { ...contadores, [escopo]: Math.max(0, total) };
}

/**
 * Movimento entre filtros (ex.: handoff da Nina para um atendente): tira um de
 * onde saiu e soma um onde entrou, na hora.
 */
export function moverContador(
  contadores: ContadoresInbox,
  de: EscopoInbox | null,
  para: EscopoInbox | null,
): ContadoresInbox {
  if (de === para) return contadores;
  const saida = { ...contadores };
  if (de) saida[de] = Math.max(0, (saida[de] ?? 0) - 1);
  if (para) saida[para] = Math.max(0, (saida[para] ?? 0) + 1);
  return saida;
}
