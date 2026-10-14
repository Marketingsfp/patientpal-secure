/**
 * Interruptor do formulário de agendamento do site institucional, por clínica.
 * Leitura e gravação só para administrador ativo da clínica (mesma regra das
 * telas de Configurações restritas a admin). Gravação via servidor.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Db = import("@supabase/supabase-js").SupabaseClient<
  import("@/integrations/supabase/types").Database
>;

async function clinicasAdmin(db: Db, userId: string) {
  const { data, error } = await db
    .from("clinica_memberships")
    .select("clinica_id, role")
    .eq("user_id", userId)
    .eq("ativo", true)
    .eq("role", "admin");
  if (error) {
    console.error("[site-agendamento] memberships:", error.code ?? "erro");
    throw new Error("Não foi possível verificar sua permissão.");
  }
  return (data ?? []).map((m) => m.clinica_id as string);
}

/**
 * Devolve só a clínica pedida (a selecionada no topo). Quem não é admin dela
 * recebe `{ admin: false }` — nunca a lista das outras clínicas.
 */
export const listarSiteAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = context.supabase as Db;
    const ids = await clinicasAdmin(db, context.userId);
    if (!ids.includes(data.clinicaId)) return { admin: false as const, linha: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: clinica }, { data: cfg }] = await Promise.all([
      supabaseAdmin.from("clinicas").select("id, nome").eq("id", data.clinicaId).maybeSingle(),
      supabaseAdmin
        .from("site_agendamento_config")
        .select("clinica_id, ativo, motivo, dias_antecedencia, horas_minimas, atualizado_em, atualizado_por")
        .eq("clinica_id", data.clinicaId)
        .maybeSingle(),
    ]);
    if (!clinica) return { admin: false as const, linha: null };
    let autor: string | null = null;
    if (cfg?.atualizado_por) {
      const { data: perfil } = await supabaseAdmin
        .from("profiles")
        .select("id, nome")
        .eq("id", cfg.atualizado_por)
        .maybeSingle();
      autor = (perfil as { nome: string | null } | null)?.nome || "Usuário";
    }
    return {
      admin: true as const,
      linha: {
        clinicaId: clinica.id as string,
        nome: clinica.nome as string,
        ativo: cfg ? cfg.ativo : true,
        motivo: cfg?.motivo ?? "",
        diasAntecedencia: cfg?.dias_antecedencia ?? 7,
        horasMinimas: cfg?.horas_minimas ?? 0,
        atualizadoEm: cfg?.atualizado_em ?? null,
        atualizadoPor: autor,
      },
    };
  });

export const salvarSiteAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        ativo: z.boolean(),
        motivo: z.string().trim().max(500).optional(),
        diasAntecedencia: z.number().int().min(1).max(60).optional(),
        horasMinimas: z.number().int().min(0).max(720).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ids = await clinicasAdmin(context.supabase as Db, context.userId);
    if (!ids.includes(data.clinicaId)) throw new Error("Sem permissão para esta clínica.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("site_agendamento_config").upsert(
      {
        clinica_id: data.clinicaId,
        ativo: data.ativo,
        motivo: data.motivo || null,
        ...(data.diasAntecedencia ? { dias_antecedencia: data.diasAntecedencia } : {}),
        ...(data.horasMinimas !== undefined ? { horas_minimas: data.horasMinimas } : {}),
        atualizado_em: new Date().toISOString(),
        atualizado_por: context.userId,
      },
      { onConflict: "clinica_id" },
    );
    if (error) {
      console.error("[site-agendamento] salvar:", error.code ?? "erro");
      throw new Error("Não foi possível salvar.");
    }
    return { ok: true };
  });

const alvoClinica = z.object({ clinicaId: z.string().uuid() });

async function exigirAdmin(db: Db, userId: string, clinicaId: string) {
  const ids = await clinicasAdmin(db, userId);
  if (!ids.includes(clinicaId)) throw new Error("Sem permissão para esta clínica.");
}

/** Especialidades da clínica que têm médico ativo e visível no site. */
export const listarEspecialidadesSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => alvoClinica.parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase as Db, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: meds, error } = await supabaseAdmin
      .from("medicos")
      .select("id, especialidade_id")
      .eq("clinica_id", data.clinicaId)
      .eq("ativo", true)
      .eq("visivel_agendamento_online", true);
    if (error) {
      console.error("[site-agendamento] esp medicos:", error.code ?? "erro");
      throw new Error("Não foi possível carregar.");
    }
    const medIds = (meds ?? []).map((m) => m.id);
    const ids = new Set<string>((meds ?? []).map((m) => m.especialidade_id).filter(Boolean) as string[]);
    for (let i = 0; i < medIds.length; i += 200) {
      const { data: rel } = await supabaseAdmin
        .from("medico_especialidades")
        .select("especialidade_id")
        .in("medico_id", medIds.slice(i, i + 200));
      for (const r of rel ?? []) if (r.especialidade_id) ids.add(r.especialidade_id);
    }
    if (!ids.size) return [];
    const lista = [...ids];
    const [{ data: esps }, { data: un }, { data: site }] = await Promise.all([
      supabaseAdmin.from("especialidades").select("id, nome, ativo").in("id", lista),
      supabaseAdmin
        .from("especialidade_unidade")
        .select("especialidade_id, ativo")
        .eq("clinica_id", data.clinicaId),
      supabaseAdmin
        .from("site_agendamento_especialidade")
        .select("especialidade_id, ativo")
        .eq("clinica_id", data.clinicaId),
    ]);
    const unOff = new Set((un ?? []).filter((r) => r.ativo === false).map((r) => r.especialidade_id));
    const siteOff = new Set((site ?? []).filter((r) => r.ativo === false).map((r) => r.especialidade_id));
    return (esps ?? [])
      .filter((e) => e.ativo !== false)
      .map((e) => ({
        id: e.id as string,
        nome: e.nome as string,
        oferecidaUnidade: !unOff.has(e.id),
        ativoSite: !siteOff.has(e.id),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  });

export const salvarEspecialidadeSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    alvoClinica.extend({ especialidadeId: z.string().uuid(), ativo: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase as Db, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("site_agendamento_especialidade").upsert(
      {
        clinica_id: data.clinicaId,
        especialidade_id: data.especialidadeId,
        ativo: data.ativo,
        atualizado_em: new Date().toISOString(),
        atualizado_por: context.userId,
      },
      { onConflict: "clinica_id,especialidade_id" },
    );
    if (error) {
      console.error("[site-agendamento] salvar esp:", error.code ?? "erro");
      throw new Error("Não foi possível salvar.");
    }
    return { ok: true };
  });

/** Médicos ativos da clínica, com a visibilidade no site e suas especialidades. */
export const listarMedicosSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => alvoClinica.parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase as Db, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: meds, error } = await supabaseAdmin
      .from("medicos")
      .select("id, nome, especialidade_id, visivel_agendamento_online")
      .eq("clinica_id", data.clinicaId)
      .eq("ativo", true)
      .order("nome")
      .limit(1000);
    if (error) {
      console.error("[site-agendamento] medicos:", error.code ?? "erro");
      throw new Error("Não foi possível carregar.");
    }
    const ids = (meds ?? []).map((m) => m.id);
    const porMed = new Map<string, Set<string>>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: rel } = await supabaseAdmin
        .from("medico_especialidades")
        .select("medico_id, especialidade_id")
        .in("medico_id", ids.slice(i, i + 200));
      for (const r of rel ?? []) {
        if (!r.especialidade_id) continue;
        if (!porMed.has(r.medico_id)) porMed.set(r.medico_id, new Set());
        porMed.get(r.medico_id)!.add(r.especialidade_id);
      }
    }
    return (meds ?? []).map((m) => {
      const s = new Set(porMed.get(m.id) ?? []);
      if (m.especialidade_id) s.add(m.especialidade_id);
      return {
        id: m.id as string,
        nome: m.nome as string,
        visivel: m.visivel_agendamento_online !== false,
        especialidades: [...s],
      };
    });
  });

export const salvarMedicoSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    alvoClinica.extend({ medicoId: z.string().uuid(), visivel: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase as Db, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("medicos")
      .update({ visivel_agendamento_online: data.visivel })
      .eq("id", data.medicoId)
      .eq("clinica_id", data.clinicaId)
      .select("id");
    if (error || !upd?.length) {
      console.error("[site-agendamento] salvar medico:", error?.code ?? "nao_encontrado");
      throw new Error("Não foi possível salvar.");
    }
    return { ok: true };
  });

/** Agendas e faixas de UM médico (carregado sob demanda ao expandir). */
export const listarAgendasMedicoSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => alvoClinica.extend({ medicoId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase as Db, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ags, error } = await supabaseAdmin
      .from("medico_agendas")
      .select("id, nome, sala, ativo, ordem_chegada")
      .eq("clinica_id", data.clinicaId)
      .eq("medico_id", data.medicoId)
      .order("nome");
    if (error) {
      console.error("[site-agendamento] agendas:", error.code ?? "erro");
      throw new Error("Não foi possível carregar.");
    }
    const ids = (ags ?? []).map((a) => a.id);
    if (!ids.length) return [];
    const [{ data: disps }, { data: sa }] = await Promise.all([
      supabaseAdmin
        .from("medico_disponibilidades")
        .select("id, agenda_id, dia_semana, hora_inicio, hora_fim, intervalo_min, limite_pacientes")
        .eq("clinica_id", data.clinicaId)
        .eq("medico_id", data.medicoId)
        .eq("ativo", true)
        .in("agenda_id", ids)
        .order("dia_semana")
        .order("hora_inicio"),
      supabaseAdmin
        .from("site_agendamento_agenda")
        .select("agenda_id, ativo")
        .eq("clinica_id", data.clinicaId)
        .in("agenda_id", ids),
    ]);
    const dispIds = (disps ?? []).map((d) => d.id);
    const { data: sf } = dispIds.length
      ? await supabaseAdmin
          .from("site_agendamento_faixa")
          .select("disponibilidade_id, ativo, limite_site")
          .eq("clinica_id", data.clinicaId)
          .in("disponibilidade_id", dispIds)
      : { data: [] };
    const agOff = new Set((sa ?? []).filter((r) => r.ativo === false).map((r) => r.agenda_id));
    const faixaCfg = new Map((sf ?? []).map((r) => [r.disponibilidade_id, r]));
    return (ags ?? []).map((a) => ({
      id: a.id as string,
      nome: a.nome as string,
      sala: (a.sala as string | null) ?? null,
      ordemChegada: !!a.ordem_chegada,
      ativoClinica: a.ativo !== false,
      ativoSite: !agOff.has(a.id),
      faixas: (disps ?? [])
        .filter((d) => d.agenda_id === a.id)
        .map((d) => {
          const c = faixaCfg.get(d.id);
          return {
            id: d.id as string,
            diaSemana: d.dia_semana as number,
            horaInicio: String(d.hora_inicio).slice(0, 5),
            horaFim: String(d.hora_fim).slice(0, 5),
            intervaloMin: (d.intervalo_min as number | null) ?? null,
            limitePacientes: (d.limite_pacientes as number | null) ?? null,
            ativoSite: c ? c.ativo !== false : true,
            limiteSite: c?.limite_site ?? null,
          };
        }),
    }));
  });

export const salvarAgendaSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    alvoClinica.extend({ agendaId: z.string().uuid(), ativo: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase as Db, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ag } = await supabaseAdmin
      .from("medico_agendas")
      .select("id")
      .eq("id", data.agendaId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (!ag) throw new Error("Agenda não encontrada nesta clínica.");
    const { error } = await supabaseAdmin.from("site_agendamento_agenda").upsert(
      {
        clinica_id: data.clinicaId,
        agenda_id: data.agendaId,
        ativo: data.ativo,
        atualizado_em: new Date().toISOString(),
        atualizado_por: context.userId,
      },
      { onConflict: "clinica_id,agenda_id" },
    );
    if (error) {
      console.error("[site-agendamento] salvar agenda:", error.code ?? "erro");
      throw new Error("Não foi possível salvar.");
    }
    return { ok: true };
  });

export const salvarFaixaSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    alvoClinica
      .extend({
        disponibilidadeId: z.string().uuid(),
        ativo: z.boolean(),
        limiteSite: z.number().int().min(0).max(1000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase as Db, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: disp } = await supabaseAdmin
      .from("medico_disponibilidades")
      .select("id")
      .eq("id", data.disponibilidadeId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (!disp) throw new Error("Faixa não encontrada nesta clínica.");
    const { error } = await supabaseAdmin.from("site_agendamento_faixa").upsert(
      {
        clinica_id: data.clinicaId,
        disponibilidade_id: data.disponibilidadeId,
        ativo: data.ativo,
        limite_site: data.limiteSite,
        atualizado_em: new Date().toISOString(),
        atualizado_por: context.userId,
      },
      { onConflict: "clinica_id,disponibilidade_id" },
    );
    if (error) {
      console.error("[site-agendamento] salvar faixa:", error.code ?? "erro");
      throw new Error("Não foi possível salvar.");
    }
    return { ok: true };
  });
