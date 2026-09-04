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

/**
 * Cadastro de médico da clínica ligado ao usuário logado, ou null quando esse
 * vínculo ainda não foi feito.
 *
 * O `user_id` é a ligação oficial; o e-mail é só o plano B, para os cadastros
 * antigos em que o gestor preencheu o e-mail do profissional mas o vínculo
 * nunca foi gravado. Cadastro ativo tem preferência: um médico costuma ter
 * cadastros duplicados antigos, e é o ativo que a agenda usa.
 */
export async function cadastroMedicoDoUsuario(
  clinicaId: string,
): Promise<{ id: string; nome: string } | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data: porVinculo } = await supabase
    .from("medicos")
    .select("id, nome, ativo")
    .eq("clinica_id", clinicaId)
    .eq("user_id", uid)
    .order("ativo", { ascending: false })
    .limit(1);
  const achado = (porVinculo ?? [])[0];
  if (achado) return { id: achado.id, nome: achado.nome };

  const email = auth.user?.email ?? null;
  if (!email) return null;
  const { data: porEmail } = await supabase
    .from("medicos")
    .select("id, nome, ativo")
    .eq("clinica_id", clinicaId)
    .ilike("email", email)
    .order("ativo", { ascending: false })
    .limit(1);
  const porMail = (porEmail ?? [])[0];
  return porMail ? { id: porMail.id, nome: porMail.nome } : null;
}

/** Mesma verificação, porém sob uma sessão já conhecida (usa auth.getUser()). */
export async function currentUserIsMedicoOnly(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return false;
  return isMedicoOnlyUser(uid);
}
