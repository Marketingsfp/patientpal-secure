import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

async function assertMembership(
  supabase: any,
  userId: string,
  clinicaId: string,
) {
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
    const { supabase, userId } = context;
    await assertMembership(supabase, userId, data.clinicaId);
    const [medR, dispR, procR, meR, espAllR] = await Promise.all([
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
      supabase
        .from("procedimentos")
        .select("id, nome, tipo, grupo, valor_padrao, valor_dinheiro, valor_dinheiro_pix, valor_pix, valor_cartao, valor_cartao_credito, valor_cartao_debito, duracao_minutos, preparo")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("medico_especialidades")
        .select("medico_id, especialidade_id"),
      supabase
        .from("especialidades")
        .select("id, nome"),
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

    const procedimentos = (procR.data ?? []).map((p: any) => {
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

function montarContextoTexto(ctx: {
  medicos: Array<{
    nome: string;
    especialidades?: string[];
    horarios: Array<{ dia: string; inicio: string; fim: string; obs: string | null }>;
  }>;
  procedimentos: Array<{ nome: string; valor_dinheiro_pix: number; valor_cartao: number; grupo: string | null; preparo?: string | null }>;
  especialidades?: string[];
  convenios?: Array<{ nome: string; tipo: string; valor_mensal: number; max_dependentes: number; descricao_beneficios: string | null }>;
  clinica?: { nome: string; endereco: string | null; cidade: string | null; estado: string | null; telefone: string | null; email: string | null } | null;
  agendaResumo?: Array<{ medico: string; total: number; livres: number; ocupados: number }>;
}) {
  const meds = ctx.medicos
    .map((m) => {
      const horarios =
        m.horarios.length > 0
          ? m.horarios.map((h) => `${h.dia} ${h.inicio}-${h.fim}`).join("; ")
          : "(sem horários cadastrados)";
      const esps = (m.especialidades ?? []).filter(Boolean).join(", ");
      return `- ${m.nome}${esps ? ` (${esps})` : ""}: ${horarios}`;
    })
    .join("\n");

  const procs = ctx.procedimentos
    .map(
      (p) =>
        `- ${p.nome}${p.grupo ? ` [${p.grupo}]` : ""}: dinheiro/PIX R$ ${Number(p.valor_dinheiro_pix).toFixed(2)} / cartão R$ ${Number(p.valor_cartao).toFixed(2)}${p.preparo ? ` | PREPARO: ${p.preparo.replace(/\s+/g, " ").trim()}` : ""}`,
    )
    .join("\n");

  const espText = (ctx.especialidades ?? []).join(", ") || "(nenhuma)";
  const convText = (ctx.convenios ?? [])
    .map(
      (c) =>
        `- ${c.nome} [${c.tipo}] — mensalidade base R$ ${Number(c.valor_mensal).toFixed(2)} / até ${c.max_dependentes} dependentes${c.descricao_beneficios ? ` | ${c.descricao_beneficios.replace(/\s+/g, " ").trim().slice(0, 240)}` : ""}`,
    )
    .join("\n") || "(nenhum)";
  const clinicaText = ctx.clinica
    ? `Nome: ${ctx.clinica.nome}\nEndereço: ${[ctx.clinica.endereco, ctx.clinica.cidade, ctx.clinica.estado].filter(Boolean).join(", ") || "(não informado)"}\nTelefone: ${ctx.clinica.telefone || "(não informado)"}\nE-mail: ${ctx.clinica.email || "(não informado)"}`
    : "(não informado)";
  const agendaText = (ctx.agendaResumo ?? [])
    .map((a) => `- ${a.medico}: ${a.ocupados} ocupado(s), ${a.livres} livre(s) (total ${a.total})`)
    .join("\n") || "(sem dados do dia)";

  return [
    `CLÍNICA:\n${clinicaText}`,
    `ESPECIALIDADES ATENDIDAS:\n${espText}`,
    `MÉDICOS E HORÁRIOS:\n${meds || "(nenhum)"}`,
    `PROCEDIMENTOS E VALORES:\n${procs || "(nenhum)"}`,
    `CONVÊNIOS / CARTÃO BENEFÍCIO:\n${convText}`,
    `AGENDA DE HOJE (resumo anonimizado, sem nomes de pacientes):\n${agendaText}`,
  ].join("\n\n");
}

export const chatNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ChatSchema.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { reply: "", error: "LOVABLE_API_KEY ausente" };

    const { supabase, userId } = context;
    await assertMembership(supabase, userId, data.clinicaId);
    const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0);
    const fimDia = new Date(); fimDia.setHours(23, 59, 59, 999);
    const [medR, dispR, procR, espR, planR, cliR, agR, meR] = await Promise.all([
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
        .select("nome, grupo, valor_dinheiro_pix, valor_cartao, preparo")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true),
      supabase
        .from("especialidades")
        .select("id, nome")
        .eq("ativo", true),
      supabase
        .from("planos_assinatura")
        .select("nome, tipo, valor_mensal, max_dependentes, descricao_beneficios")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true),
      supabase
        .from("clinicas")
        .select("nome, endereco, cidade, estado, telefone, email")
        .eq("id", data.clinicaId)
        .maybeSingle(),
      supabase
        .from("agendamentos")
        .select("medico_id, status")
        .eq("clinica_id", data.clinicaId)
        .gte("inicio", inicioDia.toISOString())
        .lte("inicio", fimDia.toISOString()),
      supabase
        .from("medico_especialidades")
        .select("medico_id, especialidade_id"),
    ]);

    const espMap = new Map<string, string>();
    for (const e of espR.data ?? []) espMap.set(e.id, e.nome);

    const medEsp = new Map<string, string[]>();
    for (const r of meR.data ?? []) {
      const nome = espMap.get(r.especialidade_id);
      if (!nome) continue;
      const arr = medEsp.get(r.medico_id) ?? [];
      arr.push(nome);
      medEsp.set(r.medico_id, arr);
    }

    const medicos = (medR.data ?? []).map((m) => ({
      nome: m.nome,
      crm: m.crm,
      crm_uf: m.crm_uf,
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

    const nomeMedico = new Map<string, string>();
    for (const m of medR.data ?? []) nomeMedico.set(m.id, m.nome);
    const agendaAgg = new Map<string, { total: number; livres: number; ocupados: number }>();
    for (const a of agR.data ?? []) {
      const nome = a.medico_id ? nomeMedico.get(a.medico_id) ?? "Sem médico" : "Sem médico";
      const cur = agendaAgg.get(nome) ?? { total: 0, livres: 0, ocupados: 0 };
      cur.total += 1;
      if (a.status === "cancelado" || a.status === "faltou") cur.livres += 1;
      else cur.ocupados += 1;
      agendaAgg.set(nome, cur);
    }
    const agendaResumo = Array.from(agendaAgg.entries()).map(([medico, v]) => ({ medico, ...v }));

    const contextoTexto = montarContextoTexto({
      medicos,
      procedimentos: (procR.data ?? []) as Array<{
        nome: string;
        valor_dinheiro_pix: number;
        valor_cartao: number;
        grupo: string | null;
        preparo: string | null;
      }>,
      especialidades: (espR.data ?? []).map((e: any) => e.nome),
      convenios: (planR.data ?? []) as any,
      clinica: (cliR.data ?? null) as any,
      agendaResumo,
    });

    const systemPrompt = `Você é a Nina, assistente virtual interna da clínica, falando com a EQUIPE autenticada (gestão/recepção/médicos). Responda SEMPRE em português do Brasil, de forma curta, direta e amigável.

CONTEXTO DE USO:
- Este canal é o painel interno do sistema. Quem pergunta é um colaborador autenticado da clínica.
- Você TEM acesso aos dados operacionais da clínica (médicos, especialidades, horários, procedimentos, valores, convênios, agenda do dia) e pode responder livremente sobre eles para a equipe.
- Quando solicitado, pode informar resumos da agenda, valores de procedimentos, horários de médicos, convênios e dados gerais da clínica.

LIMITES:
1. Você é SOMENTE LEITURA — não agenda, não cancela, não cobra, não altera nada. Para ações, oriente a equipe a fazer pelo próprio sistema.
2. Use APENAS as informações da base abaixo. Não invente dados, valores, horários ou preparos.
3. Quando o exame tiver PREPARO cadastrado, SEMPRE inclua o preparo na resposta.
4. Lembre-se que esta resposta é para uso INTERNO. NÃO repasse este conteúdo bruto para pacientes — para pacientes, a Nina do WhatsApp tem regras próprias mais restritas.

=== BASE DE DADOS DA CLÍNICA ===
${contextoTexto}
=== FIM DA BASE ===`;

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