/**
 * FASE 9 — Achado do avaliador (Sol) → Revisão de aprendizados → regressão.
 *
 * Regras respeitadas aqui:
 *  - o avaliador apenas PROPÕE: o item nasce com status `pending`;
 *  - nada altera Prompt Principal, instruções publicadas, Base de
 *    Conhecimentos, modelo, regras, ferramentas ou código;
 *  - o teste de regressão só é criado depois de decisão humana na Revisão;
 *  - todo o contexto (execução, cenário, lead, mensagem, resposta, avaliação,
 *    evidência, trace, versão do prompt, fontes, tool calls) é lido do banco,
 *    nunca do navegador.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertMembership(supabase: any, userId: string, clinicaId: string) {
  const { data, error } = await supabase.rpc("is_member", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
}

/**
 * Envia um achado específico da avaliação do Sol para a Revisão de
 * aprendizados. Idempotente por (avaliação, índice do achado).
 */
export const enviarAchadoParaRevisao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        avaliacaoId: z.string().uuid(),
        achadoIndice: z.number().int().min(0).max(50),
        testeTipo: z.enum(["manual", "terra", "cenarios", "carga"]).default("manual"),
        testeExecucaoId: z.string().uuid().nullish(),
        observacao: z.string().trim().max(2000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const mod = await import("@/lib/nina/revisao-teste");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: aval, error: eAval } = await supabaseAdmin
      .from("nina_teste_avaliacoes")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.avaliacaoId)
      .maybeSingle();
    if (eAval) throw new Error(eAval.message);
    if (!aval) throw new Error("Avaliação não encontrada nesta clínica");

    const achados = ((aval as any).achados ?? []) as any[];
    const achado = achados[data.achadoIndice];
    if (!achado) throw new Error("Achado não encontrado nesta avaliação");

    const conversaId = (aval as any).conversa_id as string;

    // Já enviado? Não duplica a fila.
    const { data: existentes } = await supabaseAdmin
      .from("nina_feedback_erros")
      .select("id, status, teste_evidencia")
      .eq("clinica_id", data.clinicaId)
      .eq("avaliacao_id", data.avaliacaoId)
      .limit(50);
    const jaExiste = ((existentes ?? []) as any[]).find(
      (l) => (l.teste_evidencia as any)?.achado_indice === data.achadoIndice,
    );
    if (jaExiste) return { item: jaExiste, duplicado: true };

    /* ---------------- contexto real da conversa de teste ---------------- */

    const { data: msgs } = await supabaseAdmin
      .from("whatsapp_mensagens")
      .select("id, direction, body, created_at")
      .eq("clinica_id", data.clinicaId)
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: true })
      .limit(120);
    const lista = ((msgs ?? []) as any[]).map((m) => ({
      id: String(m.id),
      autor: m.direction === "in" ? "paciente" : "nina",
      texto: String(m.body ?? ""),
    }));

    // Localiza o turno citado pelo achado pelo trecho da mensagem.
    const trecho = String(achado.mensagem ?? "").trim().slice(0, 60).toLowerCase();
    let idxNina = -1;
    if (trecho) {
      idxNina = lista.findIndex(
        (m) => m.autor === "nina" && m.texto.toLowerCase().includes(trecho),
      );
      if (idxNina < 0) {
        const idxPac = lista.findIndex(
          (m) => m.autor === "paciente" && m.texto.toLowerCase().includes(trecho),
        );
        if (idxPac >= 0)
          idxNina = lista.findIndex((m, k) => k > idxPac && m.autor === "nina");
      }
    }
    if (idxNina < 0) idxNina = lista.map((m) => m.autor).lastIndexOf("nina");
    const respostaNina = idxNina >= 0 ? lista[idxNina] : null;
    const mensagemPaciente =
      idxNina >= 0
        ? [...lista.slice(0, idxNina)].reverse().find((m) => m.autor === "paciente") ?? null
        : (lista.filter((m) => m.autor === "paciente").at(-1) ?? null);

    const { data: execs } = await supabaseAdmin
      .from("nina_execucoes")
      .select("id, trace_id, prompt_versao, prompt_versao_id, created_at")
      .eq("clinica_id", data.clinicaId)
      .eq("conversation_id", conversaId)
      .order("created_at", { ascending: true })
      .limit(60);
    const traceIds = Array.from(
      new Set(((execs ?? []) as any[]).map((e) => e.trace_id).filter(Boolean).map(String)),
    ).slice(-10);

    const { data: linhasTool } = await supabaseAdmin
      .from("audit_log")
      .select("dados_depois")
      .eq("clinica_id", data.clinicaId)
      .eq("action", "NINA_TOOL")
      .eq("dados_depois->>conversa_id", conversaId)
      .order("created_at", { ascending: false })
      .limit(60);
    const toolCalls = ((linhasTool ?? []) as any[])
      .map((l) => {
        const d = l.dados_depois ?? {};
        return {
          ferramenta: String(d.entrada?.ferramenta ?? d.ferramenta ?? "?"),
          ok: Boolean(d.ok),
          erro: (d.erro as string | null) ?? null,
        };
      })
      .reverse();

    const fontes: string[] = [];
    const execIds = ((execs ?? []) as any[]).map((e) => String(e.id));
    if (execIds.length) {
      const { data: evid } = await supabaseAdmin
        .from("nina_execucao_evidencias")
        .select("etapas")
        .in("execucao_id", execIds.slice(-10));
      for (const linha of (evid ?? []) as any[]) {
        for (const etapa of (linha?.etapas ?? []) as any[]) {
          if (etapa?.tipo !== "consulta") continue;
          const titulo = String(etapa.titulo ?? etapa.dados?.secao ?? "").trim();
          if (titulo && !fontes.includes(titulo)) fontes.push(titulo);
        }
      }
    }

    const { data: lead } = await supabaseAdmin
      .from("nina_teste_leads")
      .select("indice")
      .eq("clinica_id", data.clinicaId)
      .eq("id", (aval as any).lead_id)
      .maybeSingle();

    const ctx = {
      testeTipo: data.testeTipo,
      testeExecucaoId: data.testeExecucaoId ?? null,
      cenarioTexto: null as string | null,
      cenarioId: ((aval as any).cenario_id as string | null) ?? null,
      leadIndice: (lead as any)?.indice ?? null,
      conversaId,
      avaliacaoId: data.avaliacaoId,
      avaliacaoResultado: (aval as any).resultado ?? null,
      avaliacaoScore: (aval as any).score ?? null,
      avaliacaoResumo: (aval as any).resumo ?? null,
      modeloAvaliador: (aval as any).modelo ?? null,
      promptVersao: (aval as any).prompt_versao ?? null,
      promptVersaoId: (aval as any).prompt_versao_id ?? null,
      traceIds,
      mensagemPaciente: mensagemPaciente?.texto ?? null,
      respostaNina: respostaNina?.texto ?? null,
      mensagemId: respostaNina?.id ?? null,
      fontes: fontes.slice(0, 20),
      toolCalls: toolCalls.slice(0, 30),
    };

    if (ctx.cenarioId) {
      const { data: cen } = await supabaseAdmin
        .from("nina_teste_cenarios")
        .select("nome")
        .eq("clinica_id", data.clinicaId)
        .eq("id", ctx.cenarioId)
        .maybeSingle();
      ctx.cenarioTexto = (cen as any)?.nome ?? null;
    }

    const evidencia = mod.evidenciaDoAchado(achado, ctx, data.achadoIndice);
    const observacaoBase = mod.observacaoDoAchado(achado, ctx);
    const observacao = data.observacao?.trim()
      ? `${observacaoBase}\n\nObservação de quem enviou: ${data.observacao.trim()}`
      : observacaoBase;

    const { data: item, error } = await supabaseAdmin
      .from("nina_feedback_erros")
      .insert({
        clinica_id: data.clinicaId,
        conversa_id: conversaId,
        mensagem_id: ctx.mensagemId,
        mensagem_texto: ctx.respostaNina,
        pergunta_texto: ctx.mensagemPaciente,
        categoria: evidencia.classificacao.categoria,
        correcao: mod.correcaoDoAchado(achado),
        observacao,
        status: "pending",
        origem: mod.ORIGEM_AVALIACAO_TESTE,
        reportado_por: context.userId,
        teste_tipo: data.testeTipo,
        teste_execucao_id: data.testeExecucaoId ?? null,
        teste_lead_indice: ctx.leadIndice,
        teste_cenario_id: ctx.cenarioId,
        avaliacao_id: data.avaliacaoId,
        teste_evidencia: evidencia as never,
        trace_ids: traceIds,
        prompt_versao: ctx.promptVersao,
      } as never)
      .select("id, status, categoria, created_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { item, duplicado: false };
  });

/** Itens de revisão já criados a partir de uma avaliação (para a UI). */
export const listarAchadosEnviados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), avaliacaoId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { data: linhas, error } = await context.supabase
      .from("nina_feedback_erros")
      .select("id, status, categoria, decisao_humana, regressao_cenario_id, teste_evidencia, created_at")
      .eq("clinica_id", data.clinicaId)
      .eq("avaliacao_id", data.avaliacaoId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    return {
      itens: ((linhas ?? []) as any[]).map((l) => ({
        id: l.id,
        status: l.status,
        categoria: l.categoria,
        decisaoHumana: l.decisao_humana ?? null,
        cenarioRegressaoId: l.regressao_cenario_id ?? null,
        achadoIndice: (l.teste_evidencia as any)?.achado_indice ?? null,
        criadoEm: l.created_at,
      })),
    };
  });

/**
 * Transforma um erro CONFIRMADO por um humano em cenário de regressão.
 * Não roda o teste — apenas cria o cenário na biblioteca, ligado ao item.
 */
export const criarTesteRegressaoDeAchado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        feedbackId: z.string().uuid(),
        nome: z.string().trim().min(3).max(120).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const mod = await import("@/lib/nina/revisao-teste");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: item, error: eItem } = await supabaseAdmin
      .from("nina_feedback_erros")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (eItem) throw new Error(eItem.message);
    if (!item) throw new Error("Item de revisão não encontrado nesta clínica");

    const bloqueio = mod.motivoBloqueioRegressao(item as any);
    if (bloqueio) throw new Error(bloqueio);

    if ((item as any).regressao_cenario_id) {
      return { cenarioId: (item as any).regressao_cenario_id, jaExistia: true };
    }

    const evid = ((item as any).teste_evidencia ?? {}) as any;
    const achado = evid.achado ?? {
      observado: (item as any).mensagem_texto ?? "",
      esperado: (item as any).correcao ?? "",
      componente: "",
      dimensao: null,
    };

    const rascunho = mod.rascunhoCenarioRegressao({
      mensagemPaciente: evid.mensagem_paciente ?? (item as any).pergunta_texto ?? null,
      achado,
      cenarioTexto: evid.teste?.cenario ?? null,
      toolCalls: (evid.tool_calls ?? []) as { ferramenta: string }[],
    });

    const { data: cenario, error: eCen } = await supabaseAdmin
      .from("nina_teste_cenarios")
      .insert({
        clinica_id: data.clinicaId,
        nome: (data.nome?.trim() || rascunho.nome).slice(0, 120),
        descricao: rascunho.descricao,
        categoria: "regressao",
        objetivo: rascunho.objetivo,
        precondicoes: null,
        dados_sinteticos: rascunho.dadosSinteticos as never,
        criterios: rascunho.criterios as never,
        persona: {} as never,
        max_turnos: rascunho.maxTurnos,
        tags: rascunho.tags,
        status: "ativo",
        criado_por: context.userId,
        origem_feedback_id: (item as any).id,
        origem_avaliacao_id: (item as any).avaliacao_id ?? null,
      } as never)
      .select("id, nome")
      .maybeSingle();
    if (eCen) throw new Error(eCen.message);

    const { error: eUpd } = await supabaseAdmin
      .from("nina_feedback_erros")
      .update({ regressao_cenario_id: (cenario as any).id } as never)
      .eq("clinica_id", data.clinicaId)
      .eq("id", (item as any).id);
    if (eUpd) throw new Error(eUpd.message);

    return { cenarioId: (cenario as any).id, nome: (cenario as any).nome, jaExistia: false };
  });
