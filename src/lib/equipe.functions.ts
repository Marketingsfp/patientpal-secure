import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { MSG_SO_ADMIN, exigeAdministrador } from "@/lib/equipe/conceder-admin";

const ROLES = [
  "admin",
  "gestor",
  "medico",
  "enfermeiro",
  "recepcao",
  "caixa",
  "financeiro",
  "supervisor",
  "telefonia",
] as const;

async function assertManager(userId: string, clinicaId: string) {
  const { data, error } = await supabaseAdmin.rpc("can_manage_clinica", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem permissão para gerenciar a equipe desta clínica");
}

/** Admin ativo da clínica ou admin da plataforma. Gestor não basta. */
async function assertAdminDaClinicaOuPlataforma(userId: string, clinicaId: string) {
  const { data: mem, error } = await supabaseAdmin
    .from("clinica_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new Error("Não foi possível verificar sua permissão. Tente novamente.");
  if (mem?.role === "admin") return;
  const { data: plataforma, error: pErr } = await supabaseAdmin.rpc("is_platform_admin", {
    _user_id: userId,
  });
  if (pErr) throw new Error("Não foi possível verificar sua permissão. Tente novamente.");
  if (plataforma !== true) throw new Error(MSG_SO_ADMIN);
}

/**
 * Perfil customizado escolhido na tela (ex.: CARTÃO BENEFÍCIOS): confere que
 * é desta clínica e devolve o perfil base, que é o que vai em `role`. O
 * trigger do banco refaz a mesma conferência; esta aqui existe para devolver
 * uma mensagem clara em vez de um erro de banco.
 */
async function perfilBaseDoCustomizado(clinicaId: string, perfilAcessoId: string) {
  const { data, error } = await supabaseAdmin
    .from("perfis_acesso")
    .select("*")
    .eq("id", perfilAcessoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.clinica_id !== clinicaId || data.sistema || !data.perfil_base) {
    throw new Error("Perfil de acesso inválido para esta unidade");
  }
  return data.perfil_base as (typeof ROLES)[number];
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

/**
 * Senha e nome são da CONTA, não do vínculo: valem em todas as unidades em que
 * a pessoa trabalha. Por isso, alterar um dos dois exige administrar TODAS as
 * unidades ativas dela — senão o administrador de uma unidade conseguiria entrar
 * na conta de alguém que também tem acesso a outra unidade. A conta de
 * administrador da plataforma só é alterada por outro administrador da
 * plataforma. A própria pessoa sempre pode alterar a própria conta.
 */
async function assertPodeAlterarConta(callerId: string, alvoId: string) {
  if (callerId === alvoId) return;

  const { data: vinculos, error } = await supabaseAdmin
    .from("clinica_memberships")
    .select("clinica_id")
    .eq("user_id", alvoId)
    .eq("ativo", true);
  if (error) throw new Error(error.message);

  for (const v of vinculos ?? []) {
    const { data: gerencia, error: gErr } = await supabaseAdmin.rpc("can_manage_clinica", {
      _user_id: callerId,
      _clinica_id: v.clinica_id,
    });
    if (gErr) throw new Error(gErr.message);
    if (!gerencia) {
      throw new Error(
        "Esta pessoa também tem acesso a outra unidade que você não administra. " +
          "A senha e o nome dela só podem ser alterados por quem administra todas as unidades dela.",
      );
    }
  }

  const { data: alvoPlataforma, error: pErr } = await supabaseAdmin.rpc("is_platform_admin", {
    _user_id: alvoId,
  });
  if (pErr) throw new Error(pErr.message);
  if (alvoPlataforma) {
    const { data: callerPlataforma, error: cErr } = await supabaseAdmin.rpc("is_platform_admin", {
      _user_id: callerId,
    });
    if (cErr) throw new Error(cErr.message);
    if (!callerPlataforma) {
      throw new Error(
        "A conta de administrador da plataforma só pode ser alterada por outro administrador da plataforma.",
      );
    }
  }
}

/**
 * Mantém a tabela legada `user_roles` coerente com o papel gravado em
 * `clinica_memberships`, que é a ÚNICA fonte de verdade do acesso ao sistema:
 * todas as políticas RLS e as funções `is_member` / `can_manage_clinica` /
 * `has_role` leem memberships, nunca `user_roles`.
 *
 * `user_roles` sobrou de uma versão anterior e hoje só é lida por
 * `is_global_admin()` — que ignora o `clinica_id` e portanto vale como
 * administrador global — nas políticas de `sistema_planos` e
 * `lab_allowlist_contatos`, além de servir de rótulo de setor no chat interno.
 * Como a tela de RH gravava só memberships, essa tabela ficou congelada com
 * "admin" para todo mundo: pessoas que hoje são recepção, caixa ou médica
 * continuavam marcadas como administradoras globais ali.
 *
 * Regra: perfil "admin" na clínica garante a linha; qualquer outro perfil
 * remove a linha de admin daquela clínica. Linhas com `clinica_id` nulo
 * (administrador global concedido à mão) não são tocadas.
 */
async function sincronizarAdminGlobal(userId: string, clinicaId: string, role: string) {
  if (role === "admin") {
    const { data: ja } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("clinica_id", clinicaId)
      .eq("role", "admin")
      .maybeSingle();
    if (ja) return;
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, clinica_id: clinicaId, role: "admin" });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabaseAdmin
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("role", "admin");
  if (error) throw new Error(error.message);
}

/**
 * FASE 2 — quem passa a ter o perfil TELEFONIA e já está Online vira elegível
 * na mesma hora. Sem isto, o que está parado em "Não atribuídas" só seria
 * reavaliado no próximo batimento de presença (até 60s de atraso).
 *
 * A distribuição em si continua sendo a MESMA do banco
 * (`atend_distribuir_fila`), que reconfere perfil, presença, pausa, capacidade,
 * setor e administrador. Aqui não há segunda regra de elegibilidade, e nenhuma
 * conversa já atribuída é retirada de ninguém.
 */
async function reavaliarFilaTelefonia(clinicaId: string, role: string) {
  if (role !== "telefonia") return;
  const { error } = await supabaseAdmin.rpc("atend_distribuir_fila", {
    _clinica_id: clinicaId,
    _max: 20,
  } as never);
  if (error)
    console.error("[equipe] falha ao reavaliar fila após perfil Telefonia:", error.message);
}

export const listarEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: mems, error } = await supabase
      .from("clinica_memberships")
      .select("id, role, user_id, ativo, created_at, pode_autorizar")
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
    z
      .object({
        clinicaId: z.string().uuid(),
        email: z.string().email(),
        password: z.string().min(6).max(100),
        nome: z.string().min(2).max(120),
        role: z.enum(ROLES),
        /** Perfil customizado; quando vem, `role` passa a ser o perfil base dele. */
        perfilAcessoId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    if (data.perfilAcessoId) {
      data.role = await perfilBaseDoCustomizado(data.clinicaId, data.perfilAcessoId);
    }
    // Antes de criar conta: conceder admin exige administrador.
    if (exigeAdministrador({ papelFinal: data.role })) {
      await assertAdminDaClinicaOuPlataforma(context.userId, data.clinicaId);
    }
    // Só manda a coluna quando há perfil customizado: antes da migration ela
    // não existe, e o cadastro comum não pode depender dela.
    const perfilCustom = data.perfilAcessoId ? { perfil_acesso_id: data.perfilAcessoId } : {};

    // Check if user already exists by email
    let userId: string | null = null;
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (existing) {
      // Conta já existente (por exemplo, de outra unidade): só pode ser anexada
      // por quem administra todas as unidades dela.
      await assertPodeAlterarConta(context.userId, existing.id);
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
      .select("id, role, ativo")
      .eq("user_id", userId!)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();

    if (
      existingMem &&
      exigeAdministrador({
        papelFinal: data.role,
        papelAtual: existingMem.role,
        alvoEhOProprio:
          userId === context.userId && (data.role !== existingMem.role || !existingMem.ativo),
      })
    ) {
      await assertAdminDaClinicaOuPlataforma(context.userId, data.clinicaId);
    }

    if (existingMem) {
      const { error } = await supabaseAdmin
        .from("clinica_memberships")
        .update({ role: data.role, ativo: true, ...perfilCustom })
        .eq("id", existingMem.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("clinica_memberships").insert({
        user_id: userId!,
        clinica_id: data.clinicaId,
        role: data.role,
        ativo: true,
        ...perfilCustom,
      });
      if (error) throw new Error(error.message);
    }

    await sincronizarAdminGlobal(userId!, data.clinicaId, data.role);
    await reavaliarFilaTelefonia(data.clinicaId, data.role);

    return { ok: true, userId };
  });

export const editarMembro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        membershipId: z.string().uuid(),
        role: z.enum(ROLES),
        /**
         * Perfil customizado. `undefined` não mexe (telas que não conhecem
         * perfil customizado); `null` tira a pessoa do customizado; um id
         * coloca nele e `role` passa a ser o perfil base.
         */
        perfilAcessoId: z.string().uuid().nullable().optional(),
        ativo: z.boolean(),
        /**
         * Autoriza isenções e descontos com a própria senha. Só é gravado
         * quando vem informado: as telas que editam o vínculo por outros
         * motivos (contrato de RH, troca de perfil) não devem zerar sem
         * querer uma permissão que a diretoria concedeu.
         */
        podeAutorizar: z.boolean().optional(),
        /** Cria horário semanal de médico e gera vagas. Só grava quando vem informado. */
        podeGerirHorarios: z.boolean().optional(),
        nome: z.string().min(2).max(120).optional(),
        novaSenha: z.string().min(6).max(100).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);

    const { data: mem, error: mErr } = await supabaseAdmin
      .from("clinica_memberships")
      .select("id, user_id, clinica_id, role, ativo")
      .eq("id", data.membershipId)
      .single();
    if (mErr || !mem) throw new Error("Membro não encontrado");
    if (mem.clinica_id !== data.clinicaId) throw new Error("Membro não pertence a esta clínica");

    // Trocar nome ou senha mexe na conta inteira, não só neste vínculo.
    if (data.nome || (data.novaSenha && data.novaSenha.length >= 6)) {
      await assertPodeAlterarConta(context.userId, mem.user_id);
    }

    if (data.perfilAcessoId) {
      data.role = await perfilBaseDoCustomizado(data.clinicaId, data.perfilAcessoId);
    }

    const proprioMudando =
      mem.user_id === context.userId && (data.role !== mem.role || data.ativo !== mem.ativo);
    if (
      exigeAdministrador({
        papelFinal: data.role,
        papelAtual: mem.role,
        alvoEhOProprio: proprioMudando,
      })
    ) {
      await assertAdminDaClinicaOuPlataforma(context.userId, data.clinicaId);
    }

    const { error: upErr } = await supabaseAdmin
      .from("clinica_memberships")
      .update({
        role: data.role,
        ativo: data.ativo,
        ...(data.perfilAcessoId === undefined ? {} : { perfil_acesso_id: data.perfilAcessoId }),
        ...(data.podeAutorizar === undefined ? {} : { pode_autorizar: data.podeAutorizar }),
        ...(data.podeGerirHorarios === undefined
          ? {}
          : { pode_gerir_horarios: data.podeGerirHorarios }),
      })
      .eq("id", data.membershipId);
    if (upErr) throw new Error(upErr.message);

    await sincronizarAdminGlobal(mem.user_id, data.clinicaId, data.role);
    await reavaliarFilaTelefonia(data.clinicaId, data.role);

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
    z
      .object({
        clinicaId: z.string().uuid(),
        userId: z.string().uuid(),
      })
      .parse(input),
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
    z
      .object({
        clinicaId: z.string().uuid(),
        userId: z.string().uuid(),
        novaSenha: z.string().min(6).max(72),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    await assertUserBelongsToClinica(data.userId, data.clinicaId);
    await assertPodeAlterarConta(context.userId, data.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.novaSenha,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Grava quais profissionais uma pessoa da equipe pode ver e agendar.
 *
 * Lista vazia significa "sem restrição": a pessoa volta a enxergar a clínica
 * inteira, que é o comportamento de quase toda a equipe. Por isso a gravação é
 * sempre um "apaga e regrava" — marcar e desmarcar precisam custar o mesmo.
 *
 * A trava de verdade fica nas políticas do banco (`medicos_do_usuario()`);
 * esta função existe para que só quem gerencia a equipe possa alterar o escopo.
 */
export const salvarMedicosDoUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        userId: z.string().uuid(),
        medicoIds: z.array(z.string().uuid()).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    await assertUserBelongsToClinica(data.userId, data.clinicaId);

    // Só aceita médicos da própria clínica: sem esta conferência um id de outra
    // unidade entraria no escopo e abriria uma agenda que não é daqui.
    const ids = [...new Set(data.medicoIds)];
    if (ids.length > 0) {
      const { data: validos, error: vErr } = await supabaseAdmin
        .from("medicos")
        .select("id")
        .eq("clinica_id", data.clinicaId)
        .in("id", ids);
      if (vErr) throw new Error(vErr.message);
      if ((validos ?? []).length !== ids.length) {
        throw new Error("Algum profissional selecionado não pertence a esta clínica");
      }
    }

    const { error: delErr } = await supabaseAdmin
      .from("usuario_medicos")
      .delete()
      .eq("clinica_id", data.clinicaId)
      .eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);

    if (ids.length > 0) {
      const { error: insErr } = await supabaseAdmin.from("usuario_medicos").insert(
        ids.map((medicoId) => ({
          clinica_id: data.clinicaId,
          user_id: data.userId,
          medico_id: medicoId,
        })),
      );
      if (insErr) throw new Error(insErr.message);
    }

    return { ok: true, total: ids.length };
  });
