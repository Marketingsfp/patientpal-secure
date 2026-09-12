/**
 * Repetição dos cenários 3, 7 e 10 da validação integrada, que abortaram com
 * "Conversa resolvida durante o processamento." na primeira execução.
 * Sem publicação: usa a versão publicada vigente (conteúdo da v6 restaurado).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { garantirLeads, processarMensagemTeste, resetarLeadTeste } from "@/lib/nina/teste-console.server";

const clinicaId = process.argv[2] ?? "";
const admin = supabaseAdmin as any;
const leads = await garantirLeads(admin, clinicaId);

async function auditoria(turnoId: string | null) {
  if (!turnoId) return null;
  const { data } = await admin
    .from("nina_trace_eventos")
    .select("metadata")
    .eq("clinica_id", clinicaId)
    .eq("node_id", "turn.summary")
    .eq("trace_id", turnoId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.metadata ?? null) as any;
}

async function rodar(indice: number, texto: string, rotulo: string) {
  const leadId = leads[indice]!.id;
  await resetarLeadTeste(admin, { clinicaId, leadId, userId: null, origem: "validacao-integrada" });
  // Espaço entre o reset e o envio: o preflight precisa estar persistido.
  await new Promise((r) => setTimeout(r, 1500));
  const r: any = await processarMensagemTeste(
    { clinicaId, leadId, tipo: "text", texto, chave: `rerun-${Date.now()}` },
    null,
  );
  const meta = await auditoria(r.turnoId ?? null);
  const aud = meta?.auditoria_instrucoes?.[meta.auditoria_instrucoes.length - 1] ?? null;
  const saida = {
    cenario: rotulo,
    reply: r.reply,
    erro: r.erro ?? null,
    transferida: Boolean(r.transferida),
    turnoId: r.turnoId,
    execucaoId: r.execucaoId,
    conversaId: r.conversaId,
    versao: meta?.versao_prompt?.versao ?? null,
    origemResposta: meta?.origem_resposta ?? null,
    transformacoes: meta?.transformacoes ?? [],
    confianca: meta?.confianca ?? null,
    auditoriaEstado: aud?.estado ?? null,
    verificacoes: aud?.verificacoes ?? [],
    limitacoes: aud?.limitacoes ?? [],
    regrasAplicaveis: aud?.regras_aplicaveis ?? [],
    regrasNaoAplicaveis: aud?.regras_nao_aplicaveis ?? [],
    regrasNaoInterpretadas: aud?.regras_nao_interpretadas ?? [],
  };
  console.log(`\n== ${rotulo}\n${JSON.stringify(saida, null, 2)}`);
  return saida;
}

const c3 = await rodar(6, "Bom dia! Vocês atendem aos sábados?", "3 — mensagem fora do gatilho");
const c10 = await rodar(
  7,
  "Qual o valor exato do transplante capilar robótico com anestesia geral aí?",
  "10 — baixa confiabilidade / intervenção",
);
await Bun.write(
  `evidencias/nina/validacao-integrada-rerun-${Date.now()}.json`,
  JSON.stringify({ clinicaId, cenarios: [c3, c10] }, null, 2),
);
