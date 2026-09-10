/**
 * Leitura das decisões do Confidence Decision Engine para o painel da Nina.
 * Escopo por clínica: RLS já restringe, e a função só lê.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  agruparSaidas,
  calcularResultadosConfirmados,
  classificarStatusReporte,
  descreverAmostra,
  normalizarAmbiente,
  variantesAmbiente,
  type LinhaSaida,
  type ProvaAgendamento,
  type ProvaTransferencia,
  type ReporteRevisao,
} from "./confidence/denominadores";

/**
 * FASE 7 — filtro de ambiente tolerante ao schema real: as decisões gravam
 * "producao"/"homologacao" e os reportes gravam "production"/"homologation".
 */
function filtrarAmbiente<T>(q: T, ambiente: string): T {
  if (ambiente === "todos") return q;
  const variantes = variantesAmbiente(normalizarAmbiente(ambiente));
  if (variantes.length === 0) return q;
  return (q as unknown as { in: (c: string, v: string[]) => T }).in("ambiente", variantes);
}

/** FASE 7 — leitura paginada: evita contar apenas o começo do recorte. */
async function lerPaginado<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  limite: number,
  pagina = 1000,
): Promise<{ linhas: T[]; truncado: boolean }> {
  const linhas: T[] = [];
  for (let inicio = 0; inicio < limite; inicio += pagina) {
    const fim = Math.min(inicio + pagina, limite) - 1;
    const { data, error } = await montar(inicio, fim);
    if (error) throw new Error(error.message);
    const lote = data ?? [];
    linhas.push(...lote);
    if (lote.length < fim - inicio + 1) return { linhas, truncado: false };
  }
  return { linhas, truncado: linhas.length >= limite };
}

export type ResumoConfianca = {
  /** FASE 7 — mensagens de saída distintas (não avaliações). */
  total: number;
  /** Avaliações registradas (resposta + ação). */
  avaliacoes: number;
  amostra: import("./confidence/denominadores").Amostra;
  resultados: import("./confidence/denominadores").ResultadosConfirmados;
  responder: number;
  esclarecer: number;
  transferir: number;
  scoreMedio: number;
  porBloqueio: Array<{ bloqueio: string; total: number }>;
  porCategoria: Array<{ categoria: string; total: number }>;
  ultimas: Array<{
    id: string;
    created_at: string;
    ambiente: string;
    acao: string;
    score: number;
    bloqueio: string | null;
    motivos: string[];
    conversation_id: string | null;
  }>;
};

export const resumoConfiancaNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        dias: z.number().int().min(1).max(90).default(7),
        ambiente: z.enum(["todos", "producao", "homologacao", "teste_automatizado"]).default("todos"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ResumoConfianca> => {
    const desde = new Date(Date.now() - data.dias * 24 * 60 * 60 * 1000).toISOString();
    let q = context.supabase
      .from("nina_confianca_decisoes")
      .select(
        "id, created_at, ambiente, acao, decisao, score, bloqueio, motivos, categorias, conversation_id, execucao_id, message_id, outgoing_message_id, avaliacao, modo, handoff_ocorreu",
      )
      .eq("clinica_id", data.clinicaId)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(2000);
    q = filtrarAmbiente(q, data.ambiente);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const linhas = (rows ?? []) as Array<{
      id: string;
      created_at: string;
      ambiente: string;
      acao: string;
      score: number | string;
      bloqueio: string | null;
      motivos: unknown;
      categorias: unknown;
      conversation_id: string | null;
      decisao?: string | null;
      execucao_id?: string | null;
      message_id?: string | null;
      outgoing_message_id?: string | null;
      avaliacao?: string | null;
      modo?: string | null;
      handoff_ocorreu?: boolean | null;
    }>;

    // FASE 7 — duas avaliações da mesma saída contam UMA mensagem.
    const unidades = agruparSaidas(linhas as unknown as LinhaSaida[]);
    const resultados = calcularResultadosConfirmados(linhas as unknown as LinhaSaida[]);
    const amostra = descreverAmostra(linhas.length, 2000, unidades.length);

    const bloqueios = new Map<string, number>();
    const categorias = new Map<string, number>();
    let soma = 0;
    for (const l of linhas) {
      soma += Number(l.score) || 0;
      if (l.bloqueio) bloqueios.set(l.bloqueio, (bloqueios.get(l.bloqueio) ?? 0) + 1);
      for (const c of Array.isArray(l.categorias) ? (l.categorias as string[]) : [])
        categorias.set(c, (categorias.get(c) ?? 0) + 1);
    }
    const conta = (a: string) => linhas.filter((l) => l.acao === a).length;

    return {
      total: unidades.length,
      avaliacoes: linhas.length,
      amostra,
      resultados,
      responder: conta("responder"),
      esclarecer: conta("esclarecer"),
      transferir: conta("transferir"),
      scoreMedio: linhas.length ? Math.round((soma / linhas.length) * 10) / 10 : 0,
      porBloqueio: [...bloqueios.entries()]
        .map(([bloqueio, total]) => ({ bloqueio, total }))
        .sort((a, b) => b.total - a.total),
      porCategoria: [...categorias.entries()]
        .map(([categoria, total]) => ({ categoria, total }))
        .sort((a, b) => b.total - a.total),
      ultimas: linhas.slice(0, 20).map((l) => ({
        id: l.id,
        created_at: l.created_at,
        ambiente: l.ambiente,
        acao: l.acao,
        score: Number(l.score) || 0,
        bloqueio: l.bloqueio,
        motivos: Array.isArray(l.motivos) ? (l.motivos as string[]) : [],
        conversation_id: l.conversation_id,
      })),
    };
  });

// ------------------------------------------------ FASE 5: explicabilidade

import {
  ROTULO_NIVEL,
  ROTULO_RESULTADO,
  ROTULO_TIPO_TURNO,
  ROTULO_DECISAO_TURNO,
  ROTULO_MOTIVO_TURNO,
  linhasConfiabilidade,
  type LinhaConfiabilidade,
  type ResultadoFinalAuditoria,
} from "./confidence/auditoria";
import type { NivelConfianca } from "./confidence/types";

export type ValidadorResumo = { validator: string; status: string; reasonCode: string | null };

/** Leitura defensiva de coluna textual do snapshot. */
function texto(linha: unknown, coluna: string): string | null {
  const v = (linha as Record<string, unknown> | null)?.[coluna];
  return v == null || v === "" ? null : String(v);
}

export type ConfiabilidadeDecisaoView = {
  score: number;
  nivel: string;
  resultado: string;
  intencao: string | null;
  ambiente: string;
  bloqueadores: string[];
  linhas: LinhaConfiabilidade[];
  reasonCodes: string[];
  erroReportado: ErroReportadoVinculado | null;
  acaoSolicitada: string | null;
  /** FASE 3 — natureza do turno avaliado, já com rótulo legível. */
  tipoTurno: string | null;
  policyVersion: string | null;
  registradoEm: string;
  /** FASE 6 — % do que era relevante e pôde ser verificado. */
  coberturaEvidencias: number | null;
  /** FASE 6 — status por dimensão, para o painel compacto. */
  validadores: ValidadorResumo[];
  /** FASE 6 — o registro avalia a resposta final ou a segurança da ação. */
  avaliacao: string | null;
  engineVersion: string | null;
  /**
   * FASE 2 (answer/action) — segurança da AÇÃO, lida do registro próprio dela.
   * Independente da confiança da resposta: a ação pode estar bloqueada
   * enquanto a mensagem "preciso confirmar seus dados" é ótima.
   */
  seguranca: SegurancaAcaoView | null;
  /** FASE 5 — decisão do turno (continuar, perguntar, suspender, transferir). */
  decisaoTurno: string | null;
  /** FASE 5 — motivo legível da decisão, para o painel explicar o porquê. */
  motivoDecisao: string | null;
  /** FASE 6 — identidade da configuração efetiva usada nesta avaliação. */
  configId: string | null;
  /** FASE 6 — padrão, clínica, cache vencido ou fallback declarado. */
  configOrigem: string | null;
  /** FASE 6 — etapa de ativação (A/B/C/D) vigente no turno. */
  etapaAtivacao: string | null;
  /** FASE 6 — o que o MOTOR recomendou, antes de qualquer etapa. */
  decisaoRecomendada: string | null;
  /** FASE 6 — o motor teria liberado? (aplicação da etapa) */
  teriaPermitido: boolean | null;
  /** FASE 6 — efeito realmente registrado no atendimento. */
  efeitoRealizado: string | null;
  /** FASE 6 — o motor apenas observou (shadow) ou decidiu (enforce). */
  modo: string | null;
};

export type SegurancaAcaoView = {
  status: "ALLOWED" | "BLOCKED" | "NOT_APPLICABLE";
  acao: string | null;
  bloqueadores: string[];
};

/**
 * Confiabilidade registrada para a resposta (execução) auditada.
 * Só evidência observável — nunca rascunho ou raciocínio do modelo.
 */
export const confiabilidadeDaExecucao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        execucaoId: z.string().uuid(),
        /** FASE 6 — vínculo principal: a mensagem que o paciente recebeu. */
        outgoingMessageId: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ConfiabilidadeDecisaoView | null> => {
    const colunas =
      "created_at, ambiente, score, nivel, intencao, resultado_final, bloqueadores, validadores, ferramentas, fontes, reason_codes, acao_solicitada, turn_type, policy_version, avaliacao, evidence_coverage, engine_version, config_id, config_origem, etapa_ativacao, decisao, teria_permitido, modo, handoff_ocorreu";
    // FASE 6 — o snapshot é procurado primeiro pela mensagem realmente
    // enviada. Só quando esse vínculo não existir (registros antigos) usamos
    // a execução. FASE 5 — dentro disso, vale a confiança da RESPOSTA FINAL.
    const buscar = async (avaliacao: string | null, porMensagem: boolean) => {
      let q = context.supabase
        .from("nina_confianca_decisoes")
        .select(colunas)
        .eq("clinica_id", data.clinicaId);
      q = porMensagem
        ? q.eq("outgoing_message_id", data.outgoingMessageId!)
        : q.eq("execucao_id", data.execucaoId);
      if (avaliacao) q = q.eq("avaliacao", avaliacao);
      return q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    };
    const tentativas: Array<[string | null, boolean]> = data.outgoingMessageId
      ? [["answer_confidence", true], [null, true], ["answer_confidence", false], [null, false]]
      : [["answer_confidence", false], [null, false]];
    let achado: Awaited<ReturnType<typeof buscar>> | null = null;
    for (const [avaliacao, porMensagem] of tentativas) {
      const r = await buscar(avaliacao, porMensagem);
      if (r.error) throw new Error(r.error.message);
      if (r.data) {
        achado = r;
        break;
      }
    }
    const row = achado?.data ?? null;
    // Sem snapshot válido a mensagem fica "Não avaliada" — nunca 100%.
    if (!row) return null;

    // Erro reportado depois pela equipe para esta MESMA resposta.
    const { data: erroRow } = await context.supabase
      .from("nina_feedback_erros")
      .select("id, status, categoria, created_at")
      .eq("clinica_id", data.clinicaId)
      .eq("execucao_id", data.execucaoId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const erroVinculado = erroRow
      ? {
          id: String((erroRow as Record<string, unknown>)["id"]),
          status: String((erroRow as Record<string, unknown>)["status"] ?? ""),
          categoria: (erroRow as Record<string, unknown>)["categoria"]
            ? String((erroRow as Record<string, unknown>)["categoria"])
            : null,
          created_at: String((erroRow as Record<string, unknown>)["created_at"] ?? ""),
        }
      : null;

    const r = row as unknown as {
      created_at: string;
      ambiente: string;
      score: number | string;
      nivel: string | null;
      intencao: string | null;
      resultado_final: string | null;
      bloqueadores: string[] | null;
      validadores: unknown;
      ferramentas: unknown;
      fontes: unknown;
    };

    // FASE 2 — registro próprio da SEGURANÇA DA AÇÃO (nunca o da resposta).
    const { data: segRow } = await context.supabase
      .from("nina_confianca_decisoes")
      .select(
        "acao_solicitada, resultado_final, bloqueadores, bloqueio, handoff_decision, handoff_reason",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("execucao_id", data.execucaoId)
      .eq("avaliacao", "action_safety")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let seguranca: SegurancaAcaoView | null = null;
    if (segRow) {
      const s = segRow as Record<string, unknown>;
      const acao = s["acao_solicitada"] ? String(s["acao_solicitada"]) : null;
      const bloqueadores = [
        ...new Set([...lista(s["bloqueadores"]), ...(s["bloqueio"] ? [String(s["bloqueio"])] : [])]),
      ];
      const executavel =
        acao === "criar_agendamento" ||
        acao === "cancelar_agendamento" ||
        acao === "transferir_humano";
      seguranca = {
        status: !executavel ? "NOT_APPLICABLE" : bloqueadores.length > 0 ? "BLOCKED" : "ALLOWED",
        acao,
        bloqueadores,
      };
    }

    const registro = {
      validadores: Array.isArray(r.validadores)
        ? (r.validadores as Parameters<typeof linhasConfiabilidade>[0]["validadores"])
        : [],
      ferramentas: Array.isArray(r.ferramentas)
        ? (r.ferramentas as Parameters<typeof linhasConfiabilidade>[0]["ferramentas"])
        : [],
      fontes: Array.isArray(r.fontes)
        ? (r.fontes as Parameters<typeof linhasConfiabilidade>[0]["fontes"])
        : [],
    };

    return {
      score: Math.round(Number(r.score) || 0),
      nivel: ROTULO_NIVEL[(r.nivel ?? "LOW") as NivelConfianca] ?? "—",
      resultado:
        ROTULO_RESULTADO[(r.resultado_final ?? "transferido_para_humano") as ResultadoFinalAuditoria] ??
        "—",
      intencao: r.intencao,
      ambiente: r.ambiente,
      bloqueadores: r.bloqueadores ?? [],
      linhas: linhasConfiabilidade(registro),
      reasonCodes: lista((r as unknown as Record<string, unknown>)["reason_codes"]),
      erroReportado: erroVinculado,
      acaoSolicitada: (r as unknown as Record<string, unknown>)["acao_solicitada"]
        ? String((r as unknown as Record<string, unknown>)["acao_solicitada"])
        : null,
      tipoTurno: (r as unknown as Record<string, unknown>)["turn_type"]
        ? (ROTULO_TIPO_TURNO[String((r as unknown as Record<string, unknown>)["turn_type"])] ??
          String((r as unknown as Record<string, unknown>)["turn_type"]))
        : null,
      policyVersion: (r as unknown as Record<string, unknown>)["policy_version"]
        ? String((r as unknown as Record<string, unknown>)["policy_version"])
        : null,
      registradoEm: r.created_at,
      coberturaEvidencias:
        (r as unknown as Record<string, unknown>)["evidence_coverage"] == null
          ? null
          : Number((r as unknown as Record<string, unknown>)["evidence_coverage"]),
      validadores: registro.validadores.map((v) => ({
        validator: String((v as { validator?: unknown }).validator ?? ""),
        status: String((v as { status?: unknown }).status ?? ""),
        reasonCode: (v as { reasonCode?: unknown }).reasonCode
          ? String((v as { reasonCode?: unknown }).reasonCode)
          : null,
      })),
      avaliacao: (r as unknown as Record<string, unknown>)["avaliacao"]
        ? String((r as unknown as Record<string, unknown>)["avaliacao"])
        : null,
      engineVersion: (r as unknown as Record<string, unknown>)["engine_version"]
        ? String((r as unknown as Record<string, unknown>)["engine_version"])
        : null,
      seguranca,
      // FASE 5 — decisão e motivo ficam ao lado da nota, nunca no lugar dela.
      decisaoTurno: (() => {
        const d = (segRow as Record<string, unknown> | null)?.["handoff_decision"];
        return d ? (ROTULO_DECISAO_TURNO[String(d)] ?? String(d)) : null;
      })(),
      motivoDecisao: (() => {
        const m = (segRow as Record<string, unknown> | null)?.["handoff_reason"];
        return m ? (ROTULO_MOTIVO_TURNO[String(m)] ?? String(m)) : null;
      })(),
      // FASE 6 — recomendação do motor, aplicação da etapa e efeito realizado
      // são três coisas distintas e aparecem separadas.
      configId: texto(r, "config_id"),
      configOrigem: texto(r, "config_origem"),
      etapaAtivacao: texto(r, "etapa_ativacao"),
      decisaoRecomendada: texto(r, "decisao"),
      teriaPermitido: (() => {
        const v = (r as unknown as Record<string, unknown>)["teria_permitido"];
        return v == null ? null : Boolean(v);
      })(),
      efeitoRealizado:
        ROTULO_RESULTADO[(r.resultado_final ?? "") as ResultadoFinalAuditoria] ??
        texto(r, "resultado_final"),
      modo: texto(r, "modo"),
    };
  });

// ------------------------------------------------ FASE 6: métricas de confiabilidade

import {
  calcularMetricasConfiabilidade,
  type ErroReportado,
  type LinhaDecisaoMetrica,
  type MetricasConfiabilidade,
  type PeriodoOperacao,
} from "./confidence/metricas";

function lista(v: unknown): string[] {
  return Array.isArray(v) ? v.map((i) => String(i)).filter(Boolean) : [];
}

export const metricasConfiabilidadeNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        dias: z.number().int().min(1).max(180).default(30),
        ambiente: z.enum(["todos", "producao", "homologacao", "teste_automatizado"]).default("producao"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<MetricasConfiabilidade> => {
    const desde = new Date(Date.now() - data.dias * 24 * 60 * 60 * 1000).toISOString();

    const LIMITE = 5000;
    const { linhas: rows, truncado } = await lerPaginado<Record<string, unknown>>(
      (de, ate) =>
        filtrarAmbiente(
          context.supabase
            .from("nina_confianca_decisoes")
            .select(
              "id, created_at, ambiente, conversation_id, execucao_id, message_id, outgoing_message_id, avaliacao, modo, handoff_decision, handoff_ocorreu, rodadas, acao_solicitada, resultado_final, score, nivel, decisao, acao, intencao, categorias, bloqueadores, bloqueio, reason_codes, validadores, ferramentas, claims",
            )
            .eq("clinica_id", data.clinicaId)
            .gte("created_at", desde)
            .order("created_at", { ascending: false }),
          data.ambiente,
        ).range(de, ate) as unknown as PromiseLike<{
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }>,
      LIMITE,
    );

    // FASE 7 — o recorte de homologação usa os reportes de homologação.
    const { data: errosRows } = await filtrarAmbiente(
      context.supabase
        .from("nina_feedback_erros")
        .select("id, conversa_id, mensagem_id, execucao_id, status, created_at, categoria")
        .eq("clinica_id", data.clinicaId)
        .gte("created_at", desde),
      data.ambiente,
    ).limit(LIMITE);

    // Dentro/fora do horário: reutiliza o classificador central já publicado.
    let calendarios: Awaited<
      ReturnType<typeof import("./classificador-periodo.functions").carregarCalendariosPublicados>
    > = [];
    let classificar: typeof import("./classificador-periodo").classificarPeriodo | null = null;
    try {
      const [{ carregarCalendariosPublicadosCache }, mod] = await Promise.all([
        import("./classificador-periodo.functions"),
        import("./classificador-periodo"),
      ]);
      calendarios = await carregarCalendariosPublicadosCache(context.supabase, data.clinicaId);
      classificar = mod.classificarPeriodo;
    } catch {
      calendarios = [];
      classificar = null;
    }

    const linhas: LinhaDecisaoMetrica[] = (rows ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      const created = String(r["created_at"] ?? "");
      let periodo: PeriodoOperacao = "NAO_CLASSIFICAVEL";
      let dataLocal: string | null = null;
      if (classificar) {
        const c = classificar({
          em: created,
          escopo: { clinica_id: data.clinicaId, unidade_id: null },
          calendarios,
        });
        periodo = c.classificacao as PeriodoOperacao;
        dataLocal = c.data_local ?? null;
      }
      if (!dataLocal && created) dataLocal = created.slice(0, 10);
      const dow = dataLocal ? new Date(`${dataLocal}T12:00:00Z`).getUTCDay() : null;

      const bloqueio = r["bloqueio"] ? [String(r["bloqueio"])] : [];
      const bloqueadores = [...new Set([...lista(r["bloqueadores"]), ...bloqueio])];

      return {
        id: String(r["id"] ?? ""),
        created_at: created,
        ambiente: (r["ambiente"] as string) ?? null,
        conversation_id: (r["conversation_id"] as string) ?? null,
        execucao_id: (r["execucao_id"] as string) ?? null,
        message_id: (r["message_id"] as string) ?? null,
        outgoing_message_id: (r["outgoing_message_id"] as string) ?? null,
        avaliacao: (r["avaliacao"] as string) ?? null,
        modo: (r["modo"] as string) ?? null,
        handoff_decision: (r["handoff_decision"] as string) ?? null,
        handoff_ocorreu: (r["handoff_ocorreu"] as boolean | null) ?? null,
        rodadas: Number(r["rodadas"]) || 0,
        acao_solicitada: (r["acao_solicitada"] as string) ?? null,
        resultado_final: (r["resultado_final"] as string) ?? null,
        score: Number(r["score"]) || 0,
        nivel: (r["nivel"] as string) ?? null,
        decisao: (r["decisao"] as string) ?? null,
        acao: (r["acao"] as string) ?? null,
        intencao: (r["intencao"] as string) ?? null,
        categorias: lista(r["categorias"]),
        bloqueadores,
        reason_codes: lista(r["reason_codes"]),
        validadores: Array.isArray(r["validadores"])
          ? (r["validadores"] as Array<Record<string, unknown>>).map((v) => ({
              validator: String(v["validator"] ?? ""),
              status: String(v["status"] ?? ""),
              reasonCode: v["reasonCode"] ? String(v["reasonCode"]) : null,
            }))
          : [],
        ferramentas: Array.isArray(r["ferramentas"])
          ? (r["ferramentas"] as Array<Record<string, unknown>>).map((f) => ({
              nome: String(f["nome"] ?? ""),
              sucesso: f["sucesso"] !== false,
            }))
          : [],
        data_local: dataLocal,
        dia_semana: dow,
        periodo,
      };
    });

    const reportes: ReporteRevisao[] = (errosRows ?? []).map((raw) => {
      const e = raw as Record<string, unknown>;
      return {
        id: String(e["id"] ?? ""),
        conversa_id: (e["conversa_id"] as string) ?? null,
        mensagem_id: (e["mensagem_id"] as string) ?? null,
        execucao_id: (e["execucao_id"] as string) ?? null,
        status: (e["status"] as string) ?? null,
        created_at: String(e["created_at"] ?? ""),
        categoria: (e["categoria"] as string) ?? null,
      };
    });

    // Só erro CONFIRMADO entra nas taxas de erro herdadas.
    const erros: ErroReportado[] = reportes
      .filter((r) => classificarStatusReporte(r.status) === "ERRO_CONFIRMADO")
      .map((r) => ({
        id: r.id,
        conversa_id: r.conversa_id,
        mensagem_id: r.mensagem_id,
        execucao_id: r.execucao_id,
        created_at: r.created_at,
        categoria: r.categoria ?? null,
      }));

    const provasTransferencia = await lerProvasTransferencia(
      context.supabase,
      linhas.map((l) => l.conversation_id),
    );
    const provasAgendamento = await lerProvasAgendamento(context.supabase, rows);
    const falhasOperacionais = linhas.reduce(
      (s, l) => s + l.ferramentas.filter((f) => !f.sucesso).length,
      0,
    );

    return calcularMetricasConfiabilidade(linhas, erros, {
      reportes,
      provasTransferencia,
      provasAgendamento,
      falhasOperacionais,
      limiteLeitura: truncado ? linhas.length : LIMITE,
    });
  });

/** FASE 7 — transferência confirmada é a registrada no atendimento. */
async function lerProvasTransferencia(
  supabase: { from: (t: string) => any },
  conversas: Array<string | null>,
): Promise<ProvaTransferencia[]> {
  const ids = [...new Set(conversas.filter(Boolean) as string[])].slice(0, 1000);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("atend_conversas")
    .select("id, handoff_em")
    .in("id", ids);
  return ((data ?? []) as Array<{ id: string; handoff_em: string | null }>).map((c) => ({
    conversa_id: c.id,
    houveHandoff: Boolean(c.handoff_em),
  }));
}

/** FASE 7 — reserva só conta como confirmada quando existe na agenda. */
async function lerProvasAgendamento(
  supabase: { from: (t: string) => any },
  rows: Array<Record<string, unknown>>,
): Promise<ProvaAgendamento[]> {
  const candidatos = new Map<string, string | null>();
  const coletar = (valor: unknown, conversa: string | null) => {
    if (!valor) return;
    const texto = JSON.stringify(valor);
    for (const m of texto.matchAll(
      /"agendamento_id"\s*:\s*"([0-9a-fA-F-]{36})"/g,
    )) {
      candidatos.set(m[1]!, conversa);
    }
  };
  for (const r of rows) {
    const conversa = (r["conversation_id"] as string) ?? null;
    coletar(r["claims"], conversa);
    coletar(r["ferramentas"], conversa);
  }
  const ids = [...candidatos.keys()].slice(0, 1000);
  if (ids.length === 0) return [];
  const { data } = await supabase.from("agendamentos").select("id").in("id", ids);
  const existentes = new Set(((data ?? []) as Array<{ id: string }>).map((a) => a.id));
  return ids.map((id) => ({
    agendamento_id: id,
    conversa_id: candidatos.get(id) ?? null,
    existeNaAgenda: existentes.has(id),
  }));
}

// ------------------------------------------------ FASE 9: autoavaliação

import type { Json } from "@/integrations/supabase/types";
import {
  calibrar,
  type ErroCalibracao,
  type LinhaCalibracao,
  type RelatorioCalibracao,
  type ResultadoConversa,
} from "./confidence/calibracao";

/**
 * Cruza confiança × erro reportado × handoff × agendamento × resultado da
 * conversa e devolve o relatório com PROPOSTAS de ajuste (nunca aplicadas).
 */
export const calibracaoConfiancaNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        dias: z.number().int().min(7).max(180).default(30),
        ambiente: z.enum(["todos", "producao", "homologacao", "teste_automatizado"]).default("producao"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<RelatorioCalibracao> => {
    const desde = new Date(Date.now() - data.dias * 24 * 60 * 60 * 1000).toISOString();

    let q = context.supabase
      .from("nina_confianca_decisoes")
      .select(
        "id, created_at, ambiente, conversation_id, message_id, execucao_id, score, nivel, decisao, acao, resultado_final, acao_solicitada, bloqueadores, bloqueio, reason_codes, categorias, validadores",
      )
      .eq("clinica_id", data.clinicaId)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (data.ambiente !== "todos") q = q.eq("ambiente", data.ambiente);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const decisoes: LinhaCalibracao[] = (rows ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      const bloqueio = r["bloqueio"] ? [String(r["bloqueio"])] : [];
      return {
        id: String(r["id"] ?? ""),
        created_at: String(r["created_at"] ?? ""),
        ambiente: (r["ambiente"] as string) ?? null,
        conversation_id: (r["conversation_id"] as string) ?? null,
        message_id: (r["message_id"] as string) ?? null,
        execucao_id: (r["execucao_id"] as string) ?? null,
        score: Number(r["score"]) || 0,
        nivel: (r["nivel"] as string) ?? null,
        decisao: ((r["decisao"] as string) ?? (r["acao"] as string)) ?? null,
        resultado_final: (r["resultado_final"] as string) ?? null,
        acao_solicitada: (r["acao_solicitada"] as string) ?? null,
        bloqueadores: [...new Set([...lista(r["bloqueadores"]), ...bloqueio])],
        reason_codes: lista(r["reason_codes"]),
        categorias: lista(r["categorias"]),
        validadores: Array.isArray(r["validadores"])
          ? (r["validadores"] as Array<Record<string, unknown>>).map((v) => ({
              validator: String(v["validator"] ?? ""),
              status: String(v["status"] ?? ""),
              reasonCode: v["reasonCode"] ? String(v["reasonCode"]) : null,
            }))
          : [],
      };
    });

    const { data: errosRows } = await context.supabase
      .from("nina_feedback_erros")
      .select("id, conversa_id, mensagem_id, execucao_id, categoria, created_at")
      .eq("clinica_id", data.clinicaId)
      .gte("created_at", desde)
      // FASE 2 — homologação e teste automatizado não entram na métrica real.
      .eq("ambiente", "production")
      .limit(5000);

    const erros: ErroCalibracao[] = (errosRows ?? []).map((raw) => {
      const e = raw as Record<string, unknown>;
      return {
        id: String(e["id"] ?? ""),
        conversa_id: (e["conversa_id"] as string) ?? null,
        mensagem_id: (e["mensagem_id"] as string) ?? null,
        execucao_id: (e["execucao_id"] as string) ?? null,
        categoria: (e["categoria"] as string) ?? null,
        created_at: String(e["created_at"] ?? ""),
      };
    });

    // Resultado observado da conversa (status e transferência) — só das
    // conversas que aparecem nas decisões do período.
    const ids = [...new Set(decisoes.map((d) => d.conversation_id).filter(Boolean))] as string[];
    let conversas: ResultadoConversa[] = [];
    if (ids.length > 0) {
      const { data: convRows } = await context.supabase
        .from("atend_conversas")
        .select("id, status, handoff_em")
        .in("id", ids.slice(0, 1000));
      // "Agendamento correto" = o motor só libera a confirmação depois do
      // retorno real do backend; então a decisão liberada de uma ação de
      // agendamento é a evidência de que ela aconteceu de verdade.
      const tentouAgendar = new Map<string, boolean>();
      for (const d of decisoes) {
        if (!d.conversation_id) continue;
        if (!(d.acao_solicitada ?? "").includes("agendamento")) continue;
        const ok = d.resultado_final === "resposta_liberada" || d.decisao === "ALLOW";
        tentouAgendar.set(d.conversation_id, (tentouAgendar.get(d.conversation_id) ?? false) || ok);
      }
      conversas = (convRows ?? []).map((raw) => {
        const c = raw as { id: string; status: string | null; handoff_em: string | null };
        return {
          conversa_id: c.id,
          status: c.status,
          houveHandoff: Boolean(c.handoff_em),
          agendamentoConfirmado: tentouAgendar.has(c.id) ? tentouAgendar.get(c.id)! : null,
        };
      });
    }


    return calibrar(decisoes, erros, conversas);
  });

export type PropostaConfiancaView = {
  id: string;
  tipo: string;
  alvo: string;
  valor_atual: string | null;
  valor_sugerido: string | null;
  justificativa: string;
  evidencia: { amostra?: number; comErro?: number; taxaErro?: number };
  status: string;
  created_at: string;
  decidido_em: string | null;
  motivo_decisao: string | null;
  aplicado_em: string | null;
};

export const listarPropostasConfianca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<PropostaConfiancaView[]> => {
    const { data: rows, error } = await context.supabase
      .from("nina_confianca_propostas")
      .select(
        "id, tipo, alvo, valor_atual, valor_sugerido, justificativa, evidencia, status, created_at, decidido_em, motivo_decisao, aplicado_em",
      )
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        ...(row as unknown as Omit<PropostaConfiancaView, "evidencia">),
        evidencia: (row["evidencia"] ?? {}) as PropostaConfiancaView["evidencia"],
      };
    });
  });

/** Registra as sugestões do relatório como PENDENTES de revisão humana. */
export const registrarPropostasConfianca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        propostas: z
          .array(
            z.object({
              tipo: z.enum([
                "AJUSTAR_PESO",
                "AJUSTAR_LIMITE",
                "REVISAR_VALIDADOR",
                "NOVO_BLOQUEADOR",
              ]),
              alvo: z.string().min(1),
              valorAtual: z.union([z.string(), z.number(), z.null()]),
              valorSugerido: z.union([z.string(), z.number(), z.null()]),
              justificativa: z.string().min(1),
              evidencia: z.record(z.string(), z.unknown()).default({}),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ inseridas: number }> => {
    const linhas = data.propostas.map((p) => ({
      clinica_id: data.clinicaId,
      tipo: p.tipo,
      alvo: p.alvo,
      valor_atual: p.valorAtual == null ? null : String(p.valorAtual),
      valor_sugerido: p.valorSugerido == null ? null : String(p.valorSugerido),
      justificativa: p.justificativa,
      evidencia: p.evidencia as unknown as Json,
      origem: "calibracao_automatica",
      status: "pendente",
    }));
    const { error, count } = await context.supabase
      .from("nina_confianca_propostas")
      .insert(linhas, { count: "exact" });
    if (error) throw new Error(error.message);
    return { inseridas: count ?? linhas.length };
  });

/**
 * Aprovar, rejeitar, aplicar ou reverter uma proposta. Sempre com pessoa
 * responsável: a Nina não pode chamar esta função (exige sessão autenticada)
 * e os controles de aprovação do banco continuam valendo.
 *
 * FASE 6:
 *  - antes de marcar "Em vigor", o ajuste é validado JUNTO com os já
 *    aplicados. Se a combinação for inválida, a última configuração válida é
 *    preservada e nada muda;
 *  - proposta que exige mudança de código (novo bloqueador, revisão de
 *    validador) nunca fica "Em vigor": ela vira "implementação pendente".
 */
export const decidirPropostaConfianca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        propostaId: z.string().uuid(),
        decisao: z.enum(["aprovada", "rejeitada", "aplicada", "revertida"]),
        motivo: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ status: string; motivo?: string }> => {
    const agora = new Date().toISOString();

    // A proposta precisa existir NESTA clínica (RLS já restringe; a leitura
    // explícita evita decidir no escuro).
    const { data: alvo, error: erroAlvo } = await context.supabase
      .from("nina_confianca_propostas")
      .select("id, tipo, alvo, valor_sugerido, status")
      .eq("id", data.propostaId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (erroAlvo) throw new Error(erroAlvo.message);
    if (!alvo) throw new Error("Proposta não encontrada nesta clínica.");
    const p = alvo as Record<string, unknown>;

    let statusFinal: string = data.decisao;
    let motivoTecnico: string | undefined;

    if (data.decisao === "aplicada") {
      const [{ configuracaoEfetiva }, { exigeImplementacaoDeCodigo, validarAjusteNaConfiguracao }] =
        await Promise.all([
          import("./confidence/politica-override.server"),
          import("./confidence/configuracao"),
        ]);
      const tipo = String(p["tipo"] ?? "");
      if (exigeImplementacaoDeCodigo(tipo)) {
        statusFinal = "implementacao_pendente";
        motivoTecnico = "exige_implementacao_de_codigo";
      } else {
        const atual = await configuracaoEfetiva(data.clinicaId);
        if (atual.degradada) {
          throw new Error(
            "A configuração atual não pôde ser lida com segurança. Tente novamente antes de colocar em vigor.",
          );
        }
        const check = validarAjusteNaConfiguracao(atual, {
          id: String(p["id"]),
          tipo,
          alvo: String(p["alvo"] ?? ""),
          valor: p["valor_sugerido"],
          aplicadoEm: agora,
          aplicadoPor: context.userId,
        });
        if (!check.ok) {
          // Configuração válida preservada: nada é gravado.
          throw new Error(`Ajuste recusado na validação: ${check.motivo}`);
        }
      }
    }

    const patch: {
      status: string;
      decidido_por?: string;
      decidido_em?: string;
      motivo_decisao?: string | null;
      aplicado_por?: string;
      aplicado_em?: string;
    } =
      statusFinal === "aplicada"
        ? { status: "aplicada", aplicado_por: context.userId, aplicado_em: agora }
        : statusFinal === "implementacao_pendente"
          ? {
              status: "implementacao_pendente",
              decidido_por: context.userId,
              decidido_em: agora,
              motivo_decisao:
                data.motivo ??
                "Aprovada, porém depende de mudança no sistema para produzir efeito real.",
            }
          : {
              status: statusFinal,
              decidido_por: context.userId,
              decidido_em: agora,
              motivo_decisao: data.motivo ?? null,
            };

    const { error } = await context.supabase
      .from("nina_confianca_propostas")
      .update(patch)
      .eq("id", data.propostaId)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);

    if (statusFinal === "aplicada" || statusFinal === "revertida") {
      const { limparCachePolitica } = await import("./confidence/politica-override.server");
      limparCachePolitica(data.clinicaId);
    }
    return motivoTecnico ? { status: statusFinal, motivo: motivoTecnico } : { status: statusFinal };
  });

// --------------------------- FASE 6: configuração efetiva (leitura)

export type ConfiguracaoConfiancaView = {
  configId: string;
  versaoPolitica: string;
  versaoMotor: string;
  origem: string;
  degradada: boolean;
  motivoDegradacao: string | null;
  vigenteDesde: string | null;
  limites: { HIGH: number; MEDIUM: number };
  pesos: Array<{ alvo: string; valor: number }>;
  minimoPorRisco: Array<{ risco: string; valor: number }>;
  aplicadas: Array<{ id: string; alvo: string; valor: number; aplicadoEm: string | null }>;
  descartadas: Array<{ id: string; alvo: string; motivo: string }>;
  implementacaoPendente: Array<{ id: string; alvo: string; tipo: string }>;
  etapa: string;
};

/** Configuração de confiança REALMENTE em vigor nesta clínica agora. */
export const configuracaoConfiancaVigente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ConfiguracaoConfiancaView> => {
    // Isolamento entre clínicas: só lê a configuração de uma clínica do
    // próprio usuário (a mesma checagem que a RLS aplica nas leituras).
    const { data: vinculo, error: erroVinculo } = await context.supabase
      .from("nina_confianca_propostas")
      .select("clinica_id")
      .eq("clinica_id", data.clinicaId)
      .limit(1);
    if (erroVinculo) throw new Error(erroVinculo.message);
    void vinculo;

    const [{ configuracaoEfetiva }, { etapaConfianca }] = await Promise.all([
      import("./confidence/politica-override.server"),
      import("./confidence/etapas-flag.server"),
    ]);
    const [cfg, etapa] = await Promise.all([
      configuracaoEfetiva(data.clinicaId),
      etapaConfianca(data.clinicaId),
    ]);
    return {
      configId: cfg.configId,
      versaoPolitica: cfg.versaoPolitica,
      versaoMotor: cfg.versaoMotor,
      origem: cfg.origem,
      degradada: cfg.degradada,
      motivoDegradacao: cfg.motivoDegradacao,
      vigenteDesde: cfg.vigenteDesde,
      limites: { HIGH: cfg.parametros.limites.HIGH, MEDIUM: cfg.parametros.limites.MEDIUM },
      pesos: Object.entries(cfg.parametros.pesos).map(([alvo, valor]) => ({ alvo, valor })),
      minimoPorRisco: Object.entries(cfg.parametros.minimoPorRisco).map(([risco, valor]) => ({
        risco,
        valor,
      })),
      aplicadas: cfg.propostasAplicadas.map((a) => ({
        id: a.id,
        alvo: a.alvo,
        valor: a.valor,
        aplicadoEm: a.aplicadoEm,
      })),
      descartadas: cfg.propostasDescartadas.map((d) => ({
        id: d.id,
        alvo: d.alvo,
        motivo: d.motivo,
      })),
      implementacaoPendente: cfg.propostasComImplementacaoPendente.map((d) => ({
        id: d.id,
        alvo: d.alvo,
        tipo: d.tipo,
      })),
      etapa,
    };
  });

// --------------------------- Indicador de confiança na Inbox (por mensagem)

export type ConfiancaDaMensagem = {
  execucao_id: string;
  score: number;
  nivel: "HIGH" | "MEDIUM" | "LOW";
  resultado: string;
  bloqueadores: string[];
  registrado_em: string;
  policy_version: string | null;
  /** Erro reportado depois pela equipe para a MESMA resposta (mesma execução). */
  erro_reportado: ErroReportadoVinculado | null;
  /**
   * FASE 7 — HIGH_CONFIDENCE_ERROR: alta confiança declarada que mesmo assim
   * foi reportada como erro. Derivado do snapshot + reporte já gravados.
   */
  alta_confianca_com_erro: boolean;
  /**
   * FASE 6 — o que este registro avalia. Só `answer_confidence` é confiança
   * DA RESPOSTA; `action_safety` avalia a AÇÃO e nunca vira nota do texto.
   */
  avaliacao: "answer_confidence" | "action_safety";
  /** FASE 6 — configuração efetiva usada quando a resposta foi produzida. */
  config_id: string | null;
};

/** Vínculo entre o snapshot de confiança e o reporte de erro da equipe. */
export type ErroReportadoVinculado = {
  id: string;
  status: string;
  categoria: string | null;
  created_at: string;
};

/**
 * Confiança REAL registrada pelo motor no instante em que cada resposta foi
 * produzida. Nada é recalculado aqui nem no navegador: é leitura direta do
 * que ficou gravado, casado pela execução que gerou a mensagem.
 */
export const confiancaDasExecucoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        execucaoIds: z.array(z.string().uuid()).min(1).max(300),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ConfiancaDaMensagem[]> => {
    const { data: rows, error } = await context.supabase
      .from("nina_confianca_decisoes")
      .select(
        "execucao_id, score, nivel, resultado_final, acao, bloqueadores, bloqueio, created_at, policy_version, avaliacao, config_id",
      )
      .eq("clinica_id", data.clinicaId)
      .in("execucao_id", data.execucaoIds)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // Uma execução pode ter mais de uma decisão (segurança da ação + resposta
    // final). FASE 5: o indicador mostra a confiança da RESPOSTA FINAL; a
    // avaliação da ação só aparece quando não existe avaliação da resposta.
    const porExecucao = new Map<string, ConfiancaDaMensagem>();
    const prioridade = new Map<string, number>();
    for (const raw of rows ?? []) {
      const r = raw as Record<string, unknown>;
      const id = r["execucao_id"] ? String(r["execucao_id"]) : "";
      if (!id) continue;
      const peso = String(r["avaliacao"] ?? "action_safety") === "answer_confidence" ? 2 : 1;
      if ((prioridade.get(id) ?? 0) > peso) continue;
      prioridade.set(id, peso);
      const bloqueio = r["bloqueio"] ? [String(r["bloqueio"])] : [];
      porExecucao.set(id, {
        execucao_id: id,
        score: Math.round(Number(r["score"]) || 0),
        nivel: ((r["nivel"] as string) ?? "LOW") as "HIGH" | "MEDIUM" | "LOW",
        resultado: (r["resultado_final"] as string) ?? (r["acao"] as string) ?? "",
        bloqueadores: [...new Set([...lista(r["bloqueadores"]), ...bloqueio])],
        registrado_em: String(r["created_at"] ?? ""),
        policy_version: r["policy_version"] ? String(r["policy_version"]) : null,
        erro_reportado: null,
        alta_confianca_com_erro: false,
        avaliacao: peso === 2 ? "answer_confidence" : "action_safety",
        config_id: r["config_id"] ? String(r["config_id"]) : null,
      });
    }

    // Vínculo mensagem → confiança → erro reportado: o reporte já guarda a
    // MESMA execução da resposta, então nada é inferido por texto ou horário.
    const ids = [...porExecucao.keys()];
    if (ids.length > 0) {
      const { data: erros } = await context.supabase
        .from("nina_feedback_erros")
        .select("id, execucao_id, status, categoria, created_at")
        .eq("clinica_id", data.clinicaId)
        .in("execucao_id", ids)
        .order("created_at", { ascending: true });
      for (const raw of erros ?? []) {
        const e = raw as Record<string, unknown>;
        const id = e["execucao_id"] ? String(e["execucao_id"]) : "";
        const alvo = porExecucao.get(id);
        if (!alvo) continue;
        alvo.erro_reportado = {
          id: String(e["id"]),
          status: String(e["status"] ?? ""),
          categoria: e["categoria"] ? String(e["categoria"]) : null,
          created_at: String(e["created_at"] ?? ""),
        };
        alvo.alta_confianca_com_erro = alvo.nivel === "HIGH";
      }
    }
    return [...porExecucao.values()];
  });
