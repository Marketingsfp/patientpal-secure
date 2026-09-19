import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Usa a sessão autenticada: RLS restringe ao próprio usuário e à clínica. */
export async function guardarPromptCarga(
  db: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
  pedido: string,
): Promise<void> {
  const { error } = await db
    .from("nina_carga_prompts")
    .upsert(
      { clinica_id: clinicaId, user_id: userId, pedido, ultimo_usado_em: new Date().toISOString() },
      { onConflict: "clinica_id,user_id,pedido_hash" },
    );
  if (error) throw new Error("Não foi possível salvar seu prompt. Tente novamente antes de gerar.");
}
