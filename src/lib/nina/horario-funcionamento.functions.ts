/**
 * Horário de funcionamento da clínica — server functions.
 *
 * Fonte única: o calendário da Nina
 *  - public.nina_calendario_versoes      (versões: rascunho / publicado / substituído)
 *  - public.nina_calendario_atendimento  (dias da semana da versão)
 *  - public.nina_calendario_excecoes     (exceções por data da versão)
 *
 * FASE 2: rascunho não tem efeito nenhum. Só versões publicadas são usadas
 * pela Nina e pelas métricas, sempre a versão que valia na data do evento.
 *
 * Segurança: vínculo com a clínica sempre conferido no BACKEND.
 * Leitura = membro ativo. Escrita/publicação = admin/gestor.
 * Publicação retroativa = apenas admin, com justificativa (validado também no banco).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { validarDia, validarExcecao, validarVigencia, normalizarHora } from "./horario-funcionamento";

const TAB_VER = "nina_calendario_versoes";
const TAB_DIAS = "nina_calendario_atendimento";
const TAB_EXC = "nina_calendario_excecoes";

async function membership(supabase: any, userId: string, clinicaId: string) {
  const { data, error } = await supabase
    .from("clinica_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
  return String(data.role);
}

async function exigirMembro(supabase: any, userId: string, clinicaId: string) {
  await membership(supabase, userId, clinicaId);
}

async function exigirAdmin(supabase: any, userId: string, clinicaId: string) {
  const role = await membership(supabase, userId, clinicaId);
  if (!["admin", "gestor"].includes(role))
    throw new Error("Apenas administradores e gestores podem alterar o horário de funcionamento.");
  return role;
}

/** Carrega a versão e confere permissão de escrita, devolvendo escopo e papel. */
async function versaoEditavel(supabase: any, userId: string, versaoId: string) {
  const { data, error } = await supabase
    .from(TAB_VER)
    .select("id, clinica_id, unidade_id, status, vigencia_inicio, fuso")
    .eq("id", versaoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Versão do horário não encontrada.");
  const role = await exigirAdmin(supabase, userId, data.clinica_id);
  if (data.status !== "rascunho")
    throw new Error("Esta versão já foi publicada e não pode ser alterada. Crie uma nova versão.");
  return { ...data, role } as any;
}

const escopo = z.object({
  clinicaId: z.string().uuid(),
  unidadeId: z.string().uuid().nullable().optional(),
});

function mapaHora<T extends { hora_inicio?: any; hora_fim?: any }>(linhas: T[]): T[] {
  return (linhas ?? []).map((l: any) => ({
    ...l,
    hora_inicio: l.hora_inicio ? normalizarHora(l.hora_inicio) : null,
    hora_fim: l.hora_fim ? normalizarHora(l.hora_fim) : null,
  }));
}

/* ------------------------------------------------------------------ */
/* Leitura — versões, rascunho atual e versão oficial vigente          */
/* ------------------------------------------------------------------ */

export const listarHorarioFuncionamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => escopo.parse(i))
  .handler(async ({ data, context }) => {
    const role = await membership(context.supabase, context.userId, data.clinicaId);
    const unidade = data.unidadeId ?? null;

    let qVer = context.supabase
      .from(TAB_VER)
      .select(
        "id, unidade_id, versao, status, fuso, vigencia_inicio, vigencia_fim, publicado_em, publicado_por, retroativa, motivo_retroativo, observacao, created_at",
      )
      .eq("clinica_id", data.clinicaId)
      .order("versao", { ascending: false });
    qVer = unidade ? qVer.eq("unidade_id", unidade) : qVer.is("unidade_id", null);
    const { data: versoes, error: eVer } = await qVer;
    if (eVer) throw new Error(eVer.message);

    const lista = versoes ?? [];
    const rascunho = lista.find((v: any) => v.status === "rascunho") ?? null;
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const vigente =
      lista
        .filter(
          (v: any) =>
            v.status !== "rascunho" &&
            v.publicado_em &&
            v.vigencia_inicio <= hoje &&
            (!v.vigencia_fim || v.vigencia_fim >= hoje),
        )
        .sort((a: any, b: any) => (a.vigencia_inicio === b.vigencia_inicio ? b.versao - a.versao : a.vigencia_inicio < b.vigencia_inicio ? 1 : -1))[0] ?? null;

    const ids = [rascunho?.id, vigente?.id].filter(Boolean) as string[];
    let dias: any[] = [];
    let excecoes: any[] = [];
    if (ids.length) {
      const [rd, re] = await Promise.all([
        context.supabase
          .from(TAB_DIAS)
          .select("id, versao_id, dia_semana, fechado, hora_inicio, hora_fim, ativo")
          .in("versao_id", ids)
          .eq("ativo", true)
          .order("dia_semana")
          .order("hora_inicio"),
        context.supabase
          .from(TAB_EXC)
          .select("id, versao_id, data, tipo, hora_inicio, hora_fim, descricao")
          .in("versao_id", ids)
          .order("data", { ascending: true }),
      ]);
      if (rd.error) throw new Error(rd.error.message);
      if (re.error) throw new Error(re.error.message);
      dias = mapaHora(rd.data ?? []);
      excecoes = mapaHora(re.data ?? []);
    }

    const porVersao = (id?: string | null) => ({
      dias: dias.filter((d) => d.versao_id === id),
      excecoes: excecoes.filter((e) => e.versao_id === id),
    });

    return {
      fuso: "America/Sao_Paulo",
      hoje,
      role,
      versoes: lista,
      rascunho: rascunho ? { ...rascunho, ...porVersao(rascunho.id) } : null,
      vigente: vigente ? { ...vigente, ...porVersao(vigente.id) } : null,
    };
  });

/** Histórico: qual versão oficial valia numa data específica (com seu conteúdo). */
export const consultarHorarioNaData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => escopo.extend({ data: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    await exigirMembro(context.supabase, context.userId, data.clinicaId);
    const unidade = data.unidadeId ?? null;

    let q = context.supabase
      .from(TAB_VER)
      .select("id, versao, status, vigencia_inicio, vigencia_fim, publicado_em, publicado_por, fuso, retroativa")
      .eq("clinica_id", data.clinicaId)
      .neq("status", "rascunho")
      .lte("vigencia_inicio", data.data)
      .order("vigencia_inicio", { ascending: false })
      .order("versao", { ascending: false })
      .limit(20);
    q = unidade ? q.eq("unidade_id", unidade) : q.is("unidade_id", null);
    const { data: versoes, error } = await q;
    if (error) throw new Error(error.message);

    const v = (versoes ?? []).find((x: any) => !x.vigencia_fim || x.vigencia_fim >= data.data) ?? null;
    // Calendário histórico desconhecido: não presumir que o atual sempre valeu.
    if (!v) return { versao: null, dias: [], excecoes: [], observacao: "Não havia horário oficial publicado para esta data." };

    const [rd, re] = await Promise.all([
      context.supabase
        .from(TAB_DIAS)
        .select("dia_semana, fechado, hora_inicio, hora_fim")
        .eq("versao_id", v.id)
        .eq("ativo", true)
        .order("dia_semana"),
      context.supabase.from(TAB_EXC).select("data, tipo, hora_inicio, hora_fim, descricao").eq("versao_id", v.id).eq("data", data.data),
    ]);
    if (rd.error) throw new Error(rd.error.message);
    if (re.error) throw new Error(re.error.message);
    return { versao: v, dias: mapaHora(rd.data ?? []), excecoes: mapaHora(re.data ?? []), observacao: null };
  });

/* ------------------------------------------------------------------ */
/* Rascunho                                                            */
/* ------------------------------------------------------------------ */

export const criarRascunhoHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    escopo
      .extend({
        vigenciaInicio: z.string(),
        observacao: z.string().max(500).nullable().optional(),
        copiarDaVersaoId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);
    const erros = validarVigencia(data.vigenciaInicio, null);
    if (erros.length) throw new Error(erros.join(" "));
    const unidade = data.unidadeId ?? null;

    let qEx = context.supabase
      .from(TAB_VER)
      .select("id")
      .eq("clinica_id", data.clinicaId)
      .eq("status", "rascunho");
    qEx = unidade ? qEx.eq("unidade_id", unidade) : qEx.is("unidade_id", null);
    const { data: jaTem, error: eEx } = await qEx.maybeSingle();
    if (eEx) throw new Error(eEx.message);
    if (jaTem) throw new Error("Já existe um rascunho aberto para este escopo. Edite ou descarte o rascunho atual.");

    let qMax = context.supabase
      .from(TAB_VER)
      .select("versao")
      .eq("clinica_id", data.clinicaId)
      .order("versao", { ascending: false })
      .limit(1);
    qMax = unidade ? qMax.eq("unidade_id", unidade) : qMax.is("unidade_id", null);
    const { data: max, error: eMax } = await qMax;
    if (eMax) throw new Error(eMax.message);
    const proxima = Number(max?.[0]?.versao ?? 0) + 1;

    const { data: nova, error } = await context.supabase
      .from(TAB_VER)
      .insert({
        clinica_id: data.clinicaId,
        unidade_id: unidade,
        versao: proxima,
        status: "rascunho",
        fuso: "America/Sao_Paulo",
        vigencia_inicio: data.vigenciaInicio,
        observacao: data.observacao ?? null,
        created_by: context.userId,
      })
      .select("id, versao")
      .single();
    if (error) throw new Error(error.message);

    if (data.copiarDaVersaoId) {
      const [rd, re] = await Promise.all([
        context.supabase
          .from(TAB_DIAS)
          .select("dia_semana, fechado, hora_inicio, hora_fim, observacao")
          .eq("versao_id", data.copiarDaVersaoId)
          .eq("ativo", true),
        context.supabase
          .from(TAB_EXC)
          .select("data, tipo, hora_inicio, hora_fim, descricao")
          .eq("versao_id", data.copiarDaVersaoId),
      ]);
      if (rd.error) throw new Error(rd.error.message);
      if (re.error) throw new Error(re.error.message);
      if ((rd.data ?? []).length) {
        const { error: eIns } = await context.supabase.from(TAB_DIAS).insert(
          (rd.data ?? []).map((d: any) => ({
            clinica_id: data.clinicaId,
            unidade_id: unidade,
            versao_id: nova.id,
            dia_semana: d.dia_semana,
            fechado: d.fechado,
            hora_inicio: d.hora_inicio,
            hora_fim: d.hora_fim,
            vigencia_inicio: data.vigenciaInicio,
            observacao: d.observacao ?? null,
            created_by: context.userId,
            ativo: true,
          })),
        );
        if (eIns) throw new Error(eIns.message);
      }
      if ((re.data ?? []).length) {
        const { error: eIns2 } = await context.supabase.from(TAB_EXC).insert(
          (re.data ?? []).map((e: any) => ({
            clinica_id: data.clinicaId,
            unidade_id: unidade,
            versao_id: nova.id,
            data: e.data,
            tipo: e.tipo,
            hora_inicio: e.hora_inicio,
            hora_fim: e.hora_fim,
            descricao: e.descricao ?? null,
            created_by: context.userId,
          })),
        );
        if (eIns2) throw new Error(eIns2.message);
      }
    }

    return { ok: true, versaoId: nova.id as string, versao: nova.versao as number };
  });

export const atualizarRascunhoHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        versaoId: z.string().uuid(),
        vigenciaInicio: z.string(),
        observacao: z.string().max(500).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const v = await versaoEditavel(context.supabase, context.userId, data.versaoId);
    const erros = validarVigencia(data.vigenciaInicio, null);
    if (erros.length) throw new Error(erros.join(" "));
    const { error } = await context.supabase
      .from(TAB_VER)
      .update({ vigencia_inicio: data.vigenciaInicio, observacao: data.observacao ?? null })
      .eq("id", v.id);
    if (error) throw new Error(error.message);
    // Mantém a vigência das linhas do rascunho alinhada com a versão.
    await context.supabase.from(TAB_DIAS).update({ vigencia_inicio: data.vigenciaInicio }).eq("versao_id", v.id);
    return { ok: true };
  });

export const descartarRascunhoHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ versaoId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const v = await versaoEditavel(context.supabase, context.userId, data.versaoId);
    const { error } = await context.supabase.from(TAB_VER).delete().eq("id", v.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Escrita no rascunho — dias da semana                                */
/* ------------------------------------------------------------------ */

const diaInput = z.object({
  versaoId: z.string().uuid(),
  diaSemana: z.number().int().min(0).max(6),
  fechado: z.boolean(),
  faixas: z.array(z.object({ hora_inicio: z.string(), hora_fim: z.string() })).max(6).default([]),
});

export const salvarDiaHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => diaInput.parse(i))
  .handler(async ({ data, context }) => {
    const v = await versaoEditavel(context.supabase, context.userId, data.versaoId);

    const erros = validarDia({ dia_semana: data.diaSemana, fechado: data.fechado, faixas: data.faixas });
    if (erros.length) throw new Error(erros.join(" "));

    const rDel = await context.supabase
      .from(TAB_DIAS)
      .delete()
      .eq("versao_id", v.id)
      .eq("dia_semana", data.diaSemana);
    if (rDel.error) throw new Error(rDel.error.message);

    const base = {
      clinica_id: v.clinica_id,
      unidade_id: v.unidade_id,
      versao_id: v.id,
      dia_semana: data.diaSemana,
      vigencia_inicio: v.vigencia_inicio,
      created_by: context.userId,
      ativo: true,
    };

    const linhas: any[] = data.fechado
      ? [{ ...base, fechado: true, hora_inicio: null, hora_fim: null }]
      : data.faixas.map((f) => ({
          ...base,
          fechado: false,
          hora_inicio: normalizarHora(f.hora_inicio),
          hora_fim: normalizarHora(f.hora_fim),
        }));

    if (linhas.length === 0) return { ok: true, estado: "nao_configurado" as const };

    const { error } = await context.supabase.from(TAB_DIAS).insert(linhas);
    if (error) throw new Error(error.message);
    return { ok: true, estado: data.fechado ? ("fechado" as const) : ("aberto" as const) };
  });

/* ------------------------------------------------------------------ */
/* Escrita no rascunho — exceções por data                             */
/* ------------------------------------------------------------------ */

const excInput = z.object({
  versaoId: z.string().uuid(),
  data: z.string(),
  tipo: z.enum(["fechado", "especial"]),
  horaInicio: z.string().nullable().optional(),
  horaFim: z.string().nullable().optional(),
  descricao: z.string().max(300).nullable().optional(),
});

export const salvarExcecaoHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => excInput.parse(i))
  .handler(async ({ data, context }) => {
    const v = await versaoEditavel(context.supabase, context.userId, data.versaoId);
    const erros = validarExcecao({
      data: data.data,
      tipo: data.tipo,
      hora_inicio: data.horaInicio ?? null,
      hora_fim: data.horaFim ?? null,
    });
    if (erros.length) throw new Error(erros.join(" "));

    const { error } = await context.supabase.from(TAB_EXC).insert({
      clinica_id: v.clinica_id,
      unidade_id: v.unidade_id,
      versao_id: v.id,
      data: data.data,
      tipo: data.tipo,
      hora_inicio: data.tipo === "especial" ? normalizarHora(data.horaInicio ?? "") : null,
      hora_fim: data.tipo === "especial" ? normalizarHora(data.horaFim ?? "") : null,
      descricao: data.descricao ?? null,
      created_by: context.userId,
    });
    if (error) {
      if (String(error.message).includes("uq_nina_exc_data"))
        throw new Error("Já existe uma exceção cadastrada para esta data nesta versão.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const removerExcecaoHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ versaoId: z.string().uuid(), id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const v = await versaoEditavel(context.supabase, context.userId, data.versaoId);
    const { error } = await context.supabase.from(TAB_EXC).delete().eq("versao_id", v.id).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Publicação                                                          */
/* ------------------------------------------------------------------ */

export const publicarHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        versaoId: z.string().uuid(),
        confirmarConflito: z.boolean().default(false),
        motivoRetroativo: z.string().max(500).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    // versaoEditavel já confere clínica, papel e que a versão é rascunho.
    await versaoEditavel(context.supabase, context.userId, data.versaoId);
    const { data: r, error } = await context.supabase.rpc("nina_calendario_publicar", {
      p_versao_id: data.versaoId,
      p_confirmar_conflito: data.confirmarConflito,
      p_motivo_retroativo: data.motivoRetroativo ?? undefined,
    });
    if (error) throw new Error(error.message);
    return r as { ok: boolean; conflitos?: any[]; versao?: number; conflitos_encerrados?: any[] };
  });
