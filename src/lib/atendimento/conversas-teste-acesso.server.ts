import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { perfilPodeSimularAtendimento } from "./conversas-teste";

/** Não confere poderes de gestão: somente o controle de treinamento. */
export async function usuarioPodeSimularAtendimento(
  db: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("clinica_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  return !error && perfilPodeSimularAtendimento(data?.role);
}
