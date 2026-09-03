const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const r = await supabaseAdmin.from("agendamentos").delete().eq("id","3c183a7d-755e-4831-8963-95692b336dbe");
console.log(r.error ?? "removido");
