/**
 * FASE 1 — MONTAGEM DO PACOTE DE EVIDÊNCIAS (leitura dirigida).
 *
 * Só LEITURA, sempre com a sessão do usuário (RLS por clínica) e sempre por
 * identificador exato: nunca varre tabela inteira, nunca cruza clínica e
 * nunca envia credencial ao modelo. Abrir uma investigação jamais executa a
 * Nina de novo.
 *
 * Falta de registro vira LACUNA declarada no pacote — nunca prova de que a
 * operação não aconteceu.
 */
import {
  VERSAO_CONTRATO_PACOTE,
  cortar,
  etapaDoColetor,
  lacunasDoPacote,
  selarPacote,
  type AlteracaoPosteriorEvidencia,
  type AnaliseReferenciada,
  type ConfiancaEvidencia,
  type EntregaEvidencia,
  type EtapaEvidencia,
  type ExecucaoEvidencia,
  type FerramentaEvidencia,
  type MensagemEntradaEvidencia,
  type OrigemPacote,
  type PacoteInvestigacao,
  type PromptEvidencia,
} from "./evidencias-pacote";
import { ordenarEtapas, type Etapa } from "./evidencias";
import type { ReferenciaCodigo } from "./evidencias";

type Cliente = { from: (t: string) => any };

/** Arquivos que a correção desta camada precisa tocar (revisão do contrato). */
const ARQUIVOS_ALVO = [
  "src/lib/nina/analise-erro.functions.ts",
  "src/lib/nina/analise-erro.ts",
  "src/lib/nina/evidencias.functions.ts",
  "src/lib/nina/evidencias.ts",
  "src/lib/nina/evidencias-pacote.ts",
  "src/lib/nina/evidencias-pacote.server.ts",
  "src/lib/nina/prompt-snapshot.functions.ts",
  "src/lib/nina/arquitetura/execucoes.functions.ts",
  "src/lib/nina/rastreio/turno.server.ts",
  "src/lib/nina/decisoes.ts",
].map((arquivo) => ({ arquivo, revisao: VERSAO_CONTRATO_PACOTE as string | null }));

/** Janela de tentativas irmãs consideradas relevantes (mesma conversa). */
const JANELA_TENTATIVAS_MS = 10 * 60 * 1000;
const MAX_EXECUCOES = 8;
const MAX_TRACE = 200;

export type EntradaPacote = {
  clinicaId: string;
  feedbackId: string;
  /** Análise escolhida; quando ausente, usa a última concluída. */
  analiseId?: string | null;
  origem?: OrigemPacote;
  /** Revisão anterior conhecida (enriquecimento sobe a revisão). */
  revisaoAnterior?: number | null;
};

export async function montarPacoteInvestigacao(
  supabase: unknown,
  entrada: EntradaPacote,
): Promise<PacoteInvestigacao> {
  const db = supabase as Cliente;
  const cortes: string[] = [];
  const clinicaId = entrada.clinicaId;

  /* ---------------------------------------------------- feedback reportado */
  const { data: fb, error: eFb } = await db
    .from("nina_feedback_erros")
    .select(
      "id, clinica_id, conversa_id, mensagem_id, mensagem_texto, pergunta_texto, categoria, root_cause, status, execucao_id, created_at",
    )
    .eq("id", entrada.feedbackId)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  if (eFb) throw new Error(eFb.message);
  if (!fb) throw new Error("Erro reportado não encontrado nesta clínica.");

  /* ------------------------------------------------------ análise escolhida */
  let analise: AnaliseReferenciada | null = null;
  {
    let q = db
      .from("nina_feedback_analises")
      .select("id, versao, criterios_versao, modelo, status, conclusao, resultado")
      .eq("clinica_id", clinicaId)
      .eq("feedback_id", entrada.feedbackId);
    q = entrada.analiseId
      ? q.eq("id", entrada.analiseId)
      : q.eq("status", "done").order("versao", { ascending: false }).limit(1);
    const { data: linha } = await q.maybeSingle();
    if (linha) {
      const resultado = (linha.resultado ?? {}) as Record<string, unknown>;
      const hipoteses: string[] = [];
      if (typeof resultado["causaProvavel"] === "string") {
        hipoteses.push(String(resultado["causaProvavel"]));
      }
      if (Array.isArray(resultado["limitacoes"])) {
        for (const l of resultado["limitacoes"] as unknown[]) hipoteses.push(String(l));
      }
      analise = {
        analiseId: String(linha.id),
        versao: (linha.versao as number | null) ?? null,
        criteriosVersao: (linha.criterios_versao as string | null) ?? null,
        modelo: (linha.modelo as string | null) ?? null,
        status: (linha.status as string | null) ?? null,
        veredito: (resultado["veredito"] as string | null) ?? null,
        conclusao: cortar((linha.conclusao as string | null) ?? null, "conclusao_analise", cortes),
        hipoteses,
      };
    }
  }

  /* -------------------------------------------------- execuções relevantes */
  const execucoes: ExecucaoEvidencia[] = [];
  const execucaoPrincipalId = (fb.execucao_id as string | null) ?? null;
  const colunasExec =
    "id, clinica_id, conversation_id, model, thinking_level, latency_ms, knowledge_status, tool_calls, success, error_category, handoff, retries, input_tokens, output_tokens, created_at, mensagens_entrada";

  let principal: Record<string, any> | null = null;
  if (execucaoPrincipalId) {
    const { data } = await db
      .from("nina_execucoes")
      .select(colunasExec)
      .eq("id", execucaoPrincipalId)
      .eq("clinica_id", clinicaId)
      .maybeSingle();
    principal = (data as Record<string, any> | null) ?? null;
  }

  const brutas: Record<string, any>[] = [];
  if (principal) brutas.push(principal);

  // Tentativas irmãs: mesma conversa, na janela em torno da execução principal.
  const conversaId = (fb.conversa_id as string | null) ?? principal?.["conversation_id"] ?? null;
  const referencia = principal?.["created_at"] ?? (fb.created_at as string | null);
  if (conversaId && referencia) {
    const t = Date.parse(String(referencia));
    const de = new Date(t - JANELA_TENTATIVAS_MS).toISOString();
    const ate = new Date(t + JANELA_TENTATIVAS_MS).toISOString();
    const { data: irmas } = await db
      .from("nina_execucoes")
      .select(colunasExec)
      .eq("clinica_id", clinicaId)
      .eq("conversation_id", conversaId)
      .gte("created_at", de)
      .lte("created_at", ate)
      .order("created_at", { ascending: true })
      .limit(MAX_EXECUCOES);
    for (const l of (irmas ?? []) as Record<string, any>[]) {
      if (!brutas.some((b) => b["id"] === l["id"])) brutas.push(l);
    }
  }

  for (const l of brutas.slice(0, MAX_EXECUCOES)) {
    execucoes.push({
      id: String(l["id"]),
      conversaId: (l["conversation_id"] as string | null) ?? null,
      principal: String(l["id"]) === execucaoPrincipalId,
      modelo: (l["model"] as string | null) ?? null,
      nivel: (l["thinking_level"] as string | null) ?? null,
      latenciaMs: (l["latency_ms"] as number | null) ?? null,
      knowledgeStatus: (l["knowledge_status"] as string | null) ?? null,
      toolCalls: l["tool_calls"] ?? null,
      sucesso: (l["success"] as boolean | null) ?? null,
      categoriaErro: (l["error_category"] as string | null) ?? null,
      handoff: (l["handoff"] as boolean | null) ?? null,
      retries: (l["retries"] as number | null) ?? null,
      inputTokens: (l["input_tokens"] as number | null) ?? null,
      outputTokens: (l["output_tokens"] as number | null) ?? null,
      em: (l["created_at"] as string | null) ?? null,
      mensagensEntrada: ((l["mensagens_entrada"] ?? []) as string[]).map(String),
      erroProvedor: (l["error_category"] as string | null) ?? null,
    });
  }

  /* ------------------------------------------------------------- entradas */
  // IDs vinculados por execução — a ordem e o horário vêm da mensagem real.
  const donoDoId = new Map<string, string>();
  for (const e of execucoes) {
    for (const id of e.mensagensEntrada) if (!donoDoId.has(id)) donoDoId.set(id, e.id);
  }
  const ids = [...donoDoId.keys()];
  const entradas: MensagemEntradaEvidencia[] = [];
  if (ids.length) {
    const { data: msgs } = await db
      .from("whatsapp_mensagens")
      .select("id, body, created_at")
      .in("id", ids)
      .eq("clinica_id", clinicaId);
    const porId = new Map<string, Record<string, any>>();
    for (const m of (msgs ?? []) as Record<string, any>[]) porId.set(String(m["id"]), m);
    for (const id of ids) {
      const m = porId.get(id);
      entradas.push({
        id,
        texto: cortar((m?.["body"] as string | null) ?? "", `mensagem_${id}`, cortes) ?? "",
        em: (m?.["created_at"] as string | null) ?? null,
        execucaoId: donoDoId.get(id) ?? null,
        ausente: !m,
      });
    }
    // Ordem cronológica real; ids sem mensagem ficam no fim, declarados ausentes.
    entradas.sort((a, b) => {
      if (a.ausente !== b.ausente) return a.ausente ? 1 : -1;
      return (a.em ?? "").localeCompare(b.em ?? "");
    });
  }

  /* --------------------------------------------------------------- etapas */
  const etapas: EtapaEvidencia[] = [];
  const codigo: (ReferenciaCodigo & { execucaoId: string | null })[] = [];
  if (execucoes.length) {
    const { data: evids } = await db
      .from("nina_execucao_evidencias")
      .select("execucao_id, etapas, lacunas, created_at")
      .in(
        "execucao_id",
        execucoes.map((e) => e.id),
      )
      .eq("clinica_id", clinicaId);
    for (const linha of (evids ?? []) as Record<string, any>[]) {
      const execId = String(linha["execucao_id"]);
      const lista = ordenarEtapas((linha["etapas"] ?? []) as Etapa[]);
      for (const e of lista) {
        const etapa = etapaDoColetor(e, execId);
        etapas.push(etapa);
        if (etapa.codigo?.arquivo) codigo.push({ ...etapa.codigo, execucaoId: execId });
      }
    }
    etapas.sort((a, b) => (a.em ?? "").localeCompare(b.em ?? ""));
  }

  /* --------------------------------------------------------------- prompt */
  let prompt: PromptEvidencia | null = null;
  const execParaPrompt = execucoes.find((e) => e.principal)?.id ?? execucoes[0]?.id ?? null;
  if (execParaPrompt) {
    const { data: snap } = await db
      .from("nina_prompt_snapshots")
      .select(
        "execucao_id, prompt_versao, prompt_publicado_em, prompt_origem, behavior_prompt_hash, behavior_prompt_rendered, request_final, envelope_tecnico, runtime_context, tool_schemas, model, model_parameters",
      )
      .eq("clinica_id", clinicaId)
      .eq("execucao_id", execParaPrompt)
      .maybeSingle();
    if (snap) {
      const r = snap as Record<string, any>;
      const contexto = r["runtime_context"] ?? null;
      prompt = {
        execucaoId: execParaPrompt,
        origem: (r["prompt_origem"] as string | null) ?? null,
        versaoId: null,
        versao: (r["prompt_versao"] as number | null) ?? null,
        publicadoEm: (r["prompt_publicado_em"] as string | null) ?? null,
        hash: (r["behavior_prompt_hash"] as string | null) ?? null,
        promptUtilizado: cortar(
          (r["behavior_prompt_rendered"] as string | null) ?? null,
          "prompt_utilizado",
          cortes,
        ),
        conteudoEnviado: cortar(
          (r["request_final"] as string | null) ?? null,
          "conteudo_enviado",
          cortes,
        ),
        envelope: cortar((r["envelope_tecnico"] as string | null) ?? null, "envelope", cortes),
        contexto,
        modelo: (r["model"] as string | null) ?? null,
        parametros: r["model_parameters"] ?? null,
        ferramentasDeclaradas: r["tool_schemas"] ?? null,
        precedencia:
          (contexto as Record<string, unknown> | null)?.["contrato_precedencia"] ??
          (contexto as Record<string, unknown> | null)?.["precedencia"] ??
          null,
      };
    }
  }

  /* ------------------------------------- trace: ferramentas, confiança etc. */
  const ferramentas: FerramentaEvidencia[] = [];
  const confianca: ConfiancaEvidencia[] = [];
  const alteracoes: AlteracaoPosteriorEvidencia[] = [];
  let entrega: EntregaEvidencia | null = null;
  let turnoId: string | null = null;
  let ambiente: string | null = null;

  if (execucoes.length) {
    const { data: eventos } = await db
      .from("nina_trace_eventos")
      .select(
        "trace_id, execution_id, conversation_id, message_id, node_id, event_type, started_at, finished_at, status, metadata",
      )
      .eq("clinica_id", clinicaId)
      .in(
        "execution_id",
        execucoes.map((e) => e.id),
      )
      .order("started_at", { ascending: true })
      .limit(MAX_TRACE);

    for (const ev of (eventos ?? []) as Record<string, any>[]) {
      const md = (ev["metadata"] ?? {}) as Record<string, any>;
      const execId = (ev["execution_id"] as string | null) ?? null;
      if (md["turno_id"] && !turnoId) turnoId = String(md["turno_id"]);
      if (md["ambiente"] && !ambiente) ambiente = String(md["ambiente"]);

      for (const a of (md["avaliacoes"] ?? []) as Record<string, any>[]) {
        confianca.push({
          execucaoId: execId,
          escopo: (a["avaliacao"] as string | null) ?? null,
          nivel: (a["nivel"] as string | null) ?? null,
          nota: (a["score"] as number | null) ?? null,
          regrasAplicadas: Array.isArray(a["regras"]) ? a["regras"].map(String) : [],
          motivo: (a["decisao"] as string | null) ?? null,
        });
      }
      for (const t of (md["transformacoes"] ?? []) as Record<string, any>[]) {
        alteracoes.push({
          execucaoId: execId,
          etapa: String(t["etapa"] ?? "desconhecida"),
          motivo: (t["motivo"] as string | null) ?? null,
          alterou: (t["alterou"] as boolean | null) ?? null,
          em: (t["em"] as string | null) ?? null,
        });
      }
      if (md["entrega"] || String(ev["node_id"]).endsWith("delivery")) {
        const e = (md["entrega"] ?? md) as Record<string, any>;
        entrega = {
          execucaoId: execId,
          turnoId: (md["turno_id"] as string | null) ?? null,
          mensagemId:
            (e["mensagemId"] as string | null) ??
            (e["outgoing_message_id"] as string | null) ??
            (ev["message_id"] as string | null) ??
            null,
          texto: null,
          textoHash:
            (e["textoHash"] as string | null) ?? (e["texto_hash"] as string | null) ?? null,
          estado: (e["estado"] as string | null) ?? null,
          canal: (e["canal"] as string | null) ?? null,
          em: (ev["finished_at"] as string | null) ?? (ev["started_at"] as string | null) ?? null,
        };
      }
      if (String(ev["node_id"]).includes("tool") || md["ferramenta"]) {
        ferramentas.push({
          nome: String(md["ferramenta"] ?? ev["node_id"]),
          execucaoId: execId,
          solicitada: true,
          executada: ev["status"] === "ok",
          resultado: md["resultado"] ?? null,
          comprovacao: (md["comprovacao"] as string | null) ?? null,
          em: (ev["started_at"] as string | null) ?? null,
        });
      }
    }
  }

  // Ferramentas registradas na própria etapa (fonte primária do coletor).
  for (const e of etapas) {
    if (e.tipo !== "ferramenta") continue;
    ferramentas.push({
      nome: String(e.dados["nome"] ?? e.titulo),
      execucaoId: e.execucaoId,
      solicitada: true,
      executada: e.dados["executada"] !== false,
      resultado: e.dados["resultado"] ?? null,
      comprovacao: (e.dados["comprovacao"] as string | null) ?? null,
      em: e.em,
    });
  }

  /* ------------------------------------------- mensagem efetivamente entregue */
  const mensagemEntregueId = (fb.mensagem_id as string | null) ?? entrega?.mensagemId ?? null;
  if (mensagemEntregueId) {
    const { data: msg } = await db
      .from("whatsapp_mensagens")
      .select("id, body, created_at")
      .eq("id", mensagemEntregueId)
      .eq("clinica_id", clinicaId)
      .maybeSingle();
    if (msg) {
      entrega = {
        execucaoId: entrega?.execucaoId ?? execucaoPrincipalId,
        turnoId: entrega?.turnoId ?? turnoId,
        mensagemId: String((msg as Record<string, any>)["id"]),
        texto: cortar(
          ((msg as Record<string, any>)["body"] as string | null) ?? null,
          "mensagem_entregue",
          cortes,
        ),
        textoHash: entrega?.textoHash ?? null,
        estado: entrega?.estado ?? null,
        canal: entrega?.canal ?? null,
        em:
          ((msg as Record<string, any>)["created_at"] as string | null) ?? entrega?.em ?? null,
      };
    }
  }

  const semLacunas = {
    versaoContrato: VERSAO_CONTRATO_PACOTE,
    geradoEm: new Date().toISOString(),
    revisao: (entrada.revisaoAnterior ?? 0) + 1,
    origem: entrada.origem ?? ("reconstruido" as OrigemPacote),
    identificacao: {
      clinicaId,
      feedbackId: String(fb.id),
      analiseId: analise?.analiseId ?? null,
      conversaId,
      execucaoId: execucaoPrincipalId,
      turnoId,
      ambiente,
    },
    feedback: {
      mensagemReportada:
        cortar((fb.mensagem_texto as string | null) ?? "", "mensagem_reportada", cortes) ?? "",
      perguntaReportada: cortar(
        (fb.pergunta_texto as string | null) ?? null,
        "pergunta_reportada",
        cortes,
      ),
      mensagemId: (fb.mensagem_id as string | null) ?? null,
      categoria: (fb.categoria as string | null) ?? null,
      rootCause: (fb.root_cause as string | null) ?? null,
      status: (fb.status as string | null) ?? null,
      reportadoEm: (fb.created_at as string | null) ?? null,
    },
    analise,
    execucoes,
    entradas,
    prompt,
    etapas,
    ferramentas,
    confianca,
    alteracoes,
    entrega,
    codigo,
    arquivosAlvo: ARQUIVOS_ALVO,
    cortes,
  };

  return selarPacote({ ...semLacunas, lacunas: lacunasDoPacote(semLacunas) });
}
