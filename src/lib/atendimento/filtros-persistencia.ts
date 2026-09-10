/**
 * FASE 4 — memória do filtro compacto da Inbox (Escopo × Visualização).
 *
 * Regras:
 * - o filtro NÃO se perde ao abrir/trocar de conversa (é estado de tela);
 * - ao recarregar, o último filtro daquela clínica pode voltar;
 * - a memória é SEMPRE por clínica: um atendente de outra clínica nunca
 *   atravessa para cá;
 * - atendente escolhido só sobrevive para quem tem supervisão e se ele ainda
 *   pertence à equipe atual. Qualquer dúvida → volta para o padrão.
 *
 * Isto é apresentação: nenhuma permissão é decidida aqui, o backend continua
 * sendo a autoridade (RBAC).
 */
import {
  ESCOPO_BASE_PADRAO,
  VISUALIZACAO_PADRAO,
  type EscopoBaseInbox,
  type VisualizacaoInbox,
} from "./filtros-inbox";

export interface FiltrosSalvos {
  base: EscopoBaseInbox;
  visualizacao: VisualizacaoInbox;
  atendenteId: string | null;
}

export const FILTROS_INBOX_PADRAO: FiltrosSalvos = {
  base: ESCOPO_BASE_PADRAO,
  visualizacao: VISUALIZACAO_PADRAO,
  atendenteId: null,
};

/** Uma chave por clínica: seleção nunca vaza entre clínicas/unidades. */
export function chaveFiltrosInbox(clinicaId: string | null | undefined): string | null {
  const id = (clinicaId ?? "").trim();
  return id ? `nina.inbox.filtros.${id}` : null;
}

const BASES: EscopoBaseInbox[] = ["minhas", "equipe", "nina"];
const VISUALIZACOES: VisualizacaoInbox[] = ["recentes", "resolvidas", "espera"];

/** Normaliza o que veio guardado, aplicando permissão e equipe atual. */
export function sanitizarFiltrosSalvos(
  bruto: unknown,
  ctx: { gestor: boolean; usuariosIds?: string[] | null },
): FiltrosSalvos {
  const obj = (bruto ?? {}) as Record<string, unknown>;
  const base = BASES.includes(obj["base"] as EscopoBaseInbox)
    ? (obj["base"] as EscopoBaseInbox)
    : FILTROS_INBOX_PADRAO.base;
  const visualizacao = VISUALIZACOES.includes(obj["visualizacao"] as VisualizacaoInbox)
    ? (obj["visualizacao"] as VisualizacaoInbox)
    : FILTROS_INBOX_PADRAO.visualizacao;

  let atendenteId =
    typeof obj["atendenteId"] === "string" && obj["atendenteId"].trim()
      ? (obj["atendenteId"] as string).trim()
      : null;
  // Sem supervisão o filtro por atendente simplesmente não existe.
  if (!ctx.gestor) atendenteId = null;
  // Atendente que não está na equipe desta clínica é descartado (UUID de
  // outra clínica nunca fica preso na tela).
  if (atendenteId && ctx.usuariosIds && ctx.usuariosIds.length) {
    if (!ctx.usuariosIds.includes(atendenteId)) atendenteId = null;
  }

  // "Equipe" também é supervisão: sem permissão, volta para "Minhas".
  const baseEfetiva: EscopoBaseInbox = base === "equipe" && !ctx.gestor ? "minhas" : base;
  return { base: atendenteId ? "equipe" : baseEfetiva, visualizacao, atendenteId };
}

/** Lê a memória do navegador; qualquer erro devolve o padrão. */
export function lerFiltrosInbox(
  storage: Pick<Storage, "getItem"> | null | undefined,
  clinicaId: string | null | undefined,
  ctx: { gestor: boolean; usuariosIds?: string[] | null },
): FiltrosSalvos {
  const chave = chaveFiltrosInbox(clinicaId);
  if (!storage || !chave) return { ...FILTROS_INBOX_PADRAO };
  try {
    const cru = storage.getItem(chave);
    if (!cru) return { ...FILTROS_INBOX_PADRAO };
    return sanitizarFiltrosSalvos(JSON.parse(cru), ctx);
  } catch {
    return { ...FILTROS_INBOX_PADRAO };
  }
}

/** Grava a memória do navegador (silencioso em modo privado/bloqueado). */
export function salvarFiltrosInbox(
  storage: Pick<Storage, "setItem"> | null | undefined,
  clinicaId: string | null | undefined,
  filtros: FiltrosSalvos,
): void {
  const chave = chaveFiltrosInbox(clinicaId);
  if (!storage || !chave) return;
  try {
    storage.setItem(chave, JSON.stringify(filtros));
  } catch {
    /* memória de filtro é conveniência: nunca quebra a Inbox */
  }
}
