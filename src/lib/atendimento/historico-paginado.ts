/** Paginação conjunta: mensagens de todos os autores e eventos internos. */
import type { Json } from "@/integrations/supabase/types";
export const TAMANHO_PAGINA_HISTORICO = 10;
export type CursorHistorico = { em: string; id: string; tipo: "evento" | "mensagem" };
export type MensagemHistorico = { id: string; recebida_em: string; [campo: string]: any };
export type EventoHistorico = {
  id: string;
  created_at: string;
  evento: string;
  user_id: string | null;
  motivo: string | null;
  detalhes: Json;
  user_nome?: string | null;
  para_nome?: string | null;
  de_nome?: string | null;
};
export type PaginaHistorico = {
  mensagens: MensagemHistorico[];
  eventos: EventoHistorico[];
  anterior: CursorHistorico | null;
  posterior: CursorHistorico | null;
  temMais: boolean;
};

// PostgreSQL preserva microssegundos. Date.parse sozinho empata registros
// diferentes e pode pular mensagens nos limites entre páginas.
function micros(em: string): number {
  const fracao = /\.(\d+)/.exec(em)?.[1] ?? "";
  return Date.parse(em) * 1000 + Number(fracao.padEnd(6, "0").slice(3, 6));
}

export function compararCursor(a: CursorHistorico, b: CursorHistorico): number {
  return micros(a.em) - micros(b.em) || a.tipo.localeCompare(b.tipo) || a.id.localeCompare(b.id);
}

/** Revalidação da abertura: retira o cache antigo sem apagar chegadas em tempo real. */
export function manterNaJanelaRecente(cursor: CursorHistorico, pagina: PaginaHistorico): boolean {
  return !pagina.anterior || compararCursor(cursor, pagina.anterior) >= 0;
}

export function montarPaginaHistorico(
  mensagens: MensagemHistorico[],
  eventos: EventoHistorico[],
  sentido: "anteriores" | "novas" = "anteriores",
): PaginaHistorico {
  const itens = [
    ...mensagens.map((m) => ({
      cursor: { em: m.recebida_em, id: m.id, tipo: "mensagem" as const },
      m,
    })),
    ...eventos.map((e) => ({ cursor: { em: e.created_at, id: e.id, tipo: "evento" as const }, e })),
  ].sort((a, b) => compararCursor(a.cursor, b.cursor));
  const pagina =
    sentido === "novas"
      ? itens.slice(0, TAMANHO_PAGINA_HISTORICO)
      : itens.slice(-TAMANHO_PAGINA_HISTORICO);
  return {
    mensagens: pagina.flatMap((i) => ("m" in i ? [i.m] : [])),
    eventos: pagina.flatMap((i) => ("e" in i ? [i.e] : [])),
    anterior: pagina[0]?.cursor ?? null,
    posterior: pagina.at(-1)?.cursor ?? null,
    temMais: itens.length > TAMANHO_PAGINA_HISTORICO,
  };
}

/** Cursor composto, inclusive entre tabelas com registros no mesmo instante. */
export function filtroCursorHistorico(
  tipo: CursorHistorico["tipo"],
  cursor: CursorHistorico,
  sentido: "anteriores" | "novas",
): string {
  const coluna = tipo === "mensagem" ? "recebida_em" : "created_at";
  const op = sentido === "novas" ? "gt" : "lt";
  if (tipo === cursor.tipo)
    return `${coluna}.${op}.${cursor.em},and(${coluna}.eq.${cursor.em},id.${op}.${cursor.id})`;
  const incluirEmpate = sentido === "novas" ? tipo > cursor.tipo : tipo < cursor.tipo;
  return `${coluna}.${op}${incluirEmpate ? "e" : ""}.${cursor.em}`;
}
