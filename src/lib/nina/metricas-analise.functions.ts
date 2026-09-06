/**
 * FASE 7 — Consultas analíticas autorizadas da Nina.
 *
 * SOMENTE LEITURA. Estas funções não enviam mensagens, não alteram agenda,
 * não transferem conversas e não tocam na base de conhecimento. Elas apenas
 * devolvem agregados já usados pelos cards do painel, com rastreabilidade.
 *
 * Privacidade: nenhuma resposta contém nome, telefone, documento ou conteúdo
 * de mensagem de paciente.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VALORES_CATEGORIA_FEEDBACK } from "@/lib/nina/feedback-erros";
import { resolverRecorte, descricaoRecorte } from "@/lib/nina/metricas-filtros";
import {
  DEFINICOES_INDICADORES,
  VERSAO_REGRAS_ANALISE,
  compararIndicadores,
  compararTaxas,
  consolidarTaxaErro,
  mediaPorDia,
  mediaPorHora,
  resumirCobertura,
  type FaixaHoraria,
} from "@/lib/nina/metricas-analise";

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

const recorteSchema = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  diaInteiro: z.boolean().default(true),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  horaFim: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  /** 0 = domingo. Vazio ou ausente = todos os dias. */
  diasSemana: z.array(z.number().int().min(0).max(6)).max(7).nullish(),
  rotulo: z.string().trim().max(60).nullish(),
});

const entrada = z.object({
  clinicaId: z.string().uuid(),
  fuso: z.string().trim().max(60).nullish(),
  granularidade: z.enum(["dia", "semana", "mes"]).default("dia"),
  ambiente: z.enum(["producao", "todos"]).default("producao"),
  calendario: z.enum(["todos", "dentro", "fora"]).default("todos"),
  unidadeId: z.string().uuid().nullish(),
  status: z.enum(STATUS).nullish(),
  categoria: z.enum(VALORES_CATEGORIA_FEEDBACK).nullish(),
  rootCause: z.enum(CAUSAS).nullish(),
  prioridade: z.enum(PRIORIDADES).nullish(),
  assunto: z.string().trim().max(120).nullish(),
  /** Um ou dois recortes. Com dois, a resposta traz a comparação. */
  periodos: z.array(recorteSchema).min(1).max(2),
});

type Entrada = z.infer<typeof entrada>;

async function consultarPeriodo(
  context: any,
  data: Entrada,
  periodo: Entrada["periodos"][number],
  agora: Date,
) {
  const recorte = resolverRecorte({
    de: periodo.de,
    ate: periodo.ate,
    diaInteiro: periodo.diaInteiro,
    horaInicio: periodo.horaInicio ?? null,
    horaFim: periodo.horaFim ?? null,
    fuso: data.fuso ?? null,
  });
  const diasSemana =
    periodo.diasSemana && periodo.diasSemana.length > 0 ? [...periodo.diasSemana].sort() : null;

  const { data: bruto, error } = await context.supabase.rpc("nina_metricas_analise", {
    p_clinica: data.clinicaId,
    p_inicios: recorte.janelas.map((j) => j.inicio),
    p_fins: recorte.janelas.map((j) => j.fim),
    p_fuso: recorte.fuso,
    p_granularidade: data.granularidade,
    p_incluir_teste: data.ambiente === "todos",
    p_dias_semana: diasSemana,
    p_calendario: data.calendario,
    p_status: data.status ?? null,
    p_categoria: data.categoria ?? null,
    p_root_cause: data.rootCause ?? null,
    p_prioridade: data.prioridade ?? null,
    p_unidade: data.unidadeId ?? null,
    p_assunto: data.assunto ?? null,
  } as never);
  if (error) throw new Error(error.message);

  const resultado = (bruto ?? {}) as any;
  const cobertura = resumirCobertura(recorte, diasSemana, agora);
  const indicadores = resultado.indicadores ?? {};

  return {
    rotulo: periodo.rotulo ?? descricaoRecorte(recorte),
    consultaId: resultado.consultaId ?? null,
    geradoEm: resultado.geradoEm ?? null,
    indicadores,
    taxaErro: resultado.taxaErro ?? null,
    calendario: resultado.calendario ?? null,
    serie: resultado.serie ?? [],
    cobertura: {
      ...cobertura,
      entradaMedidaDesde: resultado.cobertura?.entradaMedidaDesde ?? null,
      limitacoes: resultado.cobertura?.limitacoes ?? [],
    },
    medias: {
      mensagensPorDia: mediaPorDia(indicadores.mensagensTotais ?? 0, cobertura.dias),
      mensagensPorHora: mediaPorHora(indicadores.mensagensTotais ?? 0, cobertura.horas),
      errosPorDia: mediaPorDia(indicadores.errosReportados ?? 0, cobertura.dias),
      encaminhamentosPorDia: mediaPorDia(indicadores.encaminhamentos ?? 0, cobertura.dias),
      agendamentosPorDia: mediaPorDia(indicadores.agendamentosNina ?? 0, cobertura.dias),
    },
    filtros: {
      ...(resultado.filtros ?? {}),
      de: periodo.de,
      ate: periodo.ate,
      diaInteiro: periodo.diaInteiro,
      horaInicio: periodo.horaInicio ?? null,
      horaFim: periodo.horaFim ?? null,
      diasSemana,
      descricao: descricaoRecorte(recorte),
    },
  };
}

/**
 * Núcleo da consulta analítica (um ou dois períodos). Usado tanto pela função
 * pública abaixo quanto pela ferramenta autorizada do analista, para que os
 * dois caminhos usem exatamente a mesma fonte de verdade.
 *
 * Todas as comparações são calculadas AQUI, de forma determinística: o modelo
 * nunca precisa fazer aritmética.
 */
export async function executarConsultaMetricas(context: any, data: Entrada) {
  const agora = new Date();
  const periodos = [];
  for (const p of data.periodos) {
    periodos.push(await consultarPeriodo(context, data, p, agora));
  }

  // Consolidação: soma numeradores e denominadores antes de dividir.
  const consolidado = consolidarTaxaErro(
    periodos.map((p) => ({
      numerador: p.taxaErro?.numerador ?? 0,
      denominador: p.taxaErro?.denominador ?? 0,
    })),
  );

  return {
    versaoRegras: VERSAO_REGRAS_ANALISE,
    geradoEm: agora.toISOString(),
    definicoes: DEFINICOES_INDICADORES,
    periodos,
    consolidado,
    comparacao:
      periodos.length === 2
        ? {
            // Duração diferente é normal: os totais vêm acompanhados das
            // médias por dia e por hora efetivamente incluídos.
            a: periodos[0].rotulo,
            b: periodos[1].rotulo,
            diasA: periodos[0].cobertura.dias,
            diasB: periodos[1].cobertura.dias,
            horasA: periodos[0].cobertura.horas,
            horasB: periodos[1].cobertura.horas,
            duracoesIguais:
              periodos[0].cobertura.dias === periodos[1].cobertura.dias &&
              periodos[0].cobertura.horas === periodos[1].cobertura.horas,
            indicadores: compararIndicadores(
              periodos[0].indicadores ?? {},
              periodos[1].indicadores ?? {},
            ),
            taxaErro: compararTaxas(periodos[0].taxaErro, periodos[1].taxaErro),
          }
        : null,
  };
}

/**
 * Consulta analítica: um período, ou dois quando a pergunta é comparativa.
 * Reaproveita exatamente a mesma fonte de verdade dos cards do painel.
 */
export const consultarMetricasNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => entrada.parse(i))
  .handler(async ({ data, context }) => executarConsultaMetricas(context, data));


/**
 * Configuração de calendário e faixas usada pela análise. Sem configuração,
 * o analista deve dizer que o recorte não é classificável e pedir o
 * intervalo — nunca presumir horários.
 */
export const configuracaoAnaliseNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const [cal, exc, faixas] = await Promise.all([
      context.supabase
        .from("nina_calendario_atendimento")
        .select("id, unidade_id, dia_semana, hora_inicio, hora_fim, vigencia_inicio, vigencia_fim, ativo, updated_at")
        .eq("clinica_id", data.clinicaId)
        .order("dia_semana", { ascending: true })
        .limit(500),
      context.supabase
        .from("nina_calendario_excecoes")
        .select("id, unidade_id, data, tipo, hora_inicio, hora_fim, descricao")
        .eq("clinica_id", data.clinicaId)
        .order("data", { ascending: false })
        .limit(500),
      context.supabase
        .from("nina_faixas_horarias")
        .select("chave, nome, hora_inicio, hora_fim, ordem")
        .eq("clinica_id", data.clinicaId)
        .order("ordem", { ascending: true })
        .limit(50),
    ]);
    if (cal.error) throw new Error(cal.error.message);
    if (exc.error) throw new Error(exc.error.message);
    if (faixas.error) throw new Error(faixas.error.message);

    const listaFaixas: FaixaHoraria[] = ((faixas.data ?? []) as any[]).map((f) => ({
      chave: f.chave,
      nome: f.nome,
      horaInicio: String(f.hora_inicio).slice(0, 5),
      horaFim: String(f.hora_fim).slice(0, 5),
    }));

    return {
      calendario: cal.data ?? [],
      excecoes: exc.data ?? [],
      faixas: listaFaixas,
      calendarioConfigurado: (cal.data ?? []).length > 0,
      faixasConfiguradas: listaFaixas.length > 0,
      versaoRegras: VERSAO_REGRAS_ANALISE,
    };
  });
