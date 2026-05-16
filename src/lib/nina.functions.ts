import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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
});

/**
 * Carrega contexto da clínica (médicos com horários + procedimentos) para
 * tanto a Nina (IA) quanto a página de Consulta Rápida.
 */
export const getContextoClinica = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [medR, dispR, procR] = await Promise.all([
      supabase
        .from("medicos")
        .select("id, nome, crm, crm_uf, telefone, email, especialidade_id")
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
      supabase
        .from("procedimentos")
        .select("id, nome, tipo, grupo, valor_dinheiro_pix, valor_cartao, duracao_minutos, preparo")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true)
        .order("nome"),
    ]);

    const medicos = (medR.data ?? []).map((m) => ({
      ...m,
      horarios: (dispR.data ?? [])
        .filter((d) => d.medico_id === m.id)
        .map((d) => ({
          dia: DIAS[d.dia_semana] ?? "?",
          inicio: d.hora_inicio?.slice(0, 5),
          fim: d.hora_fim?.slice(0, 5),
          obs: d.observacoes,
        })),
    }));

    return { medicos, procedimentos: procR.data ?? [] };
  });

function montarContextoTexto(ctx: {
  medicos: Array<{
    nome: string;
    crm: string;
    crm_uf: string;
    horarios: Array<{ dia: string; inicio: string; fim: string; obs: string | null }>;
  }>;
  procedimentos: Array<{ nome: string; valor_dinheiro_pix: number; valor_cartao: number; grupo: string | null }>;
}) {
  const meds = ctx.medicos
    .map((m) => {
      const horarios =
        m.horarios.length > 0
          ? m.horarios.map((h) => `${h.dia} ${h.inicio}-${h.fim}`).join("; ")
          : "(sem horários cadastrados)";
      return `- ${m.nome} (CRM ${m.crm}/${m.crm_uf}): ${horarios}`;
    })
    .join("\n");

  const procs = ctx.procedimentos
    .map(
      (p) =>
        `- ${p.nome}${p.grupo ? ` [${p.grupo}]` : ""}: dinheiro/PIX R$ ${Number(p.valor_dinheiro_pix).toFixed(2)} / cartão R$ ${Number(p.valor_cartao).toFixed(2)}`,
    )
    .join("\n");

  return `MÉDICOS E HORÁRIOS:\n${meds || "(nenhum)"}\n\nPROCEDIMENTOS E VALORES:\n${procs || "(nenhum)"}`;
}

export const chatNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ChatSchema.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { reply: "", error: "LOVABLE_API_KEY ausente" };

    const { supabase } = context;
    const [medR, dispR, procR] = await Promise.all([
      supabase
        .from("medicos")
        .select("id, nome, crm, crm_uf")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true),
      supabase
        .from("medico_disponibilidades")
        .select("medico_id, dia_semana, hora_inicio, hora_fim, observacoes")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true),
      supabase
        .from("procedimentos")
        .select("nome, grupo, valor_dinheiro_pix, valor_cartao")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true),
    ]);

    const medicos = (medR.data ?? []).map((m) => ({
      nome: m.nome,
      crm: m.crm,
      crm_uf: m.crm_uf,
      horarios: (dispR.data ?? [])
        .filter((d) => d.medico_id === m.id)
        .map((d) => ({
          dia: DIAS[d.dia_semana] ?? "?",
          inicio: d.hora_inicio?.slice(0, 5),
          fim: d.hora_fim?.slice(0, 5),
          obs: d.observacoes,
        })),
    }));

    const contextoTexto = montarContextoTexto({
      medicos,
      procedimentos: (procR.data ?? []) as Array<{
        nome: string;
        valor_dinheiro_pix: number;
        valor_cartao: number;
        grupo: string | null;
      }>,
    });

    const systemPrompt = `Você é a Nina, assistente virtual de uma clínica médica. Responda SEMPRE em português do Brasil, de forma curta, direta e amigável. Use APENAS as informações da base abaixo para responder sobre médicos, horários, exames e preços. Se a pergunta for sobre algo que não está na base, diga que não tem essa informação e oriente a equipe a confirmar com o gestor. Não invente dados, valores ou horários.\n\n=== BASE DE DADOS DA CLÍNICA ===\n${contextoTexto}\n=== FIM DA BASE ===`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...data.messages],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Nina AI error", res.status, body);
      if (res.status === 429) return { reply: "", error: "Limite de uso atingido. Tente em alguns segundos." };
      if (res.status === 402) return { reply: "", error: "Créditos de IA esgotados. Adicione créditos no Workspace." };
      return { reply: "", error: `Falha na resposta da Nina (${res.status})` };
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { reply, error: null as string | null };
  });