import type { EstadoTv } from "./painel-tv.server";

/** Offline permanece visível enquanto ainda tiver conversa aberta atribuída. */
export function atendenteVisivelNaTv(estado: EstadoTv, atribuidas = 0): boolean {
  return estado === "ONLINE" || estado === "PAUSA" || estado === "PAUSA_SAIDA" || atribuidas > 0;
}

/** Mantém no máximo dez atendentes por coluna para caber na TV sem rolagem. */
export function colunasEquipeNaTv(totalVisivel: number): 1 | 2 | 3 {
  if (totalVisivel > 20) return 3;
  if (totalVisivel > 10) return 2;
  return 1;
}
