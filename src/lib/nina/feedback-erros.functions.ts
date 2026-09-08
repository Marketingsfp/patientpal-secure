/**
 * Feedback de erros da Nina — acesso a dados (FASE 1).
 *
 * Só grava o feedback estruturado em `nina_feedback_erros` com status
 * `pending`. NÃO altera Base de Conhecimentos, planilha, embeddings, prompt,
 * modelo, regras ou ferramentas — e não interrompe a conversa em andamento.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VALORES_CATEGORIA_FEEDBACK } from "@/lib/nina/feedback-erros";

const schema = z.object({
  clinicaId: z.string().uuid(),
  conversaId: z.string().uuid().nullish(),
  mensagemId: z.string().uuid().nullish(),
  mensagemTexto: z.string().max(8000).nullish(),
  perguntaTexto: z.string().max(8000).nullish(),
  categoria: z.enum(VALORES_CATEGORIA_FEEDBACK),
  correcao: z.string().trim().min(3, "Descreva qual seria a informação correta.").max(4000),
  observacao: z.string().trim().max(4000).nullish(),
});

export const registrarFeedbackErroNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => schema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: membro, error: erroMembro } = await context.supabase.rpc("is_member", {
      _user_id: context.userId,
      _clinica_id: data.clinicaId,
    });
    if (erroMembro) throw new Error(erroMembro.message);
    if (!membro) throw new Error("Sem acesso a esta clínica");

    const { data: linha, error } = await context.supabase
      .from("nina_feedback_erros")
      .insert({
        clinica_id: data.clinicaId,
        conversa_id: data.conversaId ?? null,
        mensagem_id: data.mensagemId ?? null,
        mensagem_texto: data.mensagemTexto ?? null,
        pergunta_texto: data.perguntaTexto ?? null,
        categoria: data.categoria,
        correcao: data.correcao,
        observacao: data.observacao?.trim() ? data.observacao.trim() : null,
        status: "pending",
        reportado_por: context.userId,
      })
      .select("id, status, created_at")
      .single();
    if (error) throw new Error(error.message);
    return linha;
  });

/** Lista somente leitura — apoio interno. Não há fluxo de aprovação nesta fase. */
export const listarFeedbacksErroNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid().nullish() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("nina_feedback_erros")
      .select(
        "id, conversa_id, mensagem_id, categoria, correcao, observacao, status, reportado_por, created_at",
      )
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.conversaId) q = q.eq("conversa_id", data.conversaId);
    const { data: linhas, error } = await q;
    if (error) throw new Error(error.message);
    return linhas ?? [];
  });

/**
 * Reporte rápido (um clique) de erro em uma mensagem da Nina — FASE 1.
 *
 * Reutiliza a mesma fila (`nina_feedback_erros`) e a mesma aba de Revisão de
 * aprendizados. Não exige motivo, categoria detalhada, observação ou correção:
 * entra como "Erro reportado — a classificar", com status `pending`.
 *
 * Validações no servidor: acesso à clínica, leitura da conversa pela RLS do
 * próprio usuário, mensagem pertencente à conversa e enviada pela Nina.
 * O conteúdo gravado é o texto armazenado no sistema — nunca o texto vindo do
 * frontend — preservado sem resumo, correção ou alteração de quebras de linha.
 */
export const reportarErroRapidoMensagemNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        mensagemId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const {
      validarMensagemNina,
      montarRegistroErroRapido,
      ehConflitoDuplicidade,
      estadoAuditoria,
      ambienteDoReporte,
      ORIGEM_ERRO_RAPIDO,
    } = await import("@/lib/nina/erro-rapido");


    const { data: membro, error: erroMembro } = await context.supabase.rpc("is_member", {
      _user_id: context.userId,
      _clinica_id: data.clinicaId,
    });
    if (erroMembro) throw new Error(erroMembro.message);
    if (!membro) throw new Error("Sem acesso a esta clínica");

    // A conversa é lida com a RLS do próprio usuário: quem não pode vê-la
    // simplesmente não encontra a mensagem.
    const { data: conversa, error: erroConversa } = await context.supabase
      .from("atend_conversas")
      .select(
        "id, contato_paciente_id, contato_telefone, protocolo_atendimento, protocolo_sessao_id, teste_ciclo_id, is_teste",
      )
      .eq("id", data.conversaId)

      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (erroConversa) throw new Error(erroConversa.message);
    if (!conversa) throw new Error("Conversa não encontrada ou sem permissão de acesso.");


    const { data: mensagem, error: erroMensagem } = await context.supabase
      .from("whatsapp_mensagens")
      .select(
        "id, conversa_id, clinica_id, direction, enviada_por, body, transcricao, execucao_id, created_at",
      )
      .eq("id", data.mensagemId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (erroMensagem) throw new Error(erroMensagem.message);

    const validacao = validarMensagemNina(mensagem as never, data.conversaId);
    if (!validacao.ok) throw new Error(validacao.mensagem);

    // Auditoria: SEMPRE pela execução gravada NESTA mensagem — nunca a última
    // execução da conversa. Sem execução, o reporte continua válido.
    const msg = mensagem as unknown as {
      execucao_id: string | null;
      created_at: string | null;
    };
    const execucaoId = msg.execucao_id ?? null;
    let execucao: {
      model: string | null;
      latency_ms: number | null;
      created_at: string | null;
      prompt_versao_id?: string | null;
      prompt_versao?: number | null;
    } | null = null;
    if (execucaoId) {
      const { data: exec } = await context.supabase
        .from("nina_execucoes")
        .select("id, model, latency_ms, created_at, prompt_versao_id, prompt_versao")
        .eq("id", execucaoId)
        .maybeSingle();
      execucao = (exec as typeof execucao) ?? null;
    }
    const auditoriaStatus = estadoAuditoria({
      execucaoId,
      execucao,
      mensagemCriadaEmMs: msg.created_at ? Date.parse(msg.created_at) : null,
    });

    // Trace da PRÓPRIA mensagem (nunca por texto/horário aproximado).
    let traceId: string | null = null;
    {
      const { data: evento } = await context.supabase
        .from("nina_trace_eventos")
        .select("trace_id")
        .eq("clinica_id", data.clinicaId)
        .eq("message_id", data.mensagemId)
        .limit(1)
        .maybeSingle();
      traceId = (evento as { trace_id: string | null } | null)?.trace_id ?? null;
    }

    const conv = conversa as unknown as {
      contato_paciente_id: string | null;
      contato_telefone: string | null;
      protocolo_atendimento: string | null;
      protocolo_sessao_id: string | null;
      teste_ciclo_id: string | null;
      is_teste: boolean | null;
    };

    // Ambiente vem da própria conversa (nunca de suposição). Em homologação,
    // a sessão da Nina é lida do ciclo de teste ligado a esta conversa.
    const ambiente = ambienteDoReporte({ isTeste: conv.is_teste });
    let ninaSessionId: string | null = null;
    if (ambiente !== "production" && conv.teste_ciclo_id) {
      const { data: ciclo } = await context.supabase
        .from("nina_teste_ciclos")
        .select("nina_session_id")
        .eq("id", conv.teste_ciclo_id)
        .maybeSingle();
      ninaSessionId = (ciclo as { nina_session_id: string | null } | null)?.nina_session_id ?? null;
    }

    const colunas =
      "id, status, categoria, origem, created_at, mensagem_id, conversa_id, execucao_id, auditoria_status, contato_paciente_id, contato_telefone, protocolo_atendimento, protocolo_sessao_id, prompt_versao_id, prompt_versao, teste_ciclo_id, trace_id, ambiente, nina_session_id";


    // 1ª barreira: já existe reporte rápido pendente para esta mensagem.
    const { data: existente } = await context.supabase
      .from("nina_feedback_erros")
      .select(colunas)
      .eq("clinica_id", data.clinicaId)
      .eq("mensagem_id", data.mensagemId)
      .eq("origem", ORIGEM_ERRO_RAPIDO)
      .eq("status", "pending")
      .maybeSingle();
    if (existente) return { ...existente, duplicado: true };

    const { data: linha, error } = await context.supabase
      .from("nina_feedback_erros")
      .insert(
        montarRegistroErroRapido({
          clinicaId: data.clinicaId,
          conversaId: data.conversaId,
          mensagemId: data.mensagemId,
          snapshot: validacao.snapshot,
          reporterUserId: context.userId,
          execucaoId,
          auditoriaStatus,
          vinculo: {
            contatoPacienteId: conv.contato_paciente_id,
            contatoTelefone: conv.contato_telefone,
            protocoloAtendimento: conv.protocolo_atendimento,
            protocoloSessaoId: conv.protocolo_sessao_id,
            testeCicloId: conv.teste_ciclo_id,
            promptVersaoId:
              (execucao as { prompt_versao_id?: string | null } | null)?.prompt_versao_id ?? null,
            promptVersao:
              (execucao as { prompt_versao?: number | null } | null)?.prompt_versao ?? null,

            traceId,
          },
        }) as never,
      )
      .select(colunas)
      .single();


    if (error) {
      // 2ª barreira (concorrência / duplo clique): índice único parcial no banco.
      if (ehConflitoDuplicidade(error)) {
        const { data: jaExiste } = await context.supabase
          .from("nina_feedback_erros")
          .select(colunas)
          .eq("clinica_id", data.clinicaId)
          .eq("mensagem_id", data.mensagemId)
          .eq("origem", ORIGEM_ERRO_RAPIDO)
          .eq("status", "pending")
          .maybeSingle();
        if (jaExiste) return { ...jaExiste, duplicado: true };
      }
      throw new Error(error.message);
    }
    return { ...linha, duplicado: false };
  });
