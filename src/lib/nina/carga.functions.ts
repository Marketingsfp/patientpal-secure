/**
 * FASE 6 — Backend do teste de carga da homologação da Nina.
 *
 * Regras deste módulo:
 * - só roda na homologação: todas as mensagens passam pelos 10 leads de teste
 *   e pelo mesmo núcleo `processarMensagemTeste` (nada vai para a Meta);
 * - o controle de concorrência, ritmo, fila, tentativas, tempo limite e
 *   cancelamento é código determinístico daqui — o modelo GPT Luna apenas
 *   escreve variações de texto de paciente;
 * - limites máximos e confirmação explícita evitam disparo acidental.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  metricasParalelas,
  limiteParalelo,
  EXECUTOR_CARGA_SERVIDOR,
  cargaServidor,
} from "./carga-paralela";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  calcularMetricas,
  extrairVariacoes,
  INSTRUCOES_LUNA,
  LIMITE_ABSOLUTO,
  MODELO_LUNA,
  normalizarConfig,
  planoDeMensagens,
  validarDisparo,
  variacoesFallback,
  type ConfigCarga,
} from "@/lib/nina/carga";
import { garantirPapel, PROVEDOR_IA } from "@/lib/nina/papeis-modelos";
import { validarPlanoCarga } from "./carga-planejamento";
import { estadoControleCarga, VERSAO_EXECUTOR_CARGA } from "./carga-controle";
import { lerAmostrasCarga, totaisAmostrasCarga } from "./carga-itens.server";
import {
  carregarCargaControlada as carregarCarga,
  recuperarCargaSemAtividade,
  retornoCarga,
  comLockCriacaoCarga,
  cargasQueReservamExecutor,
} from "./carga-controle.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

type Ctx = { supabase: any; userId: string };

async function assertMembership(supabase: any, userId: string, clinicaId: string) {
  const { data, error } = await supabase
    .from("clinica_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
}

const configSchema = z.object({
  modoEnvio: z.enum(["simultaneo", "cadenciado"]).default("simultaneo"),
  perfil: z.enum(["leve", "medio", "alto", "customizado"]).default("leve"),
  leadsAtivos: z.number().int().min(1).max(LIMITE_ABSOLUTO.leadsAtivos).default(5),
  totalMensagens: z.number().int().min(1).max(LIMITE_ABSOLUTO.totalMensagens).default(20),
  conversasSimultaneas: z
    .number()
    .int()
    .min(1)
    .max(LIMITE_ABSOLUTO.conversasSimultaneas)
    .default(5),
  mensagensPorMinuto: z.number().int().min(1).max(LIMITE_ABSOLUTO.mensagensPorMinuto).default(30),
  duracaoMaxS: z.number().int().min(30).max(LIMITE_ABSOLUTO.duracaoMaxS).default(300),
  intervaloMs: z.number().int().min(0).max(60_000).default(1000),
  timeoutS: z.number().int().min(10).max(LIMITE_ABSOLUTO.timeoutS).default(60),
  retriesMax: z.number().int().min(0).max(LIMITE_ABSOLUTO.retriesMax).default(1),
  maxTokens: z.number().int().min(1000).max(LIMITE_ABSOLUTO.maxTokens).default(200_000),
  maxCustoCreditos: z.number().min(0).max(LIMITE_ABSOLUTO.maxCustoCreditos).default(0),
  creditosPorMilTokens: z.number().min(0).max(LIMITE_ABSOLUTO.creditosPorMilTokens).default(0),
  distribuicao: z
    .array(
      z.object({ cenario: z.string().trim().min(1).max(300), peso: z.number().min(0.1).max(10) }),
    )
    .max(10)
    .default([]),
});

/** Luna escreve variações de linguagem para um cenário. Nunca controla o teste. */
async function gerarVariacoesLuna(cenario: string, quantidade: number): Promise<string[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return variacoesFallback(cenario);
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: garantirPapel("carga", MODELO_LUNA),
        instructions: INSTRUCOES_LUNA,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Gere ${quantidade} variações da seguinte intenção de paciente: "${cenario}"`,
              },
            ],
          },
        ],
        stream: false,
        store: false,
        max_output_tokens: 800,
      }),
    });
    if (!res.ok) return variacoesFallback(cenario);
    const json: any = await res.json();
    const texto: string =
      json.output_text ??
      (json.output ?? [])
        .flatMap((o: any) => o.content ?? [])
        .map((c: any) => c.text ?? "")
        .join("\n");
    const lista = extrairVariacoes(texto, quantidade);
    return lista.length ? lista : variacoesFallback(cenario);
  } catch {
    return variacoesFallback(cenario);
  }
}

/** Cria a fila revisada; planejamento de IA não é autorização de execução. */
export const criarTesteCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        nome: z.string().trim().min(3).max(120).default("Teste de carga"),
        config: configSchema,
        confirmado: z.boolean().default(false),
        usarLuna: z.boolean().default(true),
        planoIA: z.unknown().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const planoIA = data.planoIA === undefined ? null : validarPlanoCarga(data.planoIA);
    const config: ConfigCarga = planoIA ? planoIA.config : normalizarConfig(data.config);
    if (
      planoIA &&
      Object.keys(config).some(
        (chave) =>
          JSON.stringify(data.planoIA.config?.[chave]) !==
          JSON.stringify(config[chave as keyof ConfigCarga]),
      )
    )
      throw new Error(
        "O plano foi ajustado pela validação. Revise e confirme a prévia antes de executar.",
      );
    const check = validarDisparo(config, data.confirmado);
    if (!check.ok) throw new Error(check.motivo);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { confirmarServidorCargaDisponivel } = await import("./carga-servidor.server");
    await confirmarServidorCargaDisponivel(supabaseAdmin);
    const { garantirLeads } = await import("@/lib/nina/teste-console.server");
    const mensagemAtivo =
      "Já existe um teste ativo ou uma mensagem ainda em processamento nesta clínica. Abra o teste para acompanhar ou retomar.";
    if ((await cargasQueReservamExecutor(supabaseAdmin, data.clinicaId)).length)
      throw new Error(mensagemAtivo);
    // A IA termina ANTES da trava: o trecho crítico abaixo contém apenas banco.
    const plano = planoDeMensagens(config);
    const variacoes: Record<string, string[]> = {};
    const mensagensLuna = planoIA
      ? await (await import("./carga-redacao-luna.server")).gerarMensagensPlanoLuna(planoIA)
      : null;
    if (!planoIA)
      for (const cenario of new Set(plano.map((p) => p.cenario)))
        variacoes[cenario] = data.usarLuna
          ? await gerarVariacoesLuna(cenario, 8)
          : variacoesFallback(cenario);
    return await comLockCriacaoCarga(supabaseAdmin, data.clinicaId, async () => {
      const ativos = await cargasQueReservamExecutor(supabaseAdmin, data.clinicaId);
      if (ativos.length) throw new Error(mensagemAtivo);
      const leads = await garantirLeads(supabaseAdmin, data.clinicaId);
      if (leads.length !== 10 || new Set(leads.map((l: any) => l.id)).size !== 10)
        throw new Error(
          "Os 10 leads de homologação precisam estar disponíveis antes de iniciar o teste.",
        );
      const fila = mensagensLuna
        ? mensagensLuna.map((p) => ({ ...p, mensagem: p.texto }))
        : plano.map((p, i) => {
            const opcoes = variacoes[p.cenario] ?? variacoesFallback(p.cenario);
            return { ...p, mensagem: opcoes[i % opcoes.length]! };
          });
      const planoFinal = fila.map((p, indice) => {
        const lead = leads[p.slot % config.leadsAtivos]!;
        return { ...p, indice, leadId: lead.id, leadIndice: lead.indice };
      });
      const { data: linha, error } = await supabaseAdmin
        .from("nina_teste_carga")
        .insert({
          clinica_id: data.clinicaId,
          nome: data.nome,
          perfil: config.perfil,
          status: "preparando",
          config: {
            ...config,
            executor: EXECUTOR_CARGA_SERVIDOR,
            concorrenciaEfetiva: config.conversasSimultaneas,
            ...(planoIA ? { planoIA } : {}),
            _inicioCarga: {
              versao: 1,
              resetTodosLeads: true,
              leads: leads.map((l: any) => ({
                id: l.id,
                indice: l.indice,
                sessao_seq: l.sessao_seq,
                conversa_id: l.conversa_id,
                ciclo_id: l.ciclo_id,
              })),
            },
          },
          variacoes,
          plano: planoFinal,
          preflight: [],
          confirmado: data.confirmado,
          total_planejado: planoFinal.length,
          modelo_gerador: planoIA || data.usarLuna ? garantirPapel("carga", MODELO_LUNA) : null,
          provedor_gerador: planoIA || data.usarLuna ? PROVEDOR_IA : null,
          criado_por: context.userId,
        })
        .select("id, status, total_planejado")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!linha)
        throw new Error("O teste não foi criado. Atualize a lista antes de tentar novamente.");
      return { carga: linha, config, participantes: new Set(planoFinal.map((p) => p.leadId)).size };
    });
  });

/**
 * FASE 3 — prepara os leads participantes em lotes pequenos, para a tela
 * mostrar o progresso (0/10 … 10/10). É idempotente: leads já com baseline
 * READY não são resetados de novo. O início confirmado prepara os 10 leads.
 * Só quando TODOS ficam prontos o run passa
 * para `executando` — que é o único status em que o disparo é liberado.
 */
export const prepararLeadsTesteCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), cargaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const carga = await carregarCarga(supabaseAdmin, data.clinicaId, data.cargaId);
    if (cargaServidor(carga.config)) return retornoCarga(carga);
    const { prepararCargaControlada } = await import("./carga-preparacao.server");
    return prepararCargaControlada({
      admin: supabaseAdmin,
      clinicaId: data.clinicaId,
      cargaId: data.cargaId,
      userId: context.userId,
    });
  });

/** Reserva um lote no banco; duas abas não processam o mesmo índice. */
export const executarLoteCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), cargaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const carga = await carregarCarga(supabaseAdmin, data.clinicaId, data.cargaId);
    if (cargaServidor(carga.config)) return retornoCarga(carga);
    const { processarMensagemTeste } = await import("@/lib/nina/teste-console.server");
    const { executarCargaControlada } = await import("./carga-execucao.server");
    return await executarCargaControlada({
      admin: supabaseAdmin,
      clinicaId: data.clinicaId,
      cargaId: data.cargaId,
      userId: context.userId,
      processar: processarMensagemTeste,
    });
  });

/** Estado leve para conduzir o envio sem consultar o relatório completo. */
export const estadoTesteCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), cargaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const carga = await carregarCarga(supabaseAdmin, data.clinicaId, data.cargaId);
    return {
      id: carga.id,
      nome: carga.nome,
      status: carga.status,
      enviadas: carga.enviadas,
      total_planejado: carga.total_planejado,
      controle: estadoControleCarga(carga),
    };
  });

/** Parar impede novas mensagens; as chamadas já iniciadas conservam suas reservas. */
export const pararTesteCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), cargaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("nina_teste_carga")
      .update({ cancelar: true, status: "parado", finalizado_em: new Date().toISOString() })
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.cargaId)
      .in("status", ["preparando", "executando"]);
    if (error) throw new Error(error.message);
    const carga = await carregarCarga(supabaseAdmin, data.clinicaId, data.cargaId);
    return { ok: true, ...retornoCarga(carga) };
  });

export const listarTestesCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Não limita a recuperação aos 20 mais recentes: um órfão antigo também bloqueava criação.
    await cargasQueReservamExecutor(supabaseAdmin, data.clinicaId);
    const { data: linhas, error } = await supabaseAdmin
      .from("nina_teste_carga")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return {
      versaoExecutor: EXECUTOR_CARGA_SERVIDOR,
      testes: (linhas ?? []).map((c: any) => ({
        ...c,
        plano: undefined,
        variacoes: undefined,
        controle: estadoControleCarga(c),
      })),
    };
  });

/** Detalhe com métricas medidas (p50/p95/p99 só com volume suficiente). */
export const detalheTesteCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), cargaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const carga = await recuperarCargaSemAtividade(
      supabaseAdmin,
      await carregarCarga(supabaseAdmin, data.clinicaId, data.cargaId),
    );
    const { data: amostras, error: erroAmostras } = await supabaseAdmin
      .from("nina_teste_carga_amostras")
      .select(
        "indice, lead_indice, cenario, mensagem, status, tentativa, latencia_ms, ferramentas, input_tokens, output_tokens, erro, created_at",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("carga_id", data.cargaId)
      .order("indice");

    if (erroAmostras) throw new Error(erroAmostras.message);
    const lista = (amostras ?? []) as any[];
    // Reconstrói os totais mesmo se a última requisição caiu após salvar um item.
    const totais = totaisAmostrasCarga(await lerAmostrasCarga(supabaseAdmin, carga));
    const { metricasWatchdogCarga } = await import("./watchdog-metricas.server");
    const processamento = await metricasWatchdogCarga(supabaseAdmin, carga);
    const fim = carga.finalizado_em ? new Date(carga.finalizado_em).getTime() : Date.now();
    const duracaoMs = Math.max(
      0,
      fim - new Date(carga.iniciado_em ?? carga.created_at ?? carga.updated_at).getTime(),
    );
    const metricas = calcularMetricas(
      lista.filter((a) => a.status === "ok").map((a) => a.latencia_ms ?? 0),
      duracaoMs,
    );

    const conversas = new Set(lista.map((a) => a.lead_indice)).size;
    // FASE 4 — métricas técnicas do preflight (não entram nas métricas de carga).
    const { metricasPreflight } = await import("@/lib/nina/carga-preflight");
    const planoDetalhe = (carga.plano ?? []) as any[];
    const inicio = (carga.config as any)?._inicioCarga;
    const totalParticipantes =
      inicio?.resetTodosLeads && Array.isArray(inicio.leads)
        ? inicio.leads.length
        : new Set(planoDetalhe.map((p: any) => p.leadId)).size;
    const preflight = metricasPreflight(
      (carga.preflight ?? []) as any[] as any,
      totalParticipantes || undefined,
    );
    return {
      versaoExecutor: (carga.config as any)?.executor ?? VERSAO_EXECUTOR_CARGA,
      carga: {
        ...carga,
        ...totais,
        config: carga.config as any,
        plano: undefined,
        variacoes: undefined,
        controle: estadoControleCarga(carga),
      },
      amostras: lista.slice(-200),
      processamento,
      metricas: { ...metricas, duracaoMs, conversasEnvolvidas: conversas },
      preflight,
      // Custo monetário não é medido: o provedor não devolve preço por chamada.
      custoMedido: false,
      concorrenciaEfetiva: limiteParalelo(carga.config),
      paralelismo: metricasParalelas(carga.config),
    };
  });
