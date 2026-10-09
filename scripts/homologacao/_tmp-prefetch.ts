import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { garantirLeads, processarMensagemTeste } from "@/lib/nina/teste-console.server";
const clinicaId = "7570ddde-8c1c-4b55-ba72-cf12b2a6c940";
const admin = supabaseAdmin as any;
const leads = await garantirLeads(admin, clinicaId);
const texto = process.argv[2]!;
const r: any = await processarMensagemTeste({ clinicaId, leadId: leads[5]!.id, tipo: "text", texto, chave: `pf-${Date.now()}` }, null);
console.log("RES0", r.turnoId, r.erro ?? "");
const { data } = await admin.from("nina_trace_eventos").select("node_id,event_type,metadata").eq("trace_id", r.turnoId).in("node_id", ["tool.prefetch","llm.generate"]);
console.log("RES", "rodadas:", data?.filter((d:any)=>d.node_id==="llm.generate"&&d.event_type==="completed").length,
  JSON.stringify(data?.filter((d:any)=>d.node_id==="tool.prefetch").map((d:any)=>[d.event_type,d.metadata])));
