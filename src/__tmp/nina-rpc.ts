import { supabaseAdmin } from "../integrations/supabase/client.server";
const r = await supabaseAdmin.rpc("get_horarios_disponiveis" as any, { _clinica_id: "7570ddde-8c1c-4b55-ba72-cf12b2a6c940", _especialidade_id: null, _medico_id: null, _dias: 14, _limite: 20 } as any);
console.log(r.error ?? JSON.stringify((r.data as any)?.slice?.(0,3)), Array.isArray(r.data) ? r.data.length : null);
