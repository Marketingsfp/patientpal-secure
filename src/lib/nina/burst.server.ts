/** Agrupamento persistente comum a WhatsApp e homologação. Sem fallback que execute IA. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  agruparTurnoPersistido,
  estadoAutorizaTurno,
  ErroAgrupamentoNina,
  type EntradaAgrupamento,
  type TurnoAgrupado,
} from "./agrupamento-turno";
import {
  adquirirLockConversa,
  liberarLockConversa,
  renovarLockConversa,
  lockConversaConfirmado,
  type LockConversa,
} from "./lock-conversa.server";

export type TurnoNina = TurnoAgrupado;
export { ErroAgrupamentoNina } from "./agrupamento-turno";

async function rpc(nome: string, parametros: Record<string, unknown>) {
  const { data, error } = await (supabaseAdmin as any).rpc(nome, parametros);
  if (error) throw new ErroAgrupamentoNina(`${nome}: ${error.message}`);
  return data;
}

/** A decisão antiga, tomada antes da espera, não autoriza o novo turno. */
async function validarConversaAposTrava(entrada: EntradaAgrupamento): Promise<boolean> {
  let q = supabaseAdmin
    .from("atend_conversas")
    .select("id, status, owner_type, ai_enabled, atribuida_user_id")
    .eq("clinica_id", entrada.clinicaId);
  q = entrada.conversaId
    ? q.eq("id", entrada.conversaId)
    : q.in("contato_telefone", [entrada.telefone, `+${entrada.telefone}`]);
  const { data: conversa, error } = await q.limit(1).maybeSingle();
  if (error)
    throw new ErroAgrupamentoNina(
      `Não foi possível confirmar o responsável da conversa: ${error.message}`,
    );
  if (!conversa) return false;
  const { data: flag, error: erroFlag } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", entrada.clinicaId)
    .eq("flag_key", "nina_desativada")
    .maybeSingle();
  if (erroFlag)
    throw new ErroAgrupamentoNina(
      `Não foi possível confirmar a ativação da Nina: ${erroFlag.message}`,
    );
  if (flag?.ativo) return false;
  if (entrada.sessaoTeste) {
    const { data: lead, error: erroLead } = await supabaseAdmin
      .from("nina_teste_leads")
      .select("conversa_id, ciclo_id, telefone_sessao")
      .eq("clinica_id", entrada.clinicaId)
      .eq("id", entrada.sessaoTeste.leadId)
      .maybeSingle();
    if (erroLead)
      throw new ErroAgrupamentoNina(
        `Não foi possível confirmar a sessão de homologação: ${erroLead.message}`,
      );
    return estadoAutorizaTurno(entrada, { conversa, ninaDesativada: Boolean(flag?.ativo), lead });
  }
  return estadoAutorizaTurno(entrada, { conversa, ninaDesativada: Boolean(flag?.ativo) });
}

export async function aguardarTurnoNina(entrada: EntradaAgrupamento): Promise<TurnoNina | null> {
  return agruparTurnoPersistido(entrada, {
    registrar: async () => {
      await rpc("nina_batch_recuperar_travados", {
        _clinica_id: entrada.clinicaId,
        _telefone: entrada.telefone,
        _idade_segundos: 120,
      });
      const data = await rpc("nina_batch_registrar", {
        _clinica_id: entrada.clinicaId,
        _telefone: entrada.telefone,
        _conversa_id: entrada.conversaId ?? null,
        _mensagem_id: entrada.mensagemId,
      });
      const linha = Array.isArray(data) ? data[0] : data;
      return {
        batchId: linha?.batch_id ?? "",
        revision: linha?.revision ?? 0,
        primeiraMs: Date.parse(linha?.first_message_at ?? "") || Date.now(),
      };
    },
    adquirir: (batchId) =>
      adquirirLockConversa({
        clinicaId: entrada.clinicaId,
        telefone: entrada.telefone,
        conversaId: entrada.conversaId,
        batchId,
      }),
    validarConversa: () => validarConversaAposTrava(entrada),
    reivindicar: async (batchId, revision, forcar) => {
      const data = await rpc("nina_batch_reivindicar", {
        _batch_id: batchId,
        _revision: revision,
        _forcar: forcar,
      });
      const linha = Array.isArray(data) ? data[0] : data;
      return linha?.reivindicado ? (linha.mensagens ?? []) : null;
    },
    lerMensagens: async (ids) => {
      let consulta = supabaseAdmin
        .from("whatsapp_mensagens")
        .select("id, body, transcricao, tipo")
        .eq("clinica_id", entrada.clinicaId)
        .eq("direction", "in")
        .in("id", ids)
        .in("from_number", [entrada.telefone, `+${entrada.telefone}`]);
      if (entrada.conversaId) consulta = consulta.eq("conversa_id", entrada.conversaId);
      const { data, error } = await consulta;
      if (error)
        throw new ErroAgrupamentoNina(`Leitura das entradas do lote falhou: ${error.message}`);
      return (data ?? []).map((m) => ({
        id: m.id,
        texto: m.tipo === "audio" ? (m.transcricao ?? "") : (m.body ?? ""),
      }));
    },
    lerRevisao: async () =>
      Number(
        await rpc("nina_revisao_atual", {
          _clinica_id: entrada.clinicaId,
          _telefone: entrada.telefone,
        }),
      ),
    iniciar: async (batchId, lock) =>
      lockConversaConfirmado(lock) &&
      Boolean(
        await rpc("nina_batch_iniciar_processamento", {
          _batch_id: batchId,
          _chave: lock.chave,
          _token: lock.token,
        }),
      ),
    concluir: (batchId, lock, motivo) =>
      concluirTurnoNina(batchId, null, lock, "SUPERSEDED", motivo),
    liberar: liberarLockConversa,
  });
}

/** Reconfere o lease imediatamente antes de o transporte enviar a resposta. */
export async function validarReservaTurnoNina(lock: LockConversa | null): Promise<boolean> {
  return Boolean(lock && lockConversaConfirmado(lock) && (await renovarLockConversa(lock)));
}

/** Conclui só a reserva do chamador e sempre encerra seu heartbeat. */
export async function concluirTurnoNina(
  batchId: string,
  execucaoId?: string | null,
  lock?: LockConversa | null,
  status: "PROCESSED" | "SUPERSEDED" = "PROCESSED",
  erro?: string | null,
): Promise<void> {
  try {
    if (batchId && lock) {
      const confirmou = await rpc("nina_batch_concluir_seguro", {
        _batch_id: batchId,
        _chave: lock.chave,
        _token: lock.token,
        _execucao_id: execucaoId ?? null,
        _status: status,
        _erro: erro ?? null,
      });
      if (!confirmou)
        console.warn("[nina] lote não concluído: a reserva não pertence mais ao chamador", {
          batchId,
        });
    }
  } finally {
    await liberarLockConversa(lock ?? null);
  }
}
