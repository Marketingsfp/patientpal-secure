import type { EstadoTv } from "./painel-tv.server";

/** A equipe da TV representa somente quem está online ou em pausa. */
export function atendenteVisivelNaTv(estado: EstadoTv): boolean {
  return estado === "ONLINE" || estado === "PAUSA" || estado === "PAUSA_SAIDA";
}
