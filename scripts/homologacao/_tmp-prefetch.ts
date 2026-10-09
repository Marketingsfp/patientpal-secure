import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { garantirLeads, processarMensagemTeste, resetarLeadTeste } from "@/lib/nina/teste-console.server";
const clinicaId = "7570ddde-8c1c-4b55-ba72-cf12b2a6c940";
const admin = supabaseAdmin as any;
const leads = await garantirLeads(admin, clinicaId);
let r: any; for (const l of leads.slice(1)) { const leadId = l.id;
await new Promise(r => setTimeout(r, 1500));
r = await processarMensagemTeste({ clinicaId, leadId, tipo: "text", texto: "bom dia, quanto ta a consulta com dermatologista? tem vaga semana q vem?", chave: `pf-${Date.now()}` }, null);
console.log("TURNO", l.nome, r.turnoId, r.erro ?? ""); if (r.turnoId) break; }
const { data } = await admin.from("nina_trace_eventos").select("node_id,event_type,metadata").eq("trace_id", r.turnoId).in("node_id", ["tool.prefetch","jev.decision","llm.generate"]);
console.log(JSON.stringify(data?.map((d:any)=>({n:d.node_id,t:d.event_type,m:d.node_id==="tool.prefetch"?d.metadata:undefined})),null,1));
