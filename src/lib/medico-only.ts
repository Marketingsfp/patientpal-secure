import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna true se o usuário atual só tem memberships com role='medico'
 * (ou seja, deve ver a interface simplificada do médico, sem menu lateral).
 *
 * Se ele tiver qualquer outro papel (admin, recepcao, financeiro...) numa
 * clínica ativa, retorna false e ele entra no /app normal.
 */
export async function isMedicoOnlyUser(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("clinica_memberships")
    .select("role, ativo")
    .eq("user_id", userId)
    .eq("ativo", true);
  if (error || !data || data.length === 0) return false;
  return data.every((m) => (m.role ?? "").toLowerCase() === "medico");
}

/** Mesma verificação, porém sob uma sessão já conhecida (usa auth.getUser()). */
export async function currentUserIsMedicoOnly(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return false;
  return isMedicoOnlyUser(uid);
}