/**
 * Horário de funcionamento da clínica — server functions.
 *
 * Reutiliza as tabelas já existentes do calendário da Nina:
 *  - public.nina_calendario_atendimento (faixas por dia da semana + dia fechado)
 *  - public.nina_calendario_excecoes    (exceções por data)
 *
 * Segurança: o vínculo com a clínica é sempre conferido no BACKEND.
 * Leitura = membro ativo. Escrita = admin/gestor (mesmo controle do catálogo).
 *
 * FASE 1: apenas cadastro. Nada aqui altera o atendimento nem reclassifica
 * conversas antigas.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { validarDia, validarExcecao, validarVigencia, normalizarHora } from "./horario-funcionamento";

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
}

const escopo = z.object({
  clinicaId: z.string().uuid(),
  unidadeId: z.string().uuid().nullable().optional(),
});

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

export const listarHorarioFuncionamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => escopo.parse(i))
  .handler(async ({ data, context }) => {
    await exigirMembro(context.supabase, context.userId, data.clinicaId);
    const unidade = data.unidadeId ?? null;

    let qDias = context.supabase
      .from(TAB_DIAS)
      .select("id, unidade_id, dia_semana, fechado, hora_inicio, hora_fim, vigencia_inicio, vigencia_fim, ativo, observacao")
      .eq("clinica_id", data.clinicaId)
      .eq("ativo", true)
      .order("dia_semana")
      .order("hora_inicio");
    qDias = unidade ? qDias.eq("unidade_id", unidade) : qDias.is("unidade_id", null);

    let qExc = context.supabase
      .from(TAB_EXC)
      .select("id, unidade_id, data, tipo, hora_inicio, hora_fim, descricao")
      .eq("clinica_id", data.clinicaId)
      .order("data", { ascending: true });
    qExc = unidade ? qExc.eq("unidade_id", unidade) : qExc.is("unidade_id", null);

    const [dias, excecoes] = await Promise.all([qDias, qExc]);
    if (dias.error) throw new Error(dias.error.message);
    if (excecoes.error) throw new Error(excecoes.error.message);

    return {
      fuso: "America/Sao_Paulo",
      dias: (dias.data ?? []).map((d: any) => ({
        ...d,
        hora_inicio: d.hora_inicio ? normalizarHora(d.hora_inicio) : null,
        hora_fim: d.hora_fim ? normalizarHora(d.hora_fim) : null,
      })),
      excecoes: (excecoes.data ?? []).map((e: any) => ({
        ...e,
        hora_inicio: e.hora_inicio ? normalizarHora(e.hora_inicio) : null,
        hora_fim: e.hora_fim ? normalizarHora(e.hora_fim) : null,
      })),
    };
  });

/* ------------------------------------------------------------------ */
/* Escrita — um dia da semana por vez                                  */
/* ------------------------------------------------------------------ */

const diaInput = escopo.extend({
  diaSemana: z.number().int().min(0).max(6),
  fechado: z.boolean(),
  faixas: z
    .array(z.object({ hora_inicio: z.string(), hora_fim: z.string() }))
    .max(6)
    .default([]),
  vigenciaInicio: z.string(),
  vigenciaFim: z.string().nullable().optional(),
  observacao: z.string().max(500).nullable().optional(),
});

export const salvarDiaHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => diaInput.parse(i))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);

    const erros = [
      ...validarVigencia(data.vigenciaInicio, data.vigenciaFim ?? null),
      ...validarDia({ dia_semana: data.diaSemana, fechado: data.fechado, faixas: data.faixas }),
    ];
    if (erros.length) throw new Error(erros.join(" "));

    const unidade = data.unidadeId ?? null;

    // Substitui a configuração vigente deste dia/escopo.
    let del = context.supabase
      .from(TAB_DIAS)
      .delete()
      .eq("clinica_id", data.clinicaId)
      .eq("dia_semana", data.diaSemana)
      .eq("vigencia_inicio", data.vigenciaInicio);
    del = unidade ? del.eq("unidade_id", unidade) : del.is("unidade_id", null);
    const rDel = await del;
    if (rDel.error) throw new Error(rDel.error.message);

    const base = {
      clinica_id: data.clinicaId,
      unidade_id: unidade,
      dia_semana: data.diaSemana,
      vigencia_inicio: data.vigenciaInicio,
      vigencia_fim: data.vigenciaFim ?? null,
      observacao: data.observacao ?? null,
      created_by: context.userId,
      ativo: true,
    };

    const linhas: Array<
      typeof base & { fechado: boolean; hora_inicio: string | null; hora_fim: string | null }
    > = data.fechado
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
/* Escrita — exceções por data                                         */
/* ------------------------------------------------------------------ */

const excInput = escopo.extend({
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
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);
    const erros = validarExcecao({
      data: data.data,
      tipo: data.tipo,
      hora_inicio: data.horaInicio ?? null,
      hora_fim: data.horaFim ?? null,
    });
    if (erros.length) throw new Error(erros.join(" "));

    const { error } = await context.supabase.from(TAB_EXC).insert({
      clinica_id: data.clinicaId,
      unidade_id: data.unidadeId ?? null,
      data: data.data,
      tipo: data.tipo,
      hora_inicio: data.tipo === "especial" ? normalizarHora(data.horaInicio ?? "") : null,
      hora_fim: data.tipo === "especial" ? normalizarHora(data.horaFim ?? "") : null,
      descricao: data.descricao ?? null,
      created_by: context.userId,
    });
    if (error) {
      if (String(error.message).includes("uq_nina_exc_data"))
        throw new Error("Já existe uma exceção cadastrada para esta data com este horário.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const removerExcecaoHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase
      .from(TAB_EXC)
      .delete()
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
