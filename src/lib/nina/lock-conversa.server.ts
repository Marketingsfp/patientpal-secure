/**
 * FASE 3 — Serialização do processamento da Nina por conversa.
 *
 * Uma execução ativa por conversa; conversas diferentes seguem em paralelo.
 * A exclusão mútua é persistente (tabela `nina_conversa_locks` + RPCs
 * atômicas), portanto vale entre instâncias e reinícios — nunca depende de
 * variável em memória.
 *
 * A trava é um LEASE: expira sozinha se a execução falhar, sem deixar a
 * conversa presa e sem duplicar execução silenciosamente.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Duração do lease. Deve cobrir o turno completo (modelo + ferramentas). */
export const LOCK_LEASE_SEGUNDOS = 90;

/** Tempo máximo aguardando a conversa liberar antes de desistir do turno. */
export const LOCK_ESPERA_MAX_MS = 25_000;

const INTERVALO_TENTATIVA_MS = 500;

export type LockConversa = { chave: string; token: string };

export function chaveConversa(clinicaId: string, telefone: string): string {
  return `${clinicaId}:${telefone}`;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Tenta adquirir a trava da conversa, aguardando a execução anterior terminar.
 * Retorna `null` quando a conversa continua ocupada — nesse caso o turno não
 * chama o modelo nem executa ferramentas.
 */
export async function adquirirLockConversa(input: {
  clinicaId: string;
  telefone: string;
  conversaId?: string | null;
  batchId?: string | null;
  esperaMaxMs?: number;
}): Promise<LockConversa | null> {
  const chave = chaveConversa(input.clinicaId, input.telefone);
  const limite = Date.now() + (input.esperaMaxMs ?? LOCK_ESPERA_MAX_MS);
  for (;;) {
    try {
      const { data, error } = await supabaseAdmin.rpc("nina_lock_adquirir", {
        _chave: chave,
        _clinica_id: input.clinicaId,
        _conversa_id: (input.conversaId ?? undefined) as string,
        _batch_id: (input.batchId ?? undefined) as string,
        _lease_segundos: LOCK_LEASE_SEGUNDOS,
      });
      if (error) throw error;
      const token = (Array.isArray(data) ? data[0] : data) as string | null;
      if (token) return { chave, token };
    } catch (e) {
      console.error("[nina] lock: falha ao adquirir", e);
      return null;
    }
    if (Date.now() + INTERVALO_TENTATIVA_MS > limite) return null;
    await dormir(INTERVALO_TENTATIVA_MS);
  }
}

export async function renovarLockConversa(lock: LockConversa): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.rpc("nina_lock_renovar", {
      _chave: lock.chave,
      _token: lock.token,
      _lease_segundos: LOCK_LEASE_SEGUNDOS,
    });
    return Boolean(data);
  } catch (e) {
    console.error("[nina] lock: falha ao renovar", e);
    return false;
  }
}

export async function liberarLockConversa(lock: LockConversa | null): Promise<void> {
  if (!lock) return;
  try {
    await supabaseAdmin.rpc("nina_lock_liberar", { _chave: lock.chave, _token: lock.token });
  } catch (e) {
    console.error("[nina] lock: falha ao liberar", e);
  }
}

/** Recupera lotes que ficaram reservados por uma execução que falhou. */
export async function recuperarLotesTravados(
  clinicaId: string,
  telefone: string,
): Promise<number> {
  try {
    const { data } = await supabaseAdmin.rpc("nina_batch_recuperar_travados", {
      _clinica_id: clinicaId,
      _telefone: telefone,
      _idade_segundos: 120,
    });
    return Number(data ?? 0);
  } catch (e) {
    console.error("[nina] lock: recuperação de lotes falhou", e);
    return 0;
  }
}
