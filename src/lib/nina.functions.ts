import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hojeBR, janelaDiaClinica } from "@/lib/date-utils";
import { z } from "zod";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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

const ChatSchema = z.object({
  clinicaId: z.string().uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
  /** Modo conversa por voz: resposta curta e modelo mais rápido. */
  modoVoz: z.boolean().optional(),
});


/**
 * Carrega contexto da clínica (médicos com horários + procedimentos) para
 * tanto a Nina (IA) quanto a página de Consulta Rápida.
 */
export const getContextoClinica = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMembership(supabase, userId, data.clinicaId);

    const carregarProcedimentos = async () => {
      const pageSize = 1000;
      const rows: any[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data: page, error } = await supabase
          .from("procedimentos")
          .select(
            "id, nome, tipo, grupo, valor_padrao, valor_dinheiro, valor_dinheiro_pix, valor_pix, valor_cartao, valor_cartao_credito, valor_cartao_debito, duracao_minutos, preparo",
          )
          .eq("clinica_id", data.clinicaId)
          .eq("ativo", true)
          .order("nome")
          .range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        rows.push(...(page ?? []));
        if (!page || page.length < pageSize) break;
      }
      return rows;
    };

    const [medR, dispR, procedimentosRows, meR, espAllR] = await Promise.all([
      supabase
        .from("medicos")
        .select("id, nome, crm, crm_uf, telefone, email")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("medico_disponibilidades")
        .select("medico_id, dia_semana, hora_inicio, hora_fim, observacoes")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true)
        .order("dia_semana")
        .order("hora_inicio"),
      carregarProcedimentos(),
      supabase.from("medico_especialidades").select("medico_id, especialidade_id"),
      supabase.from("especialidades").select("id, nome"),
    ]);

    const espNome = new Map<string, string>();
    for (const e of espAllR.data ?? []) espNome.set(e.id, e.nome);
    const medEsp = new Map<string, string[]>();
    for (const r of meR.data ?? []) {
      const nome = espNome.get(r.especialidade_id);
      if (!nome) continue;
      const arr = medEsp.get(r.medico_id) ?? [];
      arr.push(nome);
      medEsp.set(r.medico_id, arr);
    }
    const medicos = (medR.data ?? []).map((m) => ({
      ...m,
      especialidades: medEsp.get(m.id) ?? [],
      horarios: (dispR.data ?? [])
        .filter((d) => d.medico_id === m.id)
        .map((d) => ({
          dia: DIAS[d.dia_semana] ?? "?",
          inicio: d.hora_inicio?.slice(0, 5),
          fim: d.hora_fim?.slice(0, 5),
          obs: d.observacoes,
        })),
    }));

    const procedimentos = procedimentosRows.map((p: any) => {
      const dinheiro =
        Number(p.valor_dinheiro_pix) ||
        Number(p.valor_dinheiro) ||
        Number(p.valor_pix) ||
        Number(p.valor_padrao) ||
        0;
      const cartao =
        Number(p.valor_cartao) ||
        Number(p.valor_cartao_credito) ||
        Number(p.valor_cartao_debito) ||
        Number(p.valor_padrao) ||
        dinheiro ||
        0;
      return {
        id: p.id,
        nome: p.nome,
        tipo: p.tipo,
        grupo: p.grupo,
        duracao_minutos: p.duracao_minutos,
        preparo: p.preparo,
        valor_dinheiro_pix: dinheiro,
        valor_cartao: cartao,
      };
    });
    return { medicos, procedimentos };
  });

export const chatNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ChatSchema.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { reply: "", error: "LOVABLE_API_KEY ausente" };

    const { supabase, userId } = context;
    const { ninaDesativadaNaClinica } = await import("@/lib/nina-desligada.server");
    if (await ninaDesativadaNaClinica(data.clinicaId)) {
      return { reply: "", error: "A Nina está desativada nesta clínica." };
    }
    const { assertMembership, contextoClinicaTexto, systemPromptNina } = await import(
      "@/lib/nina-contexto.server"
    );
    await assertMembership(supabase, userId, data.clinicaId);

    // Janela do dia civil da CLÍNICA (America/Sao_Paulo). No Worker (UTC), o
    // par `new Date()` + `setHours` fazia a Nina enxergar a agenda do dia
    // deslocada em 3 horas.
    const janela = janelaDiaClinica(hojeBR());
    const contextoTexto = await contextoClinicaTexto(supabase, data.clinicaId, janela);
    let systemPrompt = systemPromptNina(contextoTexto, data.modoVoz);

    // Aprendizados aprovados pela equipe (memória de longo prazo da clínica).
    const ultimaPergunta = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const { recuperarAprendizados, blocoPromptAprendizados } = await import(
      "@/lib/nina/aprendizado.server"
    );
    const aprendizados = await recuperarAprendizados(
      data.clinicaId,
      "interno",
      ultimaPergunta,
      data.modoVoz ? 3 : 6,
    ).catch(() => []);
    const blocoAprendizado = blocoPromptAprendizados(aprendizados);
    if (blocoAprendizado) systemPrompt = `${systemPrompt}\n\n${blocoAprendizado}`;

    // Base de Conhecimentos (planilha oficial) — fonte de verdade administrativa.
    const { blocoPromptBaseConhecimento } = await import("@/lib/nina/kb.server");
    const blocoKb = await blocoPromptBaseConhecimento(data.clinicaId).catch(() => "");
    if (blocoKb) systemPrompt = `${systemPrompt}\n\n${blocoKb}`;


    const { FERRAMENTAS_NINA, executarFerramentaNina } = await import(
      "@/lib/nina-ferramentas.server"
    );

    type Msg = { role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string };
    const historico: Msg[] = [
      { role: "system", content: systemPrompt },
      ...data.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    // Até 6 rodadas: a Nina consulta/executa ferramentas e volta com a resposta.
    const MAX_RODADAS = data.modoVoz ? 3 : 6;
    // Estado do turno para o Reasoning Router (Fase 2).
    const nomesFerramentas: string[] = [];
    let houveConflito = false;
    let nivelAnterior: "low" | "medium" | "high" | undefined;
    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
      // Toda chamada de modelo da Nina passa pelo Nina AI Gateway.
      const { ninaAIGateway } = await import("@/lib/nina/ai-gateway.server");
      const resposta = await ninaAIGateway({
        clinicaId: data.clinicaId,
        perfil: data.modoVoz ? "voz" : "texto",
        conversaId: (data as { conversaId?: string | null }).conversaId ?? null,
        ferramentasUsadas: nomesFerramentas,
        messages: historico as any,
        tools: FERRAMENTAS_NINA,
        ...(data.modoVoz ? { maxTokens: 220 } : {}),
        raciocinio: {
          mensagem: ultimaPergunta,
          rodada,
          temFerramentas: true,
          ferramentasExecutadas: nomesFerramentas.length,
          nomesFerramentas,
          houveConflito,
          ...(nivelAnterior ? { nivelAnterior } : {}),
        },
      });
      nivelAnterior = resposta.nivel;

      if (!resposta.ok) {
        return { reply: "", error: resposta.erro ?? "Falha na resposta da Nina" };
      }

      const chamadas = resposta.toolCalls ?? [];

      if (chamadas.length === 0) {
        return { reply: resposta.conteudo, error: null as string | null };
      }

      historico.push({ role: "assistant", content: resposta.conteudo || null, tool_calls: chamadas });
      for (const c of chamadas) {
        let resultado: unknown;
        try {
          resultado = await executarFerramentaNina(
            supabase,
            userId,
            data.clinicaId,
            c.function?.name ?? "",
            c.function?.arguments ?? "{}",
          );
        } catch (e) {
          resultado = { erro: e instanceof Error ? e.message : "falha na ferramenta" };
          houveConflito = true;
        }
        nomesFerramentas.push(c.function?.name ?? "");
        if (resultado && typeof resultado === "object" && "erro" in (resultado as object)) {
          houveConflito = true;
        }
        historico.push({
          role: "tool",
          tool_call_id: c.id,
          content: JSON.stringify(resultado).slice(0, 12000),
        });
      }
    }

    return {
      reply: "",
      error: "A Nina não conseguiu concluir a tarefa em poucas etapas. Tente pedir de forma mais direta.",
    };
  });

