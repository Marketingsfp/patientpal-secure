/**
 * FASE 4 — Stale Response Guard (estado persistente).
 *
 * O contador vive no banco (`nina_conversa_revisoes` + RPCs atômicas), então
 * vale entre instâncias e reinícios. Nunca em memória.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { estaObsoleta } from "@/lib/nina/revisao";

/** Chamado a cada mensagem RECEBIDA do paciente, logo após a persistência. */
export async function incrementarRevisaoConversa(input: {
  clinicaId: string;
  telefone: string;
  conversaId?: string | null;
}): Promise<number> {
  if (!input.telefone) return 0;
  try {
    const { data, error } = await supabaseAdmin.rpc("nina_revisao_incrementar", {
      _clinica_id: input.clinicaId,
      _telefone: input.telefone,
      _conversa_id: (input.conversaId ?? undefined) as string,
    });
    if (error) throw error;
    return Number(data ?? 0);
  } catch (e) {
    console.error("[nina] revisão: incremento falhou", e);
    return 0;
  }
}

export async function revisaoAtualConversa(
  clinicaId: string,
  telefone: string,
): Promise<number> {
  if (!telefone) return 0;
  try {
    const { data, error } = await supabaseAdmin.rpc("nina_revisao_atual", {
      _clinica_id: clinicaId,
      _telefone: telefone,
    });
    if (error) throw error;
    return Number(data ?? 0);
  } catch (e) {
    console.error("[nina] revisão: leitura falhou", e);
    return 0;
  }
}

/**
 * Guarda obrigatória: `true` significa que a resposta gerada já não
 * corresponde ao estado da conversa e NÃO pode ser enviada.
 */
export async function respostaObsoleta(input: {
  clinicaId: string;
  telefone: string;
  revisaoProcessada: number | null | undefined;
}): Promise<boolean> {
  if (!input.revisaoProcessada) return false;
  const atual = await revisaoAtualConversa(input.clinicaId, input.telefone);
  return estaObsoleta(input.revisaoProcessada, atual);
}
