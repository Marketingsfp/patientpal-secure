import { resolverRecorte, type RecorteTempo, type RecorteResolvido } from "./metricas-filtros";

/** Reinício solicitado em 16/09/2026. Histórico preservado; vale para todas as clínicas/ambientes. */
export const INICIO_CICLO_APRENDIZADO = "2026-09-16T21:29:49.000Z";

export const AVISO_CICLO_APRENDIZADO = `Novo ciclo desde ${new Date(
  INICIO_CICLO_APRENDIZADO,
).toLocaleString("pt-BR", {
  timeZone: "America/Sao_Paulo",
})} (Brasília). Apenas registros a partir desse momento entram nesta tela.`;

export function inicioNoCicloAprendizado(iso: string): string {
  return new Date(Math.max(Date.parse(iso), Date.parse(INICIO_CICLO_APRENDIZADO))).toISOString();
}

/** Intersecta cada janela com o ciclo antes das consultas e agregações no banco. */
export function resolverRecorteNoCiclo(r: RecorteTempo): RecorteResolvido {
  const recorte = resolverRecorte(r);
  const janelas = recorte.janelas
    .map((j) => ({ ...j, inicio: inicioNoCicloAprendizado(j.inicio) }))
    .filter((j) => Date.parse(j.inicio) < Date.parse(j.fim));
  return {
    ...recorte,
    janelas,
    // Um período anterior ao reinício é vazio, inclusive para consultas sem janelas.
    inicio: janelas[0]?.inicio ?? recorte.fim,
    fim: janelas.at(-1)?.fim ?? recorte.fim,
  };
}
