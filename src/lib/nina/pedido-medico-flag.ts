/** Publicação global, sem restrição por clínica. A homologação permite validar antes da promoção. */
export const PEDIDO_MEDICO_ANTES_AGENDA_PUBLICADO =
  import.meta.env?.VITE_NINA_PEDIDO_MEDICO_ANTES_AGENDA === "true";

export function pedidoMedicoAntesAgendaAtivo(teste: boolean): boolean {
  return teste || PEDIDO_MEDICO_ANTES_AGENDA_PUBLICADO;
}
