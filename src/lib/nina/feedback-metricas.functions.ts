/**
 * Métricas e observabilidade do aprendizado da Nina — FASE 6.
 *
 * SOMENTE LEITURA. Nada aqui altera planilha, Base de Conhecimentos,
 * embeddings, prompt, modelo, regras, ferramentas ou feedbacks. O objetivo é
 * medir se a Nina está melhorando.
 *
 * Privacidade: os painéis não expõem texto do paciente. As agregações usam
 * apenas categoria, causa raiz, prioridade, situação, unidade, assunto
 * (grupo) e datas. A trilha de auditoria devolve apenas metadados e valores
 * de correção — nunca a conversa do paciente.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VALORES_CATEGORIA_FEEDBACK } from "@/lib/nina/feedback-erros";
import {
  baldeLocal,
  dentroDoRecorte,
  descricaoRecorte,
  resolverRecorte,
} from "@/lib/nina/metricas-filtros";

const STATUS = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "applied",
  "reverted",
] as const;

const CAUSAS = [
  "knowledge_error",
  "knowledge_missing",
  "retrieval_error",
  "reasoning_error",
  "tool_error",
  "hallucination",
  "workflow_error",
] as const;

const PRIORIDADES = ["critico", "alto", "normal"] as const;

const filtros = z.object({
  clinicaId: z.string().uuid(),
  granularidade: z.enum(["dia", "semana", "mes"]).default("dia"),
  // Recorte operacional (FASE 2): datas + faixa de horário no fuso da clínica.
  de: z.string().nullish(),
  ate: z.string().nullish(),
  diaInteiro: z.boolean().default(true),
  horaInicio: z.string().nullish(),
  horaFim: z.string().nullish(),
  fuso: z.string().nullish(),
  status: z.enum(STATUS).nullish(),
  categoria: z.enum(VALORES_CATEGORIA_FEEDBACK).nullish(),
  rootCause: z.enum(CAUSAS).nullish(),
  prioridade: z.enum(PRIORIDADES).nullish(),
  unidadeId: z.string().uuid().nullish(),
  assunto: z.string().trim().max(120).nullish(),
  // Produção é o padrão. "todos" inclui homologação/testes, sem misturar em silêncio.
  ambiente: z.enum(["producao", "todos"]).default("producao"),
});

/** Retorno da função de banco nina_metricas_operacionais (agregado no servidor). */
type Operacionais = {
  mensagensTotais: number;
  msgsPaciente: number;
  msgsNina: number;
  msgsHumano: number;
  msgsAutomaticas: number;
  ninaEntrada: number;
  ninaSaida: number;
  errosReportados: number;
  errosSemVinculo: number;
  agendamentosNina: number;
  encaminhamentos: number;
  entradaMedidaDesde: string | null;
  serie: { periodo: string; mensagens: number; erros: number }[];
};

type Linha = {
  id: string;
  status: string;
  categoria: string;
  root_cause: string | null;
  prioridade: string | null;
  unidade_id: string | null;
  grupo_titulo: string | null;
  grupo_chave: string | null;
  validacao_status: string | null;
  created_at: string;
};


function contar<T extends string>(valores: readonly T[], linhas: string[]) {
  const mapa = Object.fromEntries(valores.map((v) => [v, 0])) as Record<T, number>;
  for (const v of linhas) if (v in mapa) mapa[v as T] += 1;
  return mapa;
}

export const metricasAprendizadoNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => filtros.parse(i))
  .handler(async ({ data, context }) => {
    // Recorte comum (data + faixa de horário + fuso da clínica). Uma única
    // consulta cobre do primeiro ao último instante e o filtro por faixa de
    // horário é aplicado dia a dia, sem incluir tardes/noites intermediárias.
    const hoje = new Date().toISOString().slice(0, 10);
    const recorte = resolverRecorte({
      de: (data.de ?? hoje).slice(0, 10),
      ate: (data.ate ?? hoje).slice(0, 10),
      diaInteiro: data.diaInteiro,
      horaInicio: data.horaInicio ?? null,
      horaFim: data.horaFim ?? null,
      fuso: data.fuso ?? null,
    });

    let q = context.supabase
      .from("nina_feedback_erros")
      .select(
        "id, status, categoria, root_cause, prioridade, unidade_id, grupo_titulo, grupo_chave, validacao_status, created_at",
      )
      .eq("clinica_id", data.clinicaId)
      .gte("created_at", recorte.inicio)
      .lt("created_at", recorte.fim)
      .order("created_at", { ascending: true })
      .limit(5000);

    if (data.status) q = q.eq("status", data.status);
    if (data.categoria) q = q.eq("categoria", data.categoria);
    if (data.rootCause) q = q.eq("root_cause", data.rootCause);
    if (data.prioridade) q = q.eq("prioridade", data.prioridade);
    if (data.unidadeId) q = q.eq("unidade_id", data.unidadeId);
    if (data.assunto) q = q.ilike("grupo_titulo", `%${data.assunto}%`);

    const { data: linhas, error } = await q;
    if (error) throw new Error(error.message);
    const itens = ((linhas ?? []) as Linha[]).filter((l) =>
      dentroDoRecorte(l.created_at, recorte),
    );

    // Volume de respostas da Nina no mesmo recorte, para a taxa de erro.
    // Filtros específicos de erro NÃO reduzem este denominador.
    const qe = context.supabase
      .from("nina_execucoes")
      .select("created_at")
      .eq("clinica_id", data.clinicaId)
      .gte("created_at", recorte.inicio)
      .lt("created_at", recorte.fim)
      .order("created_at", { ascending: true })
      .limit(20000);
    const { data: execs, error: erroExec } = await qe;
    if (erroExec) throw new Error(erroExec.message);
    const execucoes = ((execs ?? []) as { created_at: string }[]).filter((e) =>
      dentroDoRecorte(e.created_at, recorte),
    );

    // FASE 3 — indicadores operacionais. A soma é feita no banco (função
    // nina_metricas_operacionais, somente leitura, RLS do usuário), sem trazer
    // o histórico de mensagens para o navegador nem para este processo.
    const { data: opBruto, error: erroOp } = await context.supabase.rpc(
      "nina_metricas_operacionais",
      {
        p_clinica: data.clinicaId,
        p_inicios: recorte.janelas.map((j) => j.inicio),
        p_fins: recorte.janelas.map((j) => j.fim),
        p_fuso: recorte.fuso,
        p_granularidade: data.granularidade,
        p_incluir_teste: data.ambiente === "todos",
        p_status: data.status ?? null,
        p_categoria: data.categoria ?? null,
        p_root_cause: data.rootCause ?? null,
        p_prioridade: data.prioridade ?? null,
        p_unidade: data.unidadeId ?? null,
        p_assunto: data.assunto ?? null,
      } as never,
    );
    if (erroOp) throw new Error(erroOp.message);
    const op = (opBruto ?? null) as Operacionais | null;
    const mensagensTotais = op?.mensagensTotais ?? 0;
    const errosSistema = op?.errosReportados ?? 0;
    const operacionais = {
      mensagensTotais,
      msgsPaciente: op?.msgsPaciente ?? 0,
      msgsNina: op?.msgsNina ?? 0,
      msgsHumano: op?.msgsHumano ?? 0,
      msgsAutomaticas: op?.msgsAutomaticas ?? 0,
      // Participação da Nina = recebidas processadas + respostas enviadas.
      ninaEntrada: op?.ninaEntrada ?? 0,
      ninaSaida: op?.ninaSaida ?? 0,
      ninaParticipacao: (op?.ninaEntrada ?? 0) + (op?.ninaSaida ?? 0),
      // Sem registro de vínculo, a quantidade de recebidas processadas não é
      // estimada: fica indisponível e a tela mostra a limitação.
      entradaMedidaDesde: op?.entradaMedidaDesde ?? null,
      errosReportados: errosSistema,
      errosSemVinculo: op?.errosSemVinculo ?? 0,
      agendamentosNina: op?.agendamentosNina ?? 0,
      encaminhamentos: op?.encaminhamentos ?? 0,
      taxaErroSistema: mensagensTotais ? (errosSistema / mensagensTotais) * 100 : null,
      ambiente: data.ambiente,
    };
    const serieOperacional = new Map(
      (op?.serie ?? []).map((p) => [p.periodo, p] as const),
    );

    const porStatus = contar(STATUS, itens.map((i) => i.status));
    const porCausa = contar(
      CAUSAS,
      itens.map((i) => i.root_cause ?? ""),
    );
    const porPrioridade = contar(
      PRIORIDADES,
      itens.map((i) => i.prioridade ?? ""),
    );

    const indicadores = {
      reportados: itens.length,
      confirmados: porStatus.approved + porStatus.applied + porStatus.reverted,
      rejeitados: porStatus.rejected,
      emRevisao: porStatus.under_review,
      pendentes: porStatus.pending,
      aplicados: porStatus.applied,
      revertidos: porStatus.reverted,
      validados: itens.filter((i) => i.validacao_status === "validado").length,
      falhasValidacao: itens.filter((i) => i.validacao_status === "falhou").length,
      execucoes: execucoes.length,
      taxaErro: execucoes.length ? (itens.length / execucoes.length) * 100 : null,
      porCausa,
      porPrioridade,
      porStatus,
    };

    // Série temporal: reportados, aplicados, revertidos e taxa de erro.
    // O agrupamento é independente do filtro de horário: "por dia" continua
    // considerando apenas a faixa selecionada em cada dia.
    const serie = new Map<
      string,
      { periodo: string; reportados: number; aplicados: number; revertidos: number; execucoes: number }
    >();
    const garantir = (chave: string) => {
      const atual = serie.get(chave);
      if (atual) return atual;
      const novo = { periodo: chave, reportados: 0, aplicados: 0, revertidos: 0, execucoes: 0 };
      serie.set(chave, novo);
      return novo;
    };
    for (const i of itens) {
      const b = garantir(baldeLocal(i.created_at, data.granularidade, recorte.fuso));
      b.reportados += 1;
      if (i.status === "applied") b.aplicados += 1;
      if (i.status === "reverted") b.revertidos += 1;
    }
    for (const e of execucoes)
      garantir(baldeLocal(e.created_at, data.granularidade, recorte.fuso)).execucoes += 1;


    for (const p of serieOperacional.values()) garantir(p.periodo);

    const evolucao = [...serie.values()]
      .sort((a, b) => a.periodo.localeCompare(b.periodo))
      .map((p) => {
        const o = serieOperacional.get(p.periodo);
        const mensagens = o?.mensagens ?? 0;
        const erros = o?.erros ?? 0;
        return {
          ...p,
          mensagens,
          errosSistema: erros,
          // Taxa oficial: erros pela data da mensagem original ÷ mensagens totais.
          taxaErro: mensagens ? (erros / mensagens) * 100 : null,
        };
      });

    // Problemas recorrentes: assunto + tipo de erro.
    const grupos = new Map<
      string,
      { assunto: string; categoria: string; rootCause: string | null; ocorrencias: number }
    >();
    for (const i of itens) {
      const assunto = i.grupo_titulo?.trim() || i.grupo_chave?.trim() || "Sem assunto identificado";
      const chave = `${assunto.toLowerCase()}|${i.categoria}`;
      const atual = grupos.get(chave);
      if (atual) {
        atual.ocorrencias += 1;
        if (!atual.rootCause) atual.rootCause = i.root_cause;
      } else {
        grupos.set(chave, {
          assunto,
          categoria: i.categoria,
          rootCause: i.root_cause,
          ocorrencias: 1,
        });
      }
    }
    const recorrentes = [...grupos.values()]
      .sort((a, b) => b.ocorrencias - a.ocorrencias)
      .slice(0, 20);

    const filtrosErroAtivos = Boolean(
      data.status || data.categoria || data.rootCause || data.prioridade,
    );

    return {
      indicadores,
      operacionais,
      evolucao,
      recorrentes,
      recorte: {
        inicio: recorte.inicio,
        fim: recorte.fim,
        fuso: recorte.fuso,
        dias: recorte.janelas.length,
        diaInteiro: recorte.diaInteiro,
        descricao: descricaoRecorte(recorte),
        filtrosErroAtivos,
      },
    };

  });

/**
 * Trilha completa de um feedback:
 * erro → feedback → revisão → diagnóstico → aprovação → alteração → teste → resultado.
 * Não devolve conversa nem dados pessoais do paciente.
 */
export const trilhaAuditoriaAprendizadoNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), feedbackId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: fb, error } = await context.supabase
      .from("nina_feedback_erros")
      .select(
        "id, clinica_id, conversa_id, categoria, status, root_cause, prioridade, knowledge_status, unidade_id, grupo_titulo, correcao, correcao_original, motivo_rejeicao, reportado_por, created_at, revisado_por, revisado_em, diagnosticado_por, diagnosticado_em, aplicacao_tipo, aplicacao_resumo, aplicado_por, aplicado_em, validacao_status, validacao_em, revertido_por, revertido_em, motivo_reversao",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!fb) throw new Error("Feedback não encontrado nesta clínica.");

    const { data: acoes, error: erroAcoes } = await context.supabase
      .from("nina_feedback_acoes")
      .select(
        "id, camada, tipo, titulo, status, homologado, criado_por, concluido_por, concluido_em, created_at",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("feedback_id", data.feedbackId)
      .order("created_at", { ascending: true });
    if (erroAcoes) throw new Error(erroAcoes.message);

    const { data: versoes, error: erroVersoes } = await context.supabase
      .from("nina_feedback_versoes")
      .select(
        "id, versao, item, valor_anterior, valor_novo, motivo, camada, tipo, root_cause, reportado_por, aprovado_por, aplicado_por, teste_status, teste_em, status, revertido_por, revertido_em, motivo_reversao, created_at",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("feedback_id", data.feedbackId)
      .order("versao", { ascending: true });
    if (erroVersoes) throw new Error(erroVersoes.message);

    return { feedback: fb, acoes: acoes ?? [], versoes: versoes ?? [] };
  });
