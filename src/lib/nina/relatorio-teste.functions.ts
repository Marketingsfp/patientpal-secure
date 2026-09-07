/**
 * FASE 8 — Backend do relatório da homologação.
 *
 * SOMENTE LEITURA. Não cria estrutura nova: reúne o que já existe —
 * execuções de cenários, testes de carga, simulações Terra, ciclos manuais,
 * execuções reais da Nina (`nina_execucoes`), ferramentas auditadas
 * (`audit_log` / NINA_TOOL), traces (`nina_trace_eventos`) e avaliações do Sol
 * (`nina_teste_avaliacoes`) — e devolve um relatório por execução de teste.
 *
 * Custo: só é exibido quando já existe registrado (carga/cenários). Quando o
 * provedor não informa preço, o campo volta nulo — nada é estimado aqui.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  classificarErroRelatorio,
  duracaoMs,
  somarItens,
  errosPorCategoria,
  type ErroRelatorio,
  type ItemRelatorio,
  type TipoRelatorio,
} from "@/lib/nina/relatorio-teste";

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

export type ResumoRelatorio = {
  id: string;
  tipo: TipoRelatorio;
  nome: string;
  status: string;
  inicio: string | null;
  fim: string | null;
  itens: number;
};

/** Lista as execuções de teste da clínica (todas as origens), mais recentes primeiro. */
export const listarRelatoriosTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), limite: z.number().int().min(1).max(50).optional() }).parse(i),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limite = data.limite ?? 20;

    const [cenarios, cargas, simulacoes, ciclos, leads] = await Promise.all([
      supabaseAdmin
        .from("nina_teste_execucoes")
        .select("id,nome,status,iniciado_em,finalizado_em,created_at,total")
        .eq("clinica_id", data.clinicaId)
        .order("created_at", { ascending: false })
        .limit(limite),
      supabaseAdmin
        .from("nina_teste_carga")
        .select("id,nome,status,iniciado_em,finalizado_em,created_at,total_planejado")
        .eq("clinica_id", data.clinicaId)
        .order("created_at", { ascending: false })
        .limit(limite),
      supabaseAdmin
        .from("nina_teste_simulacoes")
        .select("id,cenario,status,created_at,finalizado_em,ciclo_id,lead_id")
        .eq("clinica_id", data.clinicaId)
        .order("created_at", { ascending: false })
        .limit(limite),
      supabaseAdmin
        .from("nina_teste_ciclos")
        .select("id,indice,status,created_at,resolved_at")
        .eq("clinica_id", data.clinicaId)
        .order("created_at", { ascending: false })
        .limit(limite * 2),
      supabaseAdmin
        .from("nina_teste_leads")
        .select("id,indice")
        .eq("clinica_id", data.clinicaId),
    ]);

    const indicePorLead = new Map<string, number>(
      ((leads.data ?? []) as any[]).map((l) => [l.id as string, l.indice as number]),
    );
    const ciclosComSimulacao = new Set(
      ((simulacoes.data ?? []) as any[]).map((s) => s.ciclo_id).filter(Boolean),
    );

    const itens: ResumoRelatorio[] = [
      ...((cenarios.data ?? []) as any[]).map((e) => ({
        id: e.id as string,
        tipo: "cenarios" as TipoRelatorio,
        nome: (e.nome as string) || "Execução de cenários",
        status: e.status as string,
        inicio: (e.iniciado_em ?? e.created_at) as string | null,
        fim: (e.finalizado_em ?? null) as string | null,
        itens: (e.total as number) ?? 0,
      })),
      ...((cargas.data ?? []) as any[]).map((c) => ({
        id: c.id as string,
        tipo: "carga" as TipoRelatorio,
        nome: (c.nome as string) || "Teste de carga",
        status: c.status as string,
        inicio: (c.iniciado_em ?? c.created_at) as string | null,
        fim: (c.finalizado_em ?? null) as string | null,
        itens: (c.total_planejado as number) ?? 0,
      })),
      ...((simulacoes.data ?? []) as any[]).map((s) => ({
        id: s.id as string,
        tipo: "terra" as TipoRelatorio,
        nome: `Terra — Lead ${String(indicePorLead.get(s.lead_id) ?? "?").padStart(2, "0")}${
          s.cenario ? ` · ${String(s.cenario).slice(0, 60)}` : ""
        }`,
        status: s.status as string,
        inicio: s.created_at as string,
        fim: (s.finalizado_em ?? null) as string | null,
        itens: 1,
      })),
      ...((ciclos.data ?? []) as any[])
        .filter((c) => !ciclosComSimulacao.has(c.id))
        .map((c) => ({
          id: c.id as string,
          tipo: "manual" as TipoRelatorio,
          nome: `Manual — Lead ${String(c.indice ?? "?").padStart(2, "0")}`,
          status: c.status as string,
          inicio: c.created_at as string,
          fim: (c.resolved_at ?? null) as string | null,
          itens: 1,
        })),
    ]
      .sort((a, b) => String(b.inicio ?? "").localeCompare(String(a.inicio ?? "")))
      .slice(0, limite * 2);

    return { execucoes: itens };
  });

type Bruto = {
  chave: string;
  cenario: string | null;
  leadId: string | null;
  leadIndice: number | null;
  conversaId: string | null;
  cicloId: string | null;
  inicio: string | null;
  fim: string | null;
  custoEstimado: number | null;
  erroItem: string | null;
  modeloFallback: string | null;
};

/** Detalhe completo de uma execução de teste, pronto para investigação. */
export const detalheRelatorioTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        tipo: z.enum(["manual", "terra", "cenarios", "carga"]),
        execucaoId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tipo = data.tipo as TipoRelatorio;

    const { data: leadsRaw } = await supabaseAdmin
      .from("nina_teste_leads")
      .select("id,indice,nome")
      .eq("clinica_id", data.clinicaId);
    const leads = new Map<string, { indice: number; nome: string }>(
      ((leadsRaw ?? []) as any[]).map((l) => [l.id as string, { indice: l.indice, nome: l.nome }]),
    );

    let cabecalho: Record<string, string | number | boolean | null> = {};
    let brutos: Bruto[] = [];

    if (tipo === "cenarios") {
      const { data: exec } = await supabaseAdmin
        .from("nina_teste_execucoes")
        .select("*")
        .eq("clinica_id", data.clinicaId)
        .eq("id", data.execucaoId)
        .maybeSingle();
      if (!exec) throw new Error("Execução não encontrada nesta clínica");
      const { data: itens } = await supabaseAdmin
        .from("nina_teste_execucao_itens")
        .select("*")
        .eq("clinica_id", data.clinicaId)
        .eq("execucao_id", data.execucaoId)
        .order("ordem", { ascending: true });
      cabecalho = {
        nome: exec.nome,
        status: exec.status,
        inicio: exec.iniciado_em ?? exec.created_at,
        fim: exec.finalizado_em,
        aprovados: exec.aprovados,
        reprovados: exec.reprovados,
        inconclusivos: exec.inconclusivos,
      };
      brutos = ((itens ?? []) as any[]).map((it) => ({
        chave: it.id,
        cenario: it.cenario_snapshot?.nome ?? null,
        leadId: it.lead_id ?? null,
        leadIndice: it.lead_indice ?? null,
        conversaId: it.conversa_id ?? null,
        cicloId: it.ciclo_id ?? null,
        inicio: it.iniciado_em ?? it.created_at ?? null,
        fim: it.finalizado_em ?? null,
        custoEstimado: it.custo_estimado ?? null,
        erroItem: it.erro ?? null,
        modeloFallback: it.modelo_nina ?? null,
      }));
    } else if (tipo === "carga") {
      const { data: carga } = await supabaseAdmin
        .from("nina_teste_carga")
        .select("*")
        .eq("clinica_id", data.clinicaId)
        .eq("id", data.execucaoId)
        .maybeSingle();
      if (!carga) throw new Error("Teste de carga não encontrado nesta clínica");
      const { data: amostras } = await supabaseAdmin
        .from("nina_teste_carga_amostras")
        .select("*")
        .eq("clinica_id", data.clinicaId)
        .eq("carga_id", data.execucaoId)
        .order("indice", { ascending: true });
      cabecalho = {
        nome: carga.nome,
        status: carga.status,
        inicio: carga.iniciado_em ?? carga.created_at,
        fim: carga.finalizado_em,
        perfil: carga.perfil,
        modeloGerador: carga.modelo_gerador,
        enviadas: carga.enviadas,
        sucesso: carga.sucesso,
        errosRegistrados: carga.erros,
        timeouts: carga.timeouts,
      };
      // Uma linha por lead: a carga distribui muitas mensagens entre poucos leads.
      const porLead = new Map<string, any[]>();
      for (const a of (amostras ?? []) as any[]) {
        const chave = String(a.lead_id ?? a.lead_indice ?? "sem-lead");
        porLead.set(chave, [...(porLead.get(chave) ?? []), a]);
      }
      brutos = [...porLead.entries()].map(([chave, linhas]) => {
        const ordenadas = [...linhas].sort((x, y) =>
          String(x.created_at).localeCompare(String(y.created_at)),
        );
        const primeira = ordenadas[0];
        const ultima = ordenadas[ordenadas.length - 1];
        const erro = ordenadas.find((l) => l.erro)?.erro ?? null;
        return {
          chave,
          cenario: primeira?.cenario ?? null,
          leadId: primeira?.lead_id ?? null,
          leadIndice: primeira?.lead_indice ?? null,
          conversaId: primeira?.conversa_id ?? null,
          cicloId: null,
          inicio: primeira?.created_at ?? null,
          fim: ultima?.created_at ?? null,
          custoEstimado: null,
          erroItem: erro,
          modeloFallback: null,
        };
      });
      if (typeof carga.custo_estimado === "number" && brutos[0])
        brutos[0].custoEstimado = carga.custo_estimado;
    } else if (tipo === "terra") {
      const { data: sim } = await supabaseAdmin
        .from("nina_teste_simulacoes")
        .select("*")
        .eq("clinica_id", data.clinicaId)
        .eq("id", data.execucaoId)
        .maybeSingle();
      if (!sim) throw new Error("Simulação não encontrada nesta clínica");
      cabecalho = {
        nome: `Terra — ${sim.cenario ?? "sem cenário"}`,
        status: sim.status,
        inicio: sim.created_at,
        fim: sim.finalizado_em,
        modeloPaciente: sim.modelo,
        turnos: sim.turnos,
        motivoFim: sim.motivo_fim,
      };
      brutos = [
        {
          chave: sim.id,
          cenario: sim.cenario ?? null,
          leadId: sim.lead_id ?? null,
          leadIndice: leads.get(sim.lead_id)?.indice ?? null,
          conversaId: sim.conversa_id ?? null,
          cicloId: sim.ciclo_id ?? null,
          inicio: sim.created_at ?? null,
          fim: sim.finalizado_em ?? null,
          custoEstimado: null,
          erroItem: sim.erro ?? null,
          modeloFallback: null,
        },
      ];
    } else {
      const { data: ciclo } = await supabaseAdmin
        .from("nina_teste_ciclos")
        .select("*")
        .eq("clinica_id", data.clinicaId)
        .eq("id", data.execucaoId)
        .maybeSingle();
      if (!ciclo) throw new Error("Ciclo de teste não encontrado nesta clínica");
      cabecalho = {
        nome: `Manual — Lead ${String(ciclo.indice ?? "?").padStart(2, "0")}`,
        status: ciclo.status,
        inicio: ciclo.created_at,
        fim: ciclo.resolved_at,
      };
      brutos = [
        {
          chave: ciclo.id,
          cenario: null,
          leadId: ciclo.lead_id ?? null,
          leadIndice: ciclo.indice ?? null,
          conversaId: ciclo.conversa_id ?? null,
          cicloId: ciclo.id,
          inicio: ciclo.created_at ?? null,
          fim: ciclo.resolved_at ?? null,
          custoEstimado: null,
          erroItem: null,
          modeloFallback: null,
        },
      ];
    }

    const conversas = [...new Set(brutos.map((b) => b.conversaId).filter(Boolean))] as string[];

    // Execuções reais da Nina daquelas conversas.
    const execucoes = conversas.length
      ? ((
          await supabaseAdmin
            .from("nina_execucoes")
            .select(
              "id,conversation_id,model,success,error_category,handoff,tool_calls,knowledge_status,input_tokens,output_tokens,latency_ms,prompt_versao,prompt_versao_id,created_at",
            )
            .eq("clinica_id", data.clinicaId)
            .in("conversation_id", conversas)
            .order("created_at", { ascending: true })
            .limit(2000)
        ).data ?? [])
      : [];

    // Ferramentas realmente executadas (auditoria) — ground truth das tools.
    const ferramentas = conversas.length
      ? ((
          await supabaseAdmin
            .from("audit_log")
            .select("dados_depois,created_at")
            .eq("clinica_id", data.clinicaId)
            .eq("action", "NINA_TOOL")
            .filter("dados_depois->>conversa_id", "in", `(${conversas.join(",")})`)
            .order("created_at", { ascending: true })
            .limit(2000)
        ).data ?? [])
      : [];

    const traces = conversas.length
      ? ((
          await supabaseAdmin
            .from("nina_trace_eventos")
            .select("trace_id,conversation_id,started_at")
            .eq("clinica_id", data.clinicaId)
            .in("conversation_id", conversas)
            .order("started_at", { ascending: false })
            .limit(2000)
        ).data ?? [])
      : [];

    const avaliacoes = conversas.length
      ? ((
          await supabaseAdmin
            .from("nina_teste_avaliacoes")
            .select("*")
            .eq("clinica_id", data.clinicaId)
            .in("conversa_id", conversas)
            .order("created_at", { ascending: false })
            .limit(50)
        ).data ?? [])
      : [];

    const dentro = (b: Bruto, quando: string | null) => {
      if (!quando) return true;
      if (b.inicio && quando < b.inicio) return false;
      if (b.fim && quando > b.fim) return false;
      return true;
    };

    const itens: ItemRelatorio[] = brutos.map((b) => {
      const execs = (execucoes as any[]).filter(
        (e) => e.conversation_id === b.conversaId && dentro(b, e.created_at),
      );
      const tools = (ferramentas as any[])
        .map((f) => ({
          conversaId: f.dados_depois?.conversa_id ?? null,
          nome: f.dados_depois?.entrada?.ferramenta ?? null,
          ok: f.dados_depois?.ok !== false,
          erro: f.dados_depois?.erro ?? null,
          quando: f.created_at as string,
        }))
        .filter((f) => f.conversaId === b.conversaId && dentro(b, f.quando));
      const traceIds = [
        ...new Set(
          (traces as any[])
            .filter((t) => t.conversation_id === b.conversaId && dentro(b, t.started_at))
            .map((t) => String(t.trace_id)),
        ),
      ].slice(0, 20);

      const erros: ErroRelatorio[] = [];
      for (const e of execs) {
        if (e.success === false || e.error_category) {
          erros.push({
            categoria: classificarErroRelatorio({ categoria: e.error_category }),
            descricao: `Execução da Nina falhou (${e.error_category ?? "sem categoria registrada"})`,
            origem: "execucao",
            quando: e.created_at,
            conversaId: b.conversaId,
          });
        }
      }
      for (const t of tools) {
        if (!t.ok) {
          erros.push({
            categoria: classificarErroRelatorio({ ferramenta: t.nome, texto: String(t.erro ?? "") }),
            descricao: `Ferramenta ${t.nome ?? "desconhecida"} retornou erro: ${String(t.erro ?? "sem detalhe")}`.slice(0, 400),
            origem: "ferramenta",
            quando: t.quando,
            conversaId: b.conversaId,
          });
        }
      }
      if (b.erroItem) {
        erros.push({
          categoria: classificarErroRelatorio({ texto: b.erroItem }),
          descricao: String(b.erroItem).slice(0, 400),
          origem: "item",
          quando: b.fim,
          conversaId: b.conversaId,
        });
      }
      for (const a of avaliacoes as any[]) {
        if (a.conversa_id !== b.conversaId) continue;
        for (const achado of (a.achados ?? []) as any[]) {
          if (achado?.gravidade === "informativa") continue;
          erros.push({
            categoria: classificarErroRelatorio({
              componente: achado?.componente ?? null,
              texto: `${achado?.observado ?? ""} ${achado?.esperado ?? ""}`,
            }),
            descricao: String(achado?.observado ?? "Achado do avaliador").slice(0, 400),
            origem: "avaliacao",
            quando: a.created_at,
            conversaId: b.conversaId,
          });
        }
      }

      const ultima = execs[execs.length - 1];
      const inicio = b.inicio ?? execs[0]?.created_at ?? null;
      const fim = b.fim ?? ultima?.created_at ?? null;
      const info = b.leadId ? leads.get(b.leadId) : undefined;

      return {
        chave: b.chave,
        cenario: b.cenario,
        leadIndice: b.leadIndice ?? info?.indice ?? null,
        leadNome: info?.nome ?? null,
        tipo,
        conversaId: b.conversaId,
        cicloId: b.cicloId,
        modeloNina: ultima?.model ?? b.modeloFallback ?? null,
        promptVersao: ultima?.prompt_versao ?? null,
        promptVersaoId: ultima?.prompt_versao_id ?? null,
        inicio,
        fim,
        duracaoMs: duracaoMs(inicio, fim),
        mensagens: execs.length,
        tools: tools.length,
        rag: execs.filter((e) => e.knowledge_status).length,
        agendamentos: tools.filter((t) => /^agendar/i.test(String(t.nome ?? "")) && t.ok).length,
        transferencias:
          execs.filter((e) => e.handoff).length +
          tools.filter((t) => /atendente_humano/i.test(String(t.nome ?? ""))).length,
        erros,
        inputTokens: execs.reduce((s, e) => s + (e.input_tokens ?? 0), 0),
        outputTokens: execs.reduce((s, e) => s + (e.output_tokens ?? 0), 0),
        custoEstimado: b.custoEstimado,
        traceIds,
      };
    });

    return {
      tipo,
      execucaoId: data.execucaoId,
      cabecalho,
      itens,
      totais: somarItens(itens),
      errosPorCategoria: errosPorCategoria(itens),
      avaliacoes: (avaliacoes as any[]).map((a) => ({
        id: a.id,
        conversaId: a.conversa_id,
        criadoEm: a.created_at,
        modelo: a.modelo,
        status: a.status,
        resultado: a.resultado,
        score: a.score,
        resumo: a.resumo,
        dimensoes: a.dimensoes ?? [],
        achados: a.achados ?? [],
        evidencias: a.evidencias ?? {},
        promptVersao: a.prompt_versao,
        erro: a.erro,
      })),
    };
  });
