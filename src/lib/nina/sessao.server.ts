/**
 * Ponte server-only entre a sessão da Nina (regras puras em `sessao.ts`) e a
 * conversa persistida. Nada aqui apaga histórico, CRM, agendamentos ou Base.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizarEstado, type EstadoFluxoNina } from "./fluxo-estado-normalizar";
import { aplicarTtlSessao, ttlSessaoMinutos, type ResultadoSessao } from "./sessao";

/** Aplica o TTL deslizante ao estado bruto vindo de `atend_conversas`. */
export function resolverSessao(
  bruto: unknown,
  fallbackUltimaAtividade?: string | null,
  agora: Date = new Date(),
): ResultadoSessao {
  return aplicarTtlSessao(
    normalizarEstado(bruto),
    agora,
    ttlSessaoMinutos(),
    fallbackUltimaAtividade ?? null,
  );
}

/** Persiste o estado já resolvido (usado quando a sessão expira). */
export async function persistirEstadoSessao(
  clinicaId: string,
  conversaId: string | null,
  estado: EstadoFluxoNina,
): Promise<void> {
  if (!conversaId) return;
  try {
    await supabaseAdmin
      .from("atend_conversas")
      .update({
        nina_fluxo_estado: { ...estado, updated_at: new Date().toISOString() } as never,
      })
      .eq("id", conversaId)
      .eq("clinica_id", clinicaId);
  } catch (e) {
    console.error("[nina-sessao] falha ao persistir estado", e);
  }
}
