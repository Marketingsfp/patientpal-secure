import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

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
    z.object({
      clinicaId: z.string().uuid(),
      status: z.enum(["bot_attending", "active", "waiting", "closed", "finished", "all"]).default("all"),
      busca: z.string().trim().max(120).optional(),
      canal: z.enum(["whatsapp", "instagram", "facebook", "webchat", "todos"]).default("todos"),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(i),
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
    if (data.busca) q = q.or(`contato_nome.ilike.%${data.busca}%,contato_telefone.ilike.%${data.busca}%,protocol_number.ilike.%${data.busca}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const atribuirConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      clinicaId: z.string().uuid(),
      conversaId: z.string().uuid(),
      userId: z.string().uuid().nullable(),
      departamentoId: z.string().uuid().nullable().optional(),
    }).parse(i),
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
    z.object({
      clinicaId: z.string().uuid(),
      conversaId: z.string().uuid(),
      paraUserId: z.string().uuid().nullable().optional(),
      paraDepartamentoId: z.string().uuid().nullable().optional(),
      motivo: z.string().trim().max(500).optional(),
    }).parse(i),
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
    z.object({
      clinicaId: z.string().uuid(),
      conversaId: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: prot } = await supabaseAdmin.rpc("atend_gerar_protocolo", { _clinica_id: data.clinicaId });
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
    await supabaseAdmin.from("atend_conversas").update({ unread_count: 0 }).eq("id", data.conversaId);
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
    z.object({
      clinicaId: z.string().uuid(),
      conversaId: z.string().uuid(),
      conteudo: z.string().trim().min(1).max(2000),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: prof } = await supabaseAdmin.from("profiles").select("nome").eq("id", context.userId).maybeSingle();
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
      const { error } = await supabaseAdmin.from("atend_departamentos").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin.from("atend_departamentos").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirDepartamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin.from("atend_departamentos").delete().eq("id", data.id).eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  MEMBROS DE DEPARTAMENTO
 * ======================================================= */
export const listarMembros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), departamentoId: z.string().uuid().optional() }).parse(i),
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
    const { data: profs } = await supabaseAdmin.from("profiles").select("id, nome").in("id", userIds);
    const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
    return rows.map((r: any) => ({ ...r, nome: nameById.get(r.user_id) ?? r.user_id }));
  });

export const adicionarMembro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      clinicaId: z.string().uuid(),
      departamentoId: z.string().uuid(),
      userId: z.string().uuid(),
      role: z.enum(["agente", "supervisor", "gestor", "admin"]).default("agente"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin
      .from("atend_departamento_membros")
      .upsert({
        clinica_id: data.clinicaId,
        departamento_id: data.departamentoId,
        user_id: data.userId,
        role: data.role,
      }, { onConflict: "departamento_id,user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removerMembro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin
      .from("atend_departamento_membros").delete()
      .eq("id", data.id).eq("clinica_id", data.clinicaId);
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

/* =========================================================
 *  BASE DE CONHECIMENTO
 * ======================================================= */
export const listarKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: rows, error } = await supabaseAdmin
      .from("atend_kb").select("*")
      .eq("clinica_id", data.clinicaId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      clinicaId: z.string().uuid(),
      id: z.string().uuid().optional(),
      titulo: z.string().trim().min(1).max(200),
      conteudo: z.string().trim().min(1).max(20000),
      categoria: z.string().trim().max(80).optional(),
      tags: z.array(z.string().trim().max(40)).max(20).default([]),
      publicado: z.boolean().default(true),
    }).parse(i),
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
    const { data: ins, error } = await supabaseAdmin.from("atend_kb").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin.from("atend_kb").delete().eq("id", data.id).eq("clinica_id", data.clinicaId);
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
      .from("atend_macros").select("*")
      .eq("clinica_id", data.clinicaId)
      .order("atalho");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarMacro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      clinicaId: z.string().uuid(),
      id: z.string().uuid().optional(),
      atalho: z.string().trim().min(1).max(40).regex(/^[a-z0-9_-]+$/i, "Use letras, números, hífen ou underscore"),
      titulo: z.string().trim().min(1).max(120),
      conteudo: z.string().trim().min(1).max(4000),
      ativo: z.boolean().default(true),
    }).parse(i),
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
    const { data: ins, error } = await supabaseAdmin.from("atend_macros").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirMacro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin.from("atend_macros").delete().eq("id", data.id).eq("clinica_id", data.clinicaId);
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
      .from("atend_pause_reasons").select("*")
      .eq("clinica_id", data.clinicaId).order("nome");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarPauseReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      clinicaId: z.string().uuid(),
      id: z.string().uuid().optional(),
      nome: z.string().trim().min(1).max(80),
      cor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default("#6b7280"),
      icone: z.string().trim().max(40).optional(),
      tolerancia_minutos: z.number().int().min(0).max(480).default(5),
      conta_trabalhado: z.boolean().default(false),
      ativo: z.boolean().default(true),
    }).parse(i),
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
      const { error } = await supabaseAdmin.from("atend_pause_reasons").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin.from("atend_pause_reasons").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirPauseReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin.from("atend_pause_reasons").delete().eq("id", data.id).eq("clinica_id", data.clinicaId);
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
    await supabaseAdmin.from("atend_pausas_log")
      .update({ finalizada_em: new Date().toISOString() })
      .eq("user_id", context.userId).is("finalizada_em", null);
    const { data: ins, error } = await supabaseAdmin.from("atend_pausas_log").insert({
      clinica_id: data.clinicaId,
      user_id: context.userId,
      reason_id: data.reasonId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins!.id };
  });

export const finalizarPausa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin.from("atend_pausas_log")
      .update({ finalizada_em: new Date().toISOString() })
      .eq("user_id", context.userId).is("finalizada_em", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const pausaAtual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.clinicaId);
    const { data: row } = await supabaseAdmin.from("atend_pausas_log")
      .select("*, atend_pause_reasons(nome, cor, tolerancia_minutos)")
      .eq("user_id", context.userId).is("finalizada_em", null)
      .order("iniciada_em", { ascending: false }).limit(1).maybeSingle();
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
      .from("atend_horarios").select("*")
      .eq("clinica_id", data.clinicaId).order("dia_semana").order("hora_inicio");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      clinicaId: z.string().uuid(),
      id: z.string().uuid().optional(),
      dia_semana: z.number().int().min(0).max(6),
      hora_inicio: z.string().regex(/^\d{2}:\d{2}$/),
      hora_fim: z.string().regex(/^\d{2}:\d{2}$/),
      canal: z.enum(["whatsapp", "telefonia", "todos"]).default("whatsapp"),
      ativo: z.boolean().default(true),
    }).parse(i),
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
    const { data: ins, error } = await supabaseAdmin.from("atend_horarios").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin.from("atend_horarios").delete().eq("id", data.id).eq("clinica_id", data.clinicaId);
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
      .from("atend_numeros_autorizados").select("*")
      .eq("clinica_id", data.clinicaId).order("telefone");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adicionarNumero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      clinicaId: z.string().uuid(),
      telefone: z.string().trim().min(8).max(20).regex(/^\+?\d+$/),
      nota: z.string().trim().max(200).optional(),
    }).parse(i),
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
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin.from("atend_numeros_autorizados").delete().eq("id", data.id).eq("clinica_id", data.clinicaId);
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
    await supabaseAdmin.from("atend_protocolo_config")
      .upsert({ clinica_id: data.clinicaId }, { onConflict: "clinica_id", ignoreDuplicates: true });
    const { data: row, error } = await supabaseAdmin
      .from("atend_protocolo_config").select("*").eq("clinica_id", data.clinicaId).single();
    if (error) throw new Error(error.message);
    return row;
  });

export const salvarProtocoloConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      clinicaId: z.string().uuid(),
      prefixo: z.string().trim().min(1).max(10),
      formato: z.enum(["ANO-SEQ", "ANOMES-SEQ", "SEQ"]),
      zerar_anualmente: z.boolean(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { error } = await supabaseAdmin.from("atend_protocolo_config").upsert({
      clinica_id: data.clinicaId,
      prefixo: data.prefixo.toUpperCase(),
      formato: data.formato,
      zerar_anualmente: data.zerar_anualmente,
    }, { onConflict: "clinica_id" });
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
      .from("atend_bot_configs").select("*")
      .eq("clinica_id", data.clinicaId).order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarBotConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      clinicaId: z.string().uuid(),
      id: z.string().uuid().optional(),
      departamentoId: z.string().uuid().nullable().optional(),
      bot_type: z.enum(["menu", "ai", "both"]).default("ai"),
      welcome_message: z.string().trim().max(2000).optional(),
      menu_options: z.array(z.object({
        key: z.string().trim().max(10),
        label: z.string().trim().max(120),
        departamento_id: z.string().uuid().optional(),
      })).max(20).default([]),
      ai_prompt: z.string().trim().max(8000).optional(),
      ai_model: z.string().trim().max(80).default("google/gemini-3-flash-preview"),
      max_ai_interactions: z.number().int().min(1).max(50).default(5),
      fallback_departamento_id: z.string().uuid().nullable().optional(),
      ativo: z.boolean().default(true),
    }).parse(i),
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
    const { data: ins, error } = await supabaseAdmin.from("atend_bot_configs").insert(row).select("id").single();
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
      .select("user_id, role, profiles!inner(nome)")
      .eq("clinica_id", data.clinicaId)
      .eq("ativo", true);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      user_id: r.user_id,
      role: r.role,
      nome: r.profiles?.nome ?? r.user_id,
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
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const isoHoje = hoje.toISOString();
    const [{ count: hojeCount }, { count: ativas }, { count: espera }, { count: fechadas }, { data: csatRows }] = await Promise.all([
      supabaseAdmin.from("atend_conversas").select("id", { count: "exact", head: true })
        .eq("clinica_id", data.clinicaId).gte("created_at", isoHoje),
      supabaseAdmin.from("atend_conversas").select("id", { count: "exact", head: true })
        .eq("clinica_id", data.clinicaId).eq("status", "active"),
      supabaseAdmin.from("atend_conversas").select("id", { count: "exact", head: true })
        .eq("clinica_id", data.clinicaId).eq("status", "waiting"),
      supabaseAdmin.from("atend_conversas").select("id", { count: "exact", head: true })
        .eq("clinica_id", data.clinicaId).eq("status", "closed").gte("closed_at", isoHoje),
      supabaseAdmin.from("atend_avaliacoes").select("nota").eq("clinica_id", data.clinicaId).gte("created_at", isoHoje),
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