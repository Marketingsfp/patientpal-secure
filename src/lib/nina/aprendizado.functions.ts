/**
 * Nina — aprendizado contínuo: funções chamadas pela tela
 * "Nina → Aprendizado". Toda escrita passa por usuário autenticado e por RLS
 * (`is_member`); aprovar/recusar ainda é barrado no banco para quem não é
 * administrador ou gestor da clínica.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TIPOS = [
  "FACT",
  "RULE",
  "WORKFLOW",
  "EXAMPLE",
  "ERROR_PATTERN",
  "KNOWLEDGE_GAP",
] as const;
const STATUS = ["PENDING", "APPROVED", "REJECTED", "ARCHIVED"] as const;

async function assertMembro(supabase: any, userId: string, clinicaId: string) {
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

/* ------------------------------------------------------------------ listar */

export const listarAprendizados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        status: z.enum(STATUS).optional(),
        busca: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMembro(supabase, userId, data.clinicaId);

    let q = supabase
      .from("nina_aprendizados")
      .select(
        "id, tipo, canal, titulo, conteudo, tags, status, confianca, versao, origem, valido_ate, usos, acertos, erros, created_at, updated_at",
      )
      .eq("clinica_id", data.clinicaId)
      .order("status")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.busca?.trim()) {
      const t = `%${data.busca.trim()}%`;
      q = q.or(`titulo.ilike.${t},conteudo.ilike.${t}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ------------------------------------------------------------------ salvar */

export const salvarAprendizado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().optional(),
        tipo: z.enum(TIPOS),
        canal: z.enum(["todos", "whatsapp", "interno"]).default("todos"),
        titulo: z.string().min(3).max(200),
        conteudo: z.string().min(3).max(4000),
        tags: z.array(z.string().max(40)).max(12).default([]),
        validoAte: z.string().datetime().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMembro(supabase, userId, data.clinicaId);

    const { anonimizar } = await import("@/lib/nina/aprendizado.server");
    const payload = {
      clinica_id: data.clinicaId,
      tipo: data.tipo,
      canal: data.canal,
      titulo: anonimizar(data.titulo),
      conteudo: anonimizar(data.conteudo),
      tags: data.tags,
      valido_ate: data.validoAte ?? null,
    };

    if (data.id) {
      const { error } = await supabase
        .from("nina_aprendizados")
        .update(payload)
        .eq("id", data.id)
        .eq("clinica_id", data.clinicaId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: novo, error } = await supabase
      .from("nina_aprendizados")
      .insert({ ...payload, status: "PENDING", origem: "manual", criado_por: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: novo.id as string };
  });

/* ------------------------------------------------------------- mudar status */

export const definirStatusAprendizado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid(),
        status: z.enum(STATUS),
        confianca: z.number().min(0).max(1).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMembro(supabase, userId, data.clinicaId);

    const patch: {
      status: string;
      confianca?: number;
      aprovado_por?: string;
      aprovado_em?: string;
    } = { status: data.status };
    if (data.confianca !== undefined) patch.confianca = data.confianca;
    if (data.status === "APPROVED") {
      patch.aprovado_por = userId;
      patch.aprovado_em = new Date().toISOString();
      if (data.confianca === undefined) patch.confianca = 0.8;
    }
    const { error } = await supabase
      .from("nina_aprendizados")
      .update(patch)
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------------------------------------------- feedback */

export const registrarFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        canal: z.enum(["whatsapp", "interno"]).default("interno"),
        conversaId: z.string().uuid().nullable().optional(),
        pergunta: z.string().min(1).max(4000),
        resposta: z.string().min(1).max(8000),
        avaliacao: z.union([z.literal(1), z.literal(-1)]),
        categoria: z
          .enum(["dado_errado", "tom", "incompleto", "fora_de_escopo", "regra_errada", "otimo", "outro"])
          .optional(),
        correcao: z.string().max(4000).optional(),
        /** Quando marcado, a correção vira sugestão de aprendizado (PENDING). */
        virarAprendizado: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMembro(supabase, userId, data.clinicaId);

    const { anonimizar } = await import("@/lib/nina/aprendizado.server");

    let aprendizadoId: string | null = null;
    if (data.virarAprendizado && data.correcao?.trim()) {
      const { data: novo, error: e1 } = await supabase
        .from("nina_aprendizados")
        .insert({
          clinica_id: data.clinicaId,
          tipo: data.avaliacao === -1 ? "ERROR_PATTERN" : "EXAMPLE",
          canal: "todos",
          titulo: anonimizar(data.pergunta).slice(0, 200),
          conteudo: anonimizar(
            `Quando perguntarem algo como: "${data.pergunta}" — responda assim: ${data.correcao}`,
          ).slice(0, 4000),
          status: "PENDING",
          origem: "feedback",
          confianca: 0.5,
          criado_por: userId,
        })
        .select("id")
        .single();
      if (e1) throw new Error(e1.message);
      aprendizadoId = novo.id as string;
    }

    const { error } = await supabase.from("nina_feedback").insert({
      clinica_id: data.clinicaId,
      canal: data.canal,
      conversa_id: data.conversaId ?? null,
      pergunta: anonimizar(data.pergunta).slice(0, 4000),
      resposta: anonimizar(data.resposta).slice(0, 8000),
      avaliacao: data.avaliacao,
      categoria: data.categoria ?? null,
      correcao: data.correcao ? anonimizar(data.correcao).slice(0, 4000) : null,
      aprendizado_id: aprendizadoId,
      criado_por: userId,
    });
    if (error) throw new Error(error.message);

    return { ok: true, aprendizadoId };
  });

/* ------------------------------------------------------------ estatísticas */

export const estatisticasAprendizado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMembro(supabase, userId, data.clinicaId);

    const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [aprR, fbR] = await Promise.all([
      supabase
        .from("nina_aprendizados")
        .select("status, usos")
        .eq("clinica_id", data.clinicaId),
      supabase
        .from("nina_feedback")
        .select("avaliacao, created_at")
        .eq("clinica_id", data.clinicaId)
        .gte("created_at", desde),
    ]);

    const aprs = aprR.data ?? [];
    const fbs = fbR.data ?? [];
    const positivos = fbs.filter((f: any) => f.avaliacao === 1).length;
    return {
      total: aprs.length,
      pendentes: aprs.filter((a: any) => a.status === "PENDING").length,
      aprovados: aprs.filter((a: any) => a.status === "APPROVED").length,
      usos: aprs.reduce((s: number, a: any) => s + (a.usos ?? 0), 0),
      feedback30d: fbs.length,
      satisfacao30d: fbs.length ? Math.round((positivos / fbs.length) * 100) : null,
    };
  });
