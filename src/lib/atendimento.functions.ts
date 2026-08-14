import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { loadWhatsAppConfig, metaSendText } from "./whatsapp.server";

/* =========================================================
 *  Helpers
 * ======================================================= */
async function assertMember(userId: string, clinicaId: string) {
  const { data, error } = await supabaseAdmin.rpc("is_member", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
}
async function assertManager(userId: string, clinicaId: string) {
  const { data, error } = await supabaseAdmin.rpc("can_manage_clinica", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas gestores/admins podem alterar isto");
}

const clinIdSchema = z.object({ clinicaId: z.string().uuid() });

/* =========================================================
 *  CONVERSAS
 * ======================================================= */
export const listarConversas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        status: z
          .enum(["bot_attending", "active", "waiting", "closed", "finished", "all"])
          .default("all"),
        busca: z.string().trim().max(120).optional(),
        canal: z.enum(["whatsapp", "instagram", "facebook", "webchat", "todos"]).default("todos"),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    let q = supabaseAdmin
      .from("atend_conversas")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("ultima_msg_em", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.canal !== "todos") q = q.eq("canal", data.canal);
    if (data.busca) {
      // Sanitiza para evitar injeção de filtros PostgREST via .or()
      // — remove operadores e separadores reservados.
      const safe = data.busca.replace(/[%_,.()'"\\:*]/g, "");
      if (safe.length > 0) {
        q = q.or(
          `contato_nome.ilike.%${safe}%,contato_telefone.ilike.%${safe}%,protocol_number.ilike.%${safe}%`,
        );
      }
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const atribuirConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        userId: z.string().uuid().nullable(),
        departamentoId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const patch: {
      atribuida_user_id: string | null;
      status: "active" | "waiting";
      departamento_id?: string | null;
    } = {
      atribuida_user_id: data.userId,
      status: data.userId ? "active" : "waiting",
    };
    if (data.departamentoId !== undefined) patch.departamento_id = data.departamentoId;
    const { error } = await supabaseAdmin
      .from("atend_conversas")
      .update(patch)
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const transferirConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        paraUserId: z.string().uuid().nullable().optional(),
        paraDepartamentoId: z.string().uuid().nullable().optional(),
        motivo: z.string().trim().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: conv, error: e1 } = await supabaseAdmin
      .from("atend_conversas")
      .select("atribuida_user_id, departamento_id")
      .eq("id", data.conversaId)
      .single();
    if (e1) throw new Error(e1.message);
    await supabaseAdmin.from("atend_transferencias").insert({
      clinica_id: data.clinicaId,
      conversa_id: data.conversaId,
      de_user_id: conv.atribuida_user_id,
      para_user_id: data.paraUserId ?? null,
      de_departamento_id: conv.departamento_id,
      para_departamento_id: data.paraDepartamentoId ?? null,
      motivo: data.motivo ?? null,
    });
    const { error: e2 } = await supabaseAdmin
      .from("atend_conversas")
      .update({
        atribuida_user_id: data.paraUserId ?? null,
        departamento_id: data.paraDepartamentoId ?? conv.departamento_id,
        status: data.paraUserId ? "active" : "waiting",
      })
      .eq("id", data.conversaId);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const fecharConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: prot } = await supabaseAdmin.rpc("atend_gerar_protocolo", {
      _clinica_id: data.clinicaId,
    });
    const { error } = await supabaseAdmin
      .from("atend_conversas")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        protocol_number: prot as string,
      })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);
    return { ok: true, protocol: prot as string };
  });

export const marcarLida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    await supabaseAdmin
      .from("atend_conversas")
      .update({ unread_count: 0 })
      .eq("id", data.conversaId);
    return { ok: true };
  });

/* =========================================================
 *  NOTAS INTERNAS
 * ======================================================= */
export const listarNotas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: rows, error } = await supabaseAdmin
      .from("atend_notas_internas")
      .select("*")
      .eq("conversa_id", data.conversaId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const criarNota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        conteudo: z.string().trim().min(1).max(2000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("nome")
      .eq("id", context.userId)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("atend_notas_internas").insert({
      clinica_id: data.clinicaId,
      conversa_id: data.conversaId,
      autor_user_id: context.userId,
      autor_nome: prof?.nome ?? null,
      conteudo: data.conteudo,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  DEPARTAMENTOS
 * ======================================================= */
export const listarDepartamentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: deps, error } = await supabaseAdmin
      .from("atend_departamentos")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("prioridade", { ascending: true })
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return deps ?? [];
  });

const DepartSchema = z.object({
  clinicaId: z.string().uuid(),
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(500).optional(),
  distribuicao: z.enum(["manual", "round_robin", "menor_carga"]).default("manual"),
  prioridade: z.number().int().min(0).max(999).default(0),
  ativo: z.boolean().default(true),
});

export const salvarDepartamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DepartSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const row = {
      clinica_id: data.clinicaId,
      nome: data.nome,
      descricao: data.descricao ?? null,
      distribuicao: data.distribuicao,
      prioridade: data.prioridade,
      ativo: data.ativo,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("atend_departamentos")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("atend_departamentos")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirDepartamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin
      .from("atend_departamentos")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  MEMBROS DE DEPARTAMENTO
 * ======================================================= */
export const listarMembros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ clinicaId: z.string().uuid(), departamentoId: z.string().uuid().optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    let q = supabaseAdmin
      .from("atend_departamento_membros")
      .select("*")
      .eq("clinica_id", data.clinicaId);
    if (data.departamentoId) q = q.eq("departamento_id", data.departamentoId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return [] as any[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, nome")
      .in("id", userIds);
    const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
    return rows.map((r: any) => ({ ...r, nome: nameById.get(r.user_id) ?? r.user_id }));
  });

export const adicionarMembro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        departamentoId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(["agente", "supervisor", "gestor", "admin"]).default("agente"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin.from("atend_departamento_membros").upsert(
      {
        clinica_id: data.clinicaId,
        departamento_id: data.departamentoId,
        user_id: data.userId,
        role: data.role,
      },
      { onConflict: "departamento_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removerMembro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin
      .from("atend_departamento_membros")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const travarMinhaFila = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), travada: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin
      .from("atend_departamento_membros")
      .update({ queue_locked: data.travada })
      .eq("clinica_id", data.clinicaId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const meuStatusAgente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: rows } = await supabaseAdmin
      .from("atend_departamento_membros")
      .select("queue_locked")
      .eq("clinica_id", data.clinicaId)
      .eq("user_id", context.userId);
    // se está em algum departamento e em ao menos um a fila está aberta, considera aberta
    const total = rows?.length ?? 0;
    const abertas = (rows ?? []).filter((r: any) => !r.queue_locked).length;
    return { isMember: total > 0, filaAberta: abertas > 0, totalDeptos: total };
  });

/* =========================================================
 *  BASE DE CONHECIMENTO
 * ======================================================= */
export const listarKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: rows, error } = await supabaseAdmin
      .from("atend_kb")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().optional(),
        titulo: z.string().trim().min(1).max(200),
        conteudo: z.string().trim().min(1).max(20000),
        categoria: z.string().trim().max(80).optional(),
        tags: z.array(z.string().trim().max(40)).max(20).default([]),
        publicado: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const row = {
      clinica_id: data.clinicaId,
      titulo: data.titulo,
      conteudo: data.conteudo,
      categoria: data.categoria ?? null,
      tags: data.tags,
      publicado: data.publicado,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("atend_kb").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("atend_kb")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin
      .from("atend_kb")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  MACROS
 * ======================================================= */
export const listarMacros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: rows, error } = await supabaseAdmin
      .from("atend_macros")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("atalho");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarMacro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().optional(),
        atalho: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[a-z0-9_-]+$/i, "Use letras, números, hífen ou underscore"),
        titulo: z.string().trim().min(1).max(120),
        conteudo: z.string().trim().min(1).max(4000),
        ativo: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const row = {
      clinica_id: data.clinicaId,
      atalho: data.atalho.toLowerCase(),
      titulo: data.titulo,
      conteudo: data.conteudo,
      ativo: data.ativo,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("atend_macros").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("atend_macros")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirMacro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin
      .from("atend_macros")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  MOTIVOS DE PAUSA + LOG
 * ======================================================= */
export const listarPauseReasons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: rows, error } = await supabaseAdmin
      .from("atend_pause_reasons")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("nome");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarPauseReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().optional(),
        nome: z.string().trim().min(1).max(80),
        cor: z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#6b7280"),
        icone: z.string().trim().max(40).optional(),
        tolerancia_minutos: z.number().int().min(0).max(480).default(5),
        conta_trabalhado: z.boolean().default(false),
        ativo: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const row = {
      clinica_id: data.clinicaId,
      nome: data.nome,
      cor: data.cor,
      icone: data.icone ?? null,
      tolerancia_minutos: data.tolerancia_minutos,
      conta_trabalhado: data.conta_trabalhado,
      ativo: data.ativo,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("atend_pause_reasons")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("atend_pause_reasons")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirPauseReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin
      .from("atend_pause_reasons")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const iniciarPausa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), reasonId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    // fecha pausas abertas
    await supabaseAdmin
      .from("atend_pausas_log")
      .update({ finalizada_em: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("finalizada_em", null);
    const { data: ins, error } = await supabaseAdmin
      .from("atend_pausas_log")
      .insert({
        clinica_id: data.clinicaId,
        user_id: context.userId,
        reason_id: data.reasonId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id };
  });

export const finalizarPausa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin
      .from("atend_pausas_log")
      .update({ finalizada_em: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("finalizada_em", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const pausaAtual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: row } = await supabaseAdmin
      .from("atend_pausas_log")
      .select("*, atend_pause_reasons(nome, cor, tolerancia_minutos)")
      .eq("user_id", context.userId)
      .is("finalizada_em", null)
      .order("iniciada_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    return row ?? null;
  });

/* =========================================================
 *  HORÁRIOS
 * ======================================================= */
export const listarHorarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: rows, error } = await supabaseAdmin
      .from("atend_horarios")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("dia_semana")
      .order("hora_inicio");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().optional(),
        dia_semana: z.number().int().min(0).max(6),
        hora_inicio: z.string().regex(/^\d{2}:\d{2}$/),
        hora_fim: z.string().regex(/^\d{2}:\d{2}$/),
        canal: z.enum(["whatsapp", "telefonia", "todos"]).default("whatsapp"),
        ativo: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const row = {
      clinica_id: data.clinicaId,
      dia_semana: data.dia_semana,
      hora_inicio: data.hora_inicio,
      hora_fim: data.hora_fim,
      canal: data.canal,
      ativo: data.ativo,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("atend_horarios").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("atend_horarios")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin
      .from("atend_horarios")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  NÚMEROS AUTORIZADOS
 * ======================================================= */
export const listarNumerosAutorizados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: rows, error } = await supabaseAdmin
      .from("atend_numeros_autorizados")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("telefone");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adicionarNumero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        telefone: z
          .string()
          .trim()
          .min(8)
          .max(20)
          .regex(/^\+?\d+$/),
        nota: z.string().trim().max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin.from("atend_numeros_autorizados").insert({
      clinica_id: data.clinicaId,
      telefone: data.telefone,
      nota: data.nota ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removerNumero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin
      .from("atend_numeros_autorizados")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  PROTOCOLO CONFIG
 * ======================================================= */
export const obterProtocoloConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    await supabaseAdmin
      .from("atend_protocolo_config")
      .upsert({ clinica_id: data.clinicaId }, { onConflict: "clinica_id", ignoreDuplicates: true });
    const { data: row, error } = await supabaseAdmin
      .from("atend_protocolo_config")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const salvarProtocoloConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        prefixo: z.string().trim().min(1).max(10),
        formato: z.enum(["ANO-SEQ", "ANOMES-SEQ", "SEQ"]),
        zerar_anualmente: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin.from("atend_protocolo_config").upsert(
      {
        clinica_id: data.clinicaId,
        prefixo: data.prefixo.toUpperCase(),
        formato: data.formato,
        zerar_anualmente: data.zerar_anualmente,
      },
      { onConflict: "clinica_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  BOT CONFIGS
 * ======================================================= */
export const listarBotConfigs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: rows, error } = await supabaseAdmin
      .from("atend_bot_configs")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarBotConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().optional(),
        departamentoId: z.string().uuid().nullable().optional(),
        bot_type: z.enum(["menu", "ai", "both"]).default("ai"),
        welcome_message: z.string().trim().max(2000).optional(),
        menu_options: z
          .array(
            z.object({
              key: z.string().trim().max(10),
              label: z.string().trim().max(120),
              departamento_id: z.string().uuid().optional(),
            }),
          )
          .max(20)
          .default([]),
        ai_prompt: z.string().trim().max(8000).optional(),
        ai_model: z.string().trim().max(80).default("google/gemini-3-flash-preview"),
        max_ai_interactions: z.number().int().min(1).max(50).default(5),
        fallback_departamento_id: z.string().uuid().nullable().optional(),
        ativo: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const row = {
      clinica_id: data.clinicaId,
      departamento_id: data.departamentoId ?? null,
      bot_type: data.bot_type,
      welcome_message: data.welcome_message ?? null,
      menu_options: data.menu_options,
      ai_prompt: data.ai_prompt ?? null,
      ai_model: data.ai_model,
      max_ai_interactions: data.max_ai_interactions,
      fallback_departamento_id: data.fallback_departamento_id ?? null,
      ativo: data.ativo,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("atend_bot_configs").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("atend_bot_configs")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

/* =========================================================
 *  USUÁRIOS DA CLÍNICA (para selects)
 * ======================================================= */
export const listarUsuariosClinica = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: rows, error } = await supabaseAdmin
      .from("clinica_memberships")
      .select("user_id, role")
      .eq("clinica_id", data.clinicaId)
      .eq("ativo", true);
    if (error) throw new Error(error.message);
    const userIds = (rows ?? []).map((r: any) => r.user_id);
    const { data: profs } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, nome").in("id", userIds)
      : { data: [] as any[] };
    const nomeMap = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
    return (rows ?? []).map((r: any) => ({
      user_id: r.user_id,
      role: r.role,
      nome: nomeMap.get(r.user_id) ?? r.user_id,
    }));
  });

/* =========================================================
 *  PAINEL — métricas do dia
 * ======================================================= */
export const dashboardAtendimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const isoHoje = hoje.toISOString();
    const [
      { count: hojeCount },
      { count: ativas },
      { count: espera },
      { count: fechadas },
      { data: csatRows },
    ] = await Promise.all([
      supabaseAdmin
        .from("atend_conversas")
        .select("id", { count: "exact", head: true })
        .eq("clinica_id", data.clinicaId)
        .gte("created_at", isoHoje),
      supabaseAdmin
        .from("atend_conversas")
        .select("id", { count: "exact", head: true })
        .eq("clinica_id", data.clinicaId)
        .eq("status", "active"),
      supabaseAdmin
        .from("atend_conversas")
        .select("id", { count: "exact", head: true })
        .eq("clinica_id", data.clinicaId)
        .eq("status", "waiting"),
      supabaseAdmin
        .from("atend_conversas")
        .select("id", { count: "exact", head: true })
        .eq("clinica_id", data.clinicaId)
        .eq("status", "closed")
        .gte("closed_at", isoHoje),
      supabaseAdmin
        .from("atend_avaliacoes")
        .select("nota")
        .eq("clinica_id", data.clinicaId)
        .gte("created_at", isoHoje),
    ]);
    const csat = (csatRows ?? []).length
      ? (csatRows!.reduce((s: number, r: any) => s + r.nota, 0) / csatRows!.length).toFixed(2)
      : null;
    return {
      conversas_hoje: hojeCount ?? 0,
      ativas: ativas ?? 0,
      em_espera: espera ?? 0,
      fechadas_hoje: fechadas ?? 0,
      csat_hoje: csat,
    };
  });

/* =========================================================
 *  INBOX — mensagens, envio, contato
 * ======================================================= */
export const listarMensagensConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: rows, error } = await supabaseAdmin
      .from("whatsapp_mensagens")
      .select(
        "id, direction, from_number, to_number, body, tipo, enviada_por, recebida_em, media_url, media_mime, status",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("conversa_id", data.conversaId)
      .order("recebida_em", { ascending: true })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const enviarMensagemConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        text: z.string().trim().min(1).max(3500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const cfg = await loadWhatsAppConfig(data.clinicaId);
    if (!cfg?.phone_number_id || !cfg?.access_token) throw new Error("WhatsApp não configurado.");
    const { data: conv, error: cErr } = await supabaseAdmin
      .from("atend_conversas")
      .select("id, contato_telefone, primeiro_resp_em, aguardando_desde, atribuida_user_id")
      .eq("id", data.conversaId)
      .single();
    if (cErr || !conv) throw new Error("Conversa não encontrada");
    if (!conv.contato_telefone) throw new Error("Conversa sem telefone");

    const to = conv.contato_telefone.startsWith("+")
      ? conv.contato_telefone
      : `+${conv.contato_telefone}`;
    const { wa_message_id } = await metaSendText(
      cfg.phone_number_id,
      cfg.access_token,
      to,
      data.text,
    );

    await supabaseAdmin.from("whatsapp_mensagens").insert({
      clinica_id: data.clinicaId,
      conversa_id: data.conversaId,
      wa_message_id,
      direction: "out",
      from_number: cfg.display_phone_number,
      to_number: to,
      body: data.text,
      tipo: "text",
      status: "sent",
      enviada_por: "humano",
    });

    // SLA primeira resposta
    const patch: any = {
      atribuida_user_id: conv.atribuida_user_id ?? context.userId,
      status: "active",
    };
    if (!conv.primeiro_resp_em) {
      const ref = conv.aguardando_desde ?? conv.primeiro_resp_em;
      patch.primeiro_resp_em = new Date().toISOString();
      if (ref) {
        patch.sla_first_response_seg = Math.max(
          0,
          Math.round((Date.now() - new Date(ref).getTime()) / 1000),
        );
      }
    }
    await supabaseAdmin.from("atend_conversas").update(patch).eq("id", data.conversaId);

    return { ok: true, wa_message_id };
  });

export const obterDadosContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: conv } = await supabaseAdmin
      .from("atend_conversas")
      .select("*, atend_departamentos(nome)")
      .eq("id", data.conversaId)
      .single();
    if (!conv) throw new Error("Conversa não encontrada");

    let paciente: any = null;
    let agendamentos: any[] = [];
    let contratos: any[] = [];
    const pendencias: any = null;

    if (conv.contato_paciente_id) {
      const { data: p } = await supabaseAdmin
        .from("pacientes")
        .select("id, nome, telefone, email, cpf, data_nascimento, sexo, cidade, estado")
        .eq("id", conv.contato_paciente_id)
        .single();
      paciente = p;
    } else if (conv.contato_telefone) {
      const digits = conv.contato_telefone.replace(/\D/g, "");
      const { data: p } = await supabaseAdmin
        .from("pacientes")
        .select("id, nome, telefone, email, cpf, data_nascimento, sexo, cidade, estado")
        .eq("clinica_id", data.clinicaId)
        .ilike("telefone", `%${digits.slice(-8)}%`)
        .limit(1)
        .maybeSingle();
      paciente = p;
    }

    if (paciente?.id) {
      const [agR, ctR] = await Promise.all([
        supabaseAdmin
          .from("agendamentos")
          .select("id, inicio, procedimento, status, medico_nome")
          .eq("paciente_id", paciente.id)
          .order("inicio", { ascending: false })
          .limit(5),
        supabaseAdmin
          .from("contratos_assinatura")
          .select("id, numero, status, data_inicio")
          .eq("paciente_id", paciente.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      agendamentos = agR.data ?? [];
      contratos = ctR.data ?? [];
    }

    const { data: atribuidoProfile } = conv.atribuida_user_id
      ? await supabaseAdmin
          .from("profiles")
          .select("nome")
          .eq("id", conv.atribuida_user_id)
          .maybeSingle()
      : { data: null };

    return {
      conversa: conv,
      paciente,
      agendamentos,
      contratos,
      atribuido_nome: atribuidoProfile?.nome ?? null,
    };
  });

/* =========================================================
 *  ROUND-ROBIN — auto-atribuição
 * ======================================================= */
export const autoAtribuirRoundRobin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        departamentoId: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);

    // Pega departamento alvo
    let deptId = data.departamentoId;
    if (!deptId) {
      const { data: c } = await supabaseAdmin
        .from("atend_conversas")
        .select("departamento_id")
        .eq("id", data.conversaId)
        .single();
      deptId = c?.departamento_id ?? undefined;
    }
    if (!deptId) throw new Error("Conversa sem departamento — configure roteamento.");

    // Membros disponíveis (não em pausa, fila desbloqueada)
    const { data: membros } = await supabaseAdmin
      .from("atend_departamento_membros")
      .select("user_id, max_simultaneas, queue_locked")
      .eq("clinica_id", data.clinicaId)
      .eq("departamento_id", deptId)
      .eq("queue_locked", false);
    if (!membros || membros.length === 0) {
      // fica em waiting na fila do departamento
      await supabaseAdmin
        .from("atend_conversas")
        .update({
          departamento_id: deptId,
          status: "waiting",
          aguardando_desde: new Date().toISOString(),
        })
        .eq("id", data.conversaId);
      return { ok: false, motivo: "Sem agentes disponíveis" };
    }

    // Filtra em pausa
    const agora = new Date().toISOString();
    const { data: pausados } = await supabaseAdmin
      .from("atend_pausas_log")
      .select("user_id")
      .is("fim", null)
      .eq("clinica_id", data.clinicaId);
    const pausadosSet = new Set((pausados ?? []).map((p: any) => p.user_id));

    // Carga atual
    const userIds = membros.map((m: any) => m.user_id).filter((u: string) => !pausadosSet.has(u));
    if (userIds.length === 0) {
      await supabaseAdmin
        .from("atend_conversas")
        .update({
          departamento_id: deptId,
          status: "waiting",
          aguardando_desde: agora,
        })
        .eq("id", data.conversaId);
      return { ok: false, motivo: "Todos em pausa" };
    }
    const { data: cargas } = await supabaseAdmin
      .from("atend_conversas")
      .select("atribuida_user_id")
      .eq("clinica_id", data.clinicaId)
      .in("status", ["active", "waiting"])
      .in("atribuida_user_id", userIds);
    const cargaMap = new Map<string, number>();
    for (const u of userIds) cargaMap.set(u, 0);
    for (const r of cargas ?? []) {
      const k = (r as any).atribuida_user_id;
      cargaMap.set(k, (cargaMap.get(k) ?? 0) + 1);
    }
    const membroMap = new Map((membros ?? []).map((m: any) => [m.user_id, m]));
    let best: string | null = null;
    let bestCarga = Infinity;
    for (const u of userIds) {
      const carga = cargaMap.get(u) ?? 0;
      const max = (membroMap.get(u) as any)?.max_simultaneas ?? 5;
      if (carga >= max) continue;
      if (carga < bestCarga) {
        best = u;
        bestCarga = carga;
      }
    }
    if (!best) {
      await supabaseAdmin
        .from("atend_conversas")
        .update({
          departamento_id: deptId,
          status: "waiting",
          aguardando_desde: agora,
        })
        .eq("id", data.conversaId);
      return { ok: false, motivo: "Capacidade lotada" };
    }
    await supabaseAdmin
      .from("atend_conversas")
      .update({
        departamento_id: deptId,
        atribuida_user_id: best,
        status: "active",
      })
      .eq("id", data.conversaId);
    return { ok: true, user_id: best };
  });

/* =========================================================
 *  ROUTING RULES
 * ======================================================= */
export const listarRoutingRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: rows, error } = await supabaseAdmin
      .from("atend_routing_rules")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("ordem");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarRoutingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().optional(),
        nome: z.string().trim().min(1).max(120),
        ordem: z.number().int().min(0).max(999).default(0),
        ativo: z.boolean().default(true),
        canal: z.string().max(20).optional().nullable(),
        palavras_chave: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
        horario_inicio: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional()
          .nullable(),
        horario_fim: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional()
          .nullable(),
        dias_semana: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5, 6, 7]),
        departamento_id: z.string().uuid().optional().nullable(),
        mensagem_auto: z.string().max(1000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { id, clinicaId, ...rest } = data;
    if (id) {
      const { error } = await supabaseAdmin
        .from("atend_routing_rules")
        .update(rest)
        .eq("id", id)
        .eq("clinica_id", clinicaId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("atend_routing_rules")
        .insert({ clinica_id: clinicaId, ...rest });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const excluirRoutingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin
      .from("atend_routing_rules")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  SUPERVISOR — visão geral em tempo real
 * ======================================================= */
export const supervisaoLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: convs } = await supabaseAdmin
      .from("atend_conversas")
      .select(
        "id, status, contato_nome, contato_telefone, ultima_msg_em, ultima_msg_preview, aguardando_desde, atribuida_user_id, departamento_id, sla_first_response_seg, unread_count",
      )
      .eq("clinica_id", data.clinicaId)
      .in("status", ["active", "waiting", "bot_attending"])
      .order("ultima_msg_em", { ascending: false })
      .limit(300);

    const userIds = Array.from(
      new Set((convs ?? []).map((c: any) => c.atribuida_user_id).filter(Boolean)),
    );
    const deptIds = Array.from(
      new Set((convs ?? []).map((c: any) => c.departamento_id).filter(Boolean)),
    );
    const [{ data: profs }, { data: depts }, { data: pausas }] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, nome").in("id", userIds)
        : Promise.resolve({ data: [] }),
      deptIds.length
        ? supabaseAdmin.from("atend_departamentos").select("id, nome").in("id", deptIds)
        : Promise.resolve({ data: [] }),
      supabaseAdmin
        .from("atend_pausas_log")
        .select("user_id, motivo, inicio")
        .is("fim", null)
        .eq("clinica_id", data.clinicaId),
    ]);
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
    const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.nome]));
    const pausaMap = new Map((pausas ?? []).map((p: any) => [p.user_id, p]));

    return (convs ?? []).map((c: any) => ({
      ...c,
      agente_nome: c.atribuida_user_id ? (profMap.get(c.atribuida_user_id) ?? null) : null,
      agente_em_pausa: c.atribuida_user_id ? pausaMap.has(c.atribuida_user_id) : false,
      departamento_nome: c.departamento_id ? (deptMap.get(c.departamento_id) ?? null) : null,
    }));
  });

/* =========================================================
 *  RELATÓRIOS — métricas por período
 * ======================================================= */
export const relatorioAtendimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        de: z.string(),
        ate: z.string(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const [{ data: convs }, { data: avals }, { data: pausasLog }] = await Promise.all([
      supabaseAdmin
        .from("atend_conversas")
        .select(
          "id, status, departamento_id, atribuida_user_id, created_at, closed_at, sla_first_response_seg",
        )
        .eq("clinica_id", data.clinicaId)
        .gte("created_at", data.de)
        .lte("created_at", data.ate),
      supabaseAdmin
        .from("atend_avaliacoes")
        .select("nota, created_at")
        .eq("clinica_id", data.clinicaId)
        .gte("created_at", data.de)
        .lte("created_at", data.ate),
      supabaseAdmin
        .from("atend_pausas_log")
        .select("user_id, motivo, inicio, fim")
        .eq("clinica_id", data.clinicaId)
        .gte("inicio", data.de)
        .lte("inicio", data.ate),
    ]);

    const userIds = Array.from(
      new Set((convs ?? []).map((c: any) => c.atribuida_user_id).filter(Boolean)),
    );
    const deptIds = Array.from(
      new Set((convs ?? []).map((c: any) => c.departamento_id).filter(Boolean)),
    );
    const [{ data: profs }, { data: depts }] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, nome").in("id", userIds)
        : Promise.resolve({ data: [] }),
      deptIds.length
        ? supabaseAdmin.from("atend_departamentos").select("id, nome").in("id", deptIds)
        : Promise.resolve({ data: [] }),
    ]);
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
    const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.nome]));

    const totais = {
      conversas: (convs ?? []).length,
      fechadas: (convs ?? []).filter((c: any) => c.status === "closed").length,
      ativas: (convs ?? []).filter((c: any) => c.status === "active").length,
      espera: (convs ?? []).filter((c: any) => c.status === "waiting").length,
      sla_medio_seg: (() => {
        const arr = (convs ?? [])
          .map((c: any) => c.sla_first_response_seg)
          .filter((v: any) => v != null);
        return arr.length
          ? Math.round(arr.reduce((s: number, v: number) => s + v, 0) / arr.length)
          : null;
      })(),
      csat: (() => {
        const arr = (avals ?? []).map((a: any) => a.nota);
        return arr.length
          ? Number((arr.reduce((s: number, v: number) => s + v, 0) / arr.length).toFixed(2))
          : null;
      })(),
    };

    type AgRow = {
      user_id: string;
      nome: string;
      conversas: number;
      fechadas: number;
      sla_seg: number[];
    };
    const porAgente = new Map<string, AgRow>();
    for (const c of convs ?? []) {
      const uid = (c as any).atribuida_user_id;
      if (!uid) continue;
      const row: AgRow = porAgente.get(uid) ?? {
        user_id: uid,
        nome: profMap.get(uid) ?? uid,
        conversas: 0,
        fechadas: 0,
        sla_seg: [],
      };
      row.conversas += 1;
      if ((c as any).status === "closed") row.fechadas += 1;
      if ((c as any).sla_first_response_seg != null)
        row.sla_seg.push(Number((c as any).sla_first_response_seg));
      porAgente.set(uid, row);
    }
    const agentes = Array.from(porAgente.values())
      .map((r) => ({
        user_id: r.user_id,
        nome: r.nome,
        conversas: r.conversas,
        fechadas: r.fechadas,
        sla_medio: r.sla_seg.length
          ? Math.round(r.sla_seg.reduce((s, v) => s + v, 0) / r.sla_seg.length)
          : null,
      }))
      .sort((a, b) => b.conversas - a.conversas);

    const porDept = new Map<
      string,
      { id: string; nome: string; conversas: number; fechadas: number }
    >();
    for (const c of convs ?? []) {
      const did = (c as any).departamento_id;
      if (!did) continue;
      const row = porDept.get(did) ?? {
        id: did,
        nome: deptMap.get(did) ?? "—",
        conversas: 0,
        fechadas: 0,
      };
      row.conversas += 1;
      if ((c as any).status === "closed") row.fechadas += 1;
      porDept.set(did, row);
    }
    const departamentos = Array.from(porDept.values()).sort((a, b) => b.conversas - a.conversas);

    return { totais, agentes, departamentos };
  });
