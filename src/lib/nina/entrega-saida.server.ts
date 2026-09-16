/** Registro de entrega independente do motor desativado.
 * A tabela legada de vínculos é mantida para preservar o histórico, sem consultar
 * avaliações e sem atribuir nota às novas mensagens.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { EstadoEntrega, RepresentacaoSaida } from "./confidence/entrega";
export type ResultadoRegistro = { ok: boolean; id: string | null; erro: string | null };
function falha(contexto: string, erro: unknown): ResultadoRegistro {
  const msg = erro instanceof Error ? erro.message : String(erro);
  console.warn(`[nina-entrega] ${contexto}: ${msg}`);
  return { ok: false, id: null, erro: msg };
}
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
  try {
    const { data, error } = await supabaseAdmin
      .from("nina_confianca_vinculos")
      .insert({
        clinica_id: params.clinicaId,
        decisao_id: null,
        execucao_id: params.execucaoId ?? null,
        conversation_id: params.conversaId ?? null,
        outgoing_message_id: params.outgoingMessageId ?? null,
        representacao: params.representacao,
        estado: params.estado,
        texto_hash: params.textoHash ?? null,
        transporte_id: params.transporteId ?? null,
        detalhe: params.detalhe ?? null,
      } as never)
      .select("id")
      .maybeSingle();
    // O Supabase devolve o erro no objeto, sem lançar exceção: checar os dois.
    if (error) return falha("registro do vínculo de entrega", error);
    return { ok: true, id: (data as { id?: string } | null)?.id ?? null, erro: null };
  } catch (e) {
    return falha("registro do vínculo de entrega", e);
  }
}
