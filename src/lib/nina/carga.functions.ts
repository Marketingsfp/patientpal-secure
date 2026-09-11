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
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  calcularMetricas,
  extrairVariacoes,
  INSTRUCOES_LUNA,
  LIMITE_ABSOLUTO,
  MODELO_LUNA,
  intervaloEfetivoMs,
  normalizarConfig,
  planoDeMensagens,
  validarDisparo,
  variacoesFallback,
  estourouOrcamento,
  type ConfigCarga,
} from "@/lib/nina/carga";
import { garantirPapel, PROVEDOR_IA } from "@/lib/nina/papeis-modelos";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
/** Orçamento de tempo de cada chamada de lote (o restante segue no próximo). */
const ORCAMENTO_LOTE_MS = 20_000;

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
  perfil: z.enum(["leve", "medio", "alto", "customizado"]).default("leve"),
  leadsAtivos: z.number().int().min(1).max(LIMITE_ABSOLUTO.leadsAtivos).default(5),
  totalMensagens: z.number().int().min(1).max(LIMITE_ABSOLUTO.totalMensagens).default(20),
  conversasSimultaneas: z
    .number()
    .int()
    .min(1)
    .max(LIMITE_ABSOLUTO.conversasSimultaneas)
    .default(5),
  mensagensPorMinuto: z
    .number()
    .int()
    .min(1)
    .max(LIMITE_ABSOLUTO.mensagensPorMinuto)
    .default(30),
  duracaoMaxS: z.number().int().min(30).max(LIMITE_ABSOLUTO.duracaoMaxS).default(300),
  intervaloMs: z.number().int().min(0).max(60_000).default(1000),
  timeoutS: z.number().int().min(10).max(LIMITE_ABSOLUTO.timeoutS).default(60),
  retriesMax: z.number().int().min(0).max(LIMITE_ABSOLUTO.retriesMax).default(1),
  maxTokens: z.number().int().min(1000).max(LIMITE_ABSOLUTO.maxTokens).default(200_000),
  maxCustoCreditos: z.number().min(0).max(LIMITE_ABSOLUTO.maxCustoCreditos).default(0),
  creditosPorMilTokens: z.number().min(0).max(LIMITE_ABSOLUTO.creditosPorMilTokens).default(0),
  distribuicao: z
    .array(z.object({ cenario: z.string().trim().min(3).max(300), peso: z.number().min(0.1).max(10) }))
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

/** Cria o teste de carga, gera as variações e monta a fila de mensagens. */
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
      })
      .parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const config: ConfigCarga = normalizarConfig(data.config);
    const check = validarDisparo(config, data.confirmado);
    if (!check.ok) throw new Error(check.motivo);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { garantirLeads } = await import("@/lib/nina/teste-console.server");

    // FASE 3 — um run por vez: duplo clique, retry da tela ou duas chamadas
    // simultâneas não podem criar duas execuções.
    const { data: emAndamento } = await supabaseAdmin
      .from("nina_teste_carga")
      .select("id, status")
      .eq("clinica_id", data.clinicaId)
      .in("status", ["preparando", "executando"])
      .limit(1);
    if ((emAndamento ?? []).length)
      throw new Error("Já existe um teste de carga em andamento nesta clínica.");

    const leads = await garantirLeads(supabaseAdmin, data.clinicaId);
    if (!leads.length) throw new Error("Nenhum lead de teste disponível nesta clínica");




    const plano = planoDeMensagens(config);
    const cenariosUnicos = [...new Set(plano.map((p) => p.cenario))];

    // Variações de linguagem por cenário (Luna) ou variações fixas de apoio.
    const variacoes: Record<string, string[]> = {};
    for (const cenario of cenariosUnicos) {
      variacoes[cenario] = data.usarLuna
        ? await gerarVariacoesLuna(cenario, 8)
        : variacoesFallback(cenario);
    }

    const planoFinal = plano.map((p, i) => {
      const opcoes = variacoes[p.cenario] ?? variacoesFallback(p.cenario);
      const lead = leads[p.slot % Math.min(config.leadsAtivos, leads.length)]!;
      return {
        indice: i,
        cenario: p.cenario,
        mensagem: opcoes[i % opcoes.length]!,
        leadId: lead.id,
        leadIndice: lead.indice,
      };
    });

    const participantes = [...new Set(planoFinal.map((p) => p.leadId))];

    // FASE 3 — o run nasce em PREPARANDO: nenhum disparo pode acontecer antes
    // de todos os leads participantes estarem READY.
    const { data: linha, error } = await supabaseAdmin
      .from("nina_teste_carga")
      .insert({
        clinica_id: data.clinicaId,
        nome: data.nome,
        perfil: config.perfil,
        status: "preparando",
        config,
        variacoes,
        plano: planoFinal,
        preflight: [],
        confirmado: data.confirmado,
        total_planejado: planoFinal.length,
        modelo_gerador: data.usarLuna ? garantirPapel("carga", MODELO_LUNA) : null,
        provedor_gerador: data.usarLuna ? PROVEDOR_IA : null,
        criado_por: context.userId,
      })
      .select("id, status, total_planejado")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { carga: linha, config, participantes: participantes.length };
  });

/**
 * FASE 3 — prepara os leads participantes em lotes pequenos, para a tela
 * mostrar o progresso (0/10 … 10/10). É idempotente: leads já com baseline
 * READY não são resetados de novo. Só quando TODOS ficam prontos o run passa
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
    const { prepararLeadsCarga } = await import("@/lib/nina/carga-preflight.server");
    const {
      LOTE_PREFLIGHT,
      baselineLead,
      descreverFalhaPreflight,
      descreverPreparacaoParcial,
      pendentesPreflight,
    } = await import("@/lib/nina/carga-preflight");

    const carga = await carregarCarga(supabaseAdmin, data.clinicaId, data.cargaId);
    const plano = (carga.plano ?? []) as any[];
    const participantes = [
      ...new Map(
        plano.map((p: any) => [p.leadId, { id: p.leadId as string, indice: p.leadIndice as number }]),
      ).values(),
    ];
    const baselines = (carga.preflight ?? []) as any[];

    if (carga.status !== "preparando") {
      return {
        status: carga.status,
        pronto: carga.status === "executando",
        prontos: baselines.length,
        total: participantes.length,
        erro: null as string | null,
      };
    }

    const pendentes = pendentesPreflight(participantes, baselines).slice(0, LOTE_PREFLIGHT);
    const resumo = pendentes.length
      ? await prepararLeadsCarga({
          admin: supabaseAdmin,
          clinicaId: data.clinicaId,
          leads: pendentes as any,
          userId: context.userId,
        })
      : { pronto: true, total: 0, prontos: 0, falhas: [], resultados: [] };

    const novos = resumo.resultados
      .filter((r) => r.situacao === "READY")
      .map((resultado) => baselineLead({ runId: carga.id, resultado }));
    const acumulado = [...baselines, ...novos];

    if (resumo.falhas.length) {
      await supabaseAdmin
        .from("nina_teste_carga")
        .update({
          status: "erro",
          preflight: acumulado,
          finalizado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", carga.id);
      return {
        status: "erro",
        pronto: false,
        prontos: acumulado.length,
        total: participantes.length,
        erro: `${descreverPreparacaoParcial(acumulado.length, participantes.length)} ${descreverFalhaPreflight(
          resumo as any,
        )}`.trim(),
      };
    }

    const todosProntos = acumulado.length >= participantes.length;
    await supabaseAdmin
      .from("nina_teste_carga")
      .update({
        preflight: acumulado,
        ...(todosProntos
          ? { status: "executando", iniciado_em: new Date().toISOString() }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", carga.id)
      .eq("status", "preparando");

    return {
      status: todosProntos ? "executando" : "preparando",
      pronto: todosProntos,
      prontos: acumulado.length,
      total: participantes.length,
      erro: null as string | null,
    };
  });

async function carregarCarga(admin: any, clinicaId: string, id: string) {
  const { data, error } = await admin
    .from("nina_teste_carga")
    .select("*")
    .eq("clinica_id", clinicaId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Teste de carga não encontrado nesta clínica");
  return data as any;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executa um trecho da fila dentro de um orçamento de tempo. O cliente apenas
 * repete a chamada: concorrência, ritmo, tentativas e tempo limite são
 * decididos aqui no servidor.
 */
export const executarLoteCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), cargaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processarMensagemTeste } = await import("@/lib/nina/teste-console.server");

    const carga = await carregarCarga(supabaseAdmin, data.clinicaId, data.cargaId);
    if (carga.status !== "executando")
      return { status: carga.status, enviadas: carga.enviadas, total: carga.total_planejado };

    const config = normalizarConfig(carga.config ?? {});
    const plano = (carga.plano ?? []) as any[];
    const intervalo = intervaloEfetivoMs(config);
    const inicioLote = Date.now();
    const inicioTeste = new Date(carga.iniciado_em).getTime();

    let enviadas = carga.enviadas as number;
    const acumulado = {
      sucesso: 0,
      erros: 0,
      timeouts: 0,
      retries: 0,
      chamadas: 0,
      ferramentas: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    let terminou: string | null = null;

    while (enviadas < plano.length) {
      if (Date.now() - inicioLote > ORCAMENTO_LOTE_MS) break;
      if ((Date.now() - inicioTeste) / 1000 > config.duracaoMaxS) {
        terminou = "concluido";
        break;
      }
      // Orçamento de tokens/custo estimado do teste inteiro.
      const tokensAteAgora =
        Number(carga.input_tokens) +
        Number(carga.output_tokens) +
        acumulado.inputTokens +
        acumulado.outputTokens;
      if (estourouOrcamento(config, tokensAteAgora).estourou) {
        terminou = "parado";
        break;
      }
      // Cancelamento: relido do banco a cada rodada.
      const { data: flag } = await supabaseAdmin
        .from("nina_teste_carga")
        .select("cancelar")
        .eq("id", carga.id)
        .maybeSingle();
      if ((flag as any)?.cancelar) {
        terminou = "parado";
        break;
      }

      const rodada = plano.slice(enviadas, enviadas + config.conversasSimultaneas);
      const t0Rodada = Date.now();

      const resultados = await Promise.all(
        rodada.map(async (item: any) => {
          let tentativa = 0;
          let ultimoErro: string | null = null;
          let status: "ok" | "erro" | "timeout" = "erro";
          let latencia = 0;

          while (tentativa <= config.retriesMax) {
            tentativa += 1;
            const t0 = Date.now();
            try {
              const resp: any = await Promise.race([
                processarMensagemTeste(
                  {
                    clinicaId: data.clinicaId,
                    leadId: item.leadId,
                    tipo: "text",
                    texto: item.mensagem,
                    chave: `carga-${carga.id}-${item.indice}-${tentativa}`,
                  },
                  context.userId,
                ),
                espera(config.timeoutS * 1000).then(() => ({ __timeout: true })),
              ]);
              latencia = Date.now() - t0;
              if (resp?.__timeout) {
                status = "timeout";
                ultimoErro = `Tempo limite de ${config.timeoutS}s excedido.`;
              } else if (resp?.erro && !resp?.reply) {
                status = "erro";
                ultimoErro = String(resp.erro).slice(0, 300);
              } else {
                status = "ok";
                ultimoErro = null;
                break;
              }
            } catch (e) {
              latencia = Date.now() - t0;
              status = "erro";
              ultimoErro = String((e as Error)?.message ?? e).slice(0, 300);
            }
          }

          // Telemetria real da última execução do modelo nesta conversa.
          let exec: any = null;
          const { data: lead } = await supabaseAdmin
            .from("nina_teste_leads")
            .select("conversa_id")
            .eq("id", item.leadId)
            .maybeSingle();
          if ((lead as any)?.conversa_id) {
            const { data: e } = await supabaseAdmin
              .from("nina_execucoes")
              .select("model, tool_calls, input_tokens, output_tokens, retries")
              .eq("conversation_id", (lead as any).conversa_id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            exec = e;
          }

          return {
            item,
            status,
            tentativa,
            latencia,
            erro: ultimoErro,
            conversaId: (lead as any)?.conversa_id ?? null,
            ferramentas: (exec?.tool_calls ?? []) as string[],
            inputTokens: exec?.input_tokens ?? 0,
            outputTokens: exec?.output_tokens ?? 0,
          };
        }),
      );

      const amostras = resultados.map((r) => {
        if (r.status === "ok") acumulado.sucesso += 1;
        else if (r.status === "timeout") acumulado.timeouts += 1;
        else acumulado.erros += 1;
        acumulado.retries += r.tentativa - 1;
        acumulado.chamadas += 1;
        acumulado.ferramentas += r.ferramentas.length;
        acumulado.inputTokens += r.inputTokens;
        acumulado.outputTokens += r.outputTokens;
        return {
          clinica_id: data.clinicaId,
          carga_id: carga.id,
          indice: r.item.indice,
          lead_id: r.item.leadId,
          lead_indice: r.item.leadIndice,
          conversa_id: r.conversaId,
          cenario: r.item.cenario,
          mensagem: String(r.item.mensagem).slice(0, 300),
          status: r.status,
          tentativa: r.tentativa,
          latencia_ms: r.latencia,
          chamadas_modelo: 1,
          ferramentas: r.ferramentas,
          input_tokens: r.inputTokens,
          output_tokens: r.outputTokens,
          erro: r.erro,
        };
      });
      await supabaseAdmin.from("nina_teste_carga_amostras").insert(amostras);

      enviadas += rodada.length;
      await supabaseAdmin
        .from("nina_teste_carga")
        .update({
          enviadas,
          sucesso: (carga.sucesso as number) + acumulado.sucesso,
          erros: (carga.erros as number) + acumulado.erros,
          timeouts: (carga.timeouts as number) + acumulado.timeouts,
          retries: (carga.retries as number) + acumulado.retries,
          chamadas_modelo: (carga.chamadas_modelo as number) + acumulado.chamadas,
          ferramentas: (carga.ferramentas as number) + acumulado.ferramentas,
          input_tokens: Number(carga.input_tokens) + acumulado.inputTokens,
          output_tokens: Number(carga.output_tokens) + acumulado.outputTokens,
        })
        .eq("id", carga.id);

      // Pacing: respeita mensagens/minuto e o intervalo configurado.
      const gasto = Date.now() - t0Rodada;
      if (enviadas < plano.length && intervalo > gasto) await espera(intervalo - gasto);
    }

    if (enviadas >= plano.length) terminou = terminou ?? "concluido";
    if (terminou) {
      await supabaseAdmin
        .from("nina_teste_carga")
        .update({ status: terminou, finalizado_em: new Date().toISOString() })
        .eq("id", carga.id);
    }

    return { status: terminou ?? "executando", enviadas, total: plano.length };
  });

/** Cancelamento: marca a bandeira; o lote em andamento para na próxima rodada. */
export const pararTesteCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), cargaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("nina_teste_carga")
      .update({ cancelar: true, status: "parado", finalizado_em: new Date().toISOString() })
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.cargaId);
    return { ok: true };
  });

export const listarTestesCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: linhas } = await supabaseAdmin
      .from("nina_teste_carga")
      .select(
        "id, nome, perfil, status, total_planejado, enviadas, sucesso, erros, timeouts, retries, chamadas_modelo, ferramentas, input_tokens, output_tokens, iniciado_em, finalizado_em",
      )
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: false })
      .limit(20);
    return { testes: (linhas ?? []) as any[] };
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
    const carga = await carregarCarga(supabaseAdmin, data.clinicaId, data.cargaId);
    const { data: amostras } = await supabaseAdmin
      .from("nina_teste_carga_amostras")
      .select("indice, lead_indice, cenario, mensagem, status, tentativa, latencia_ms, ferramentas, input_tokens, output_tokens, erro, created_at")
      .eq("clinica_id", data.clinicaId)
      .eq("carga_id", data.cargaId)
      .order("indice");

    const lista = (amostras ?? []) as any[];
    const fim = carga.finalizado_em ? new Date(carga.finalizado_em).getTime() : Date.now();
    const duracaoMs = Math.max(0, fim - new Date(carga.iniciado_em).getTime());
    const metricas = calcularMetricas(
      lista.filter((a) => a.status === "ok").map((a) => a.latencia_ms ?? 0),
      duracaoMs,
    );

    const conversas = new Set(lista.map((a) => a.lead_indice)).size;
    return {
      carga: { ...carga, plano: undefined, variacoes: undefined },
      amostras: lista.slice(-200),
      metricas: { ...metricas, duracaoMs, conversasEnvolvidas: conversas },
      // Custo monetário não é medido: o provedor não devolve preço por chamada.
      custoMedido: false,
    };
  });
