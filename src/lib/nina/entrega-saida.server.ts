/** Registro de entrega independente do motor desativado.
 * Por decisão de retenção de 24/09/2026, o histórico legado de vínculos
 * (`nina_confianca_vinculos`) foi apagado e novas entregas não são mais
 * gravadas nele. A assinatura é mantida para os chamadores existentes.
 */
import type { EstadoEntrega, RepresentacaoSaida } from "./confidence/entrega";
export type ResultadoRegistro = { ok: boolean; id: string | null; erro: string | null };
export async function registrarEntregaSaida(params: {
  clinicaId: string;
  decisaoId?: string | null;
  execucaoId?: string | null;
  conversaId?: string | null;
  outgoingMessageId?: string | null;
  representacao: RepresentacaoSaida;
  estado: EstadoEntrega;
  textoHash?: string | null;
  /** Identificador devolvido pelo transporte (ex.: wa_message_id). */
  transporteId?: string | null;
  detalhe?: Record<string, unknown> | null;
  /** Compatibilidade dos chamadores antigos; novas entregas sempre ficam sem avaliação. */
  vincularAvaliacao?: boolean;
}): Promise<ResultadoRegistro> {
  return { ok: true, id: null, erro: null };
}
