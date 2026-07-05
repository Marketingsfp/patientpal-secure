import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const ROLES = ["admin", "gestor", "medico", "enfermeiro", "recepcao", "caixa", "financeiro"] as const;

async function assertManager(userId: string, clinicaId: string) {
  const { data, error } = await supabaseAdmin.rpc("can_manage_clinica", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem permissão para gerenciar a equipe desta clínica");
}

async function assertUserBelongsToClinica(userId: string, clinicaId: string) {
  const { data, error } = await supabaseAdmin
    .from("clinica_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Usuário não pertence a esta clínica");
}

export const listarEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const { supabase } = context;
    const { data: mems, error } = await supabase
      .from("clinica_memberships")
      .select("id, role, user_id, ativo, created_at")
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);

    const ids = (mems ?? []).map((m: any) => m.user_id);
    if (ids.length === 0) return [];

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, nome")
      .in("id", ids);
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p.nome]));

    // Fetch emails via admin
    const emails = new Map<string, string>();
    await Promise.all(
      ids.map(async (uid: string) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (u?.user?.email) emails.set(uid, u.user.email);
      }),
    );

    return (mems ?? []).map((m: any) => ({
      ...m,
      nome: profMap.get(m.user_id) ?? null,
      email: emails.get(m.user_id) ?? null,
    }));
  });

export const cadastrarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      clinicaId: z.string().uuid(),
      email: z.string().email(),
      password: z.string().min(6).max(100),
      nome: z.string().min(2).max(120),
      role: z.enum(ROLES),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);

    // Check if user already exists by email
    let userId: string | null = null;
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { nome: data.nome },
      });
      if (cErr) throw new Error(cErr.message);
      userId = created.user!.id;
    }

    // Ensure profile exists / updated
    await supabaseAdmin.from("profiles").upsert({ id: userId!, nome: data.nome });

    // Insert membership (or reactivate)
    const { data: existingMem } = await supabaseAdmin
      .from("clinica_memberships")
      .select("id")
      .eq("user_id", userId!)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();

    if (existingMem) {
      const { error } = await supabaseAdmin
        .from("clinica_memberships")
        .update({ role: data.role, ativo: true })
        .eq("id", existingMem.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("clinica_memberships")
        .insert({ user_id: userId!, clinica_id: data.clinicaId, role: data.role, ativo: true });
      if (error) throw new Error(error.message);
    }

    return { ok: true, userId };
  });

export const editarMembro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      clinicaId: z.string().uuid(),
      membershipId: z.string().uuid(),
      role: z.enum(ROLES),
      ativo: z.boolean(),
      nome: z.string().min(2).max(120).optional(),
      novaSenha: z.string().min(6).max(100).optional().or(z.literal("")),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);

    const { data: mem, error: mErr } = await supabaseAdmin
      .from("clinica_memberships")
      .select("id, user_id, clinica_id")
      .eq("id", data.membershipId)
      .single();
    if (mErr || !mem) throw new Error("Membro não encontrado");
    if (mem.clinica_id !== data.clinicaId) throw new Error("Membro não pertence a esta clínica");

    const { error: upErr } = await supabaseAdmin
      .from("clinica_memberships")
      .update({ role: data.role, ativo: data.ativo })
      .eq("id", data.membershipId);
    if (upErr) throw new Error(upErr.message);

    if (data.nome) {
      await supabaseAdmin.from("profiles").upsert({ id: mem.user_id, nome: data.nome });
    }

    if (data.novaSenha && data.novaSenha.length >= 6) {
      const { error: pErr } = await supabaseAdmin.auth.admin.updateUserById(mem.user_id, {
        password: data.novaSenha,
      });
      if (pErr) throw new Error(pErr.message);
    }

    return { ok: true };
  });

export const getFuncionarioLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      clinicaId: z.string().uuid(),
      userId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    await assertUserBelongsToClinica(data.userId, data.clinicaId);
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    return { email: u?.user?.email ?? null };
  });

export const definirSenhaFuncionario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      clinicaId: z.string().uuid(),
      userId: z.string().uuid(),
      novaSenha: z.string().min(6).max(72),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    await assertUserBelongsToClinica(data.userId, data.clinicaId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.novaSenha,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
