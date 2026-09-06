/**
 * Classificador central de período — acesso aos calendários publicados.
 *
 * Só lê dados. Não altera atendimento, atribuição, handoff, resolução de
 * conversa nem o timeout de 30 minutos.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  classificarPeriodo,
  type CalendarioPublicado,
  type ResultadoClassificacao,
} from "./classificador-periodo";

async function exigirMembro(supabase: any, userId: string, clinicaId: string) {
  const { data, error } = await supabase
    .from("clinica_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
}

/** Carrega todas as versões publicadas/substituídas da clínica com dias e exceções. */
export async function carregarCalendariosPublicados(
  supabase: any,
  clinicaId: string,
): Promise<CalendarioPublicado[]> {
  const { data: versoes, error } = await supabase
    .from("nina_calendario_versoes")
    .select("id, versao, status, publicado_em, vigencia_inicio, vigencia_fim, fuso, clinica_id, unidade_id")
    .eq("clinica_id", clinicaId)
    .in("status", ["publicado", "substituido"])
    .not("publicado_em", "is", null);
  if (error) throw new Error(error.message);
  const ids = (versoes ?? []).map((v: any) => v.id);
  if (ids.length === 0) return [];

  const [dias, excecoes] = await Promise.all([
    supabase
      .from("nina_calendario_atendimento")
      .select("versao_id, dia_semana, fechado, hora_inicio, hora_fim, ativo")
      .in("versao_id", ids),
    supabase
      .from("nina_calendario_excecoes")
      .select("versao_id, data, tipo, hora_inicio, hora_fim")
      .in("versao_id", ids),
  ]);
  if (dias.error) throw new Error(dias.error.message);
  if (excecoes.error) throw new Error(excecoes.error.message);

  return (versoes ?? []).map((v: any) => {
    const linhas = (dias.data ?? []).filter((d: any) => d.versao_id === v.id && d.ativo !== false);
    const porDia = new Map<number, { dia_semana: number; fechado: boolean; faixas: Array<{ hora_inicio: string; hora_fim: string }> }>();
    for (const l of linhas) {
      const atual = porDia.get(l.dia_semana) ?? {
        dia_semana: l.dia_semana as number,
        fechado: false,
        faixas: [] as Array<{ hora_inicio: string; hora_fim: string }>,
      };
      if (l.fechado) atual.fechado = true;
      else if (l.hora_inicio && l.hora_fim)
        atual.faixas.push({ hora_inicio: String(l.hora_inicio).slice(0, 5), hora_fim: String(l.hora_fim).slice(0, 5) });
      porDia.set(l.dia_semana, atual);
    }
    return {
      versao_id: v.id,
      versao: v.versao,
      status: v.status,
      publicado_em: v.publicado_em,
      vigencia_inicio: v.vigencia_inicio,
      vigencia_fim: v.vigencia_fim,
      fuso: v.fuso,
      clinica_id: v.clinica_id,
      unidade_id: v.unidade_id ?? null,
      dias: [...porDia.values()],
      excecoes: (excecoes.data ?? [])
        .filter((e: any) => e.versao_id === v.id)
        .map((e: any) => ({
          data: e.data,
          tipo: e.tipo,
          hora_inicio: e.hora_inicio ? String(e.hora_inicio).slice(0, 5) : null,
          hora_fim: e.hora_fim ? String(e.hora_fim).slice(0, 5) : null,
        })),
    } as CalendarioPublicado;
  });
}

/**
 * Cache do calendário por escopo (clínica) para o caminho quente do
 * atendimento: sem ele, cada mensagem do paciente relia versões, dias e
 * exceções (3 consultas). O cache guarda a assinatura da última publicação
 * (quantidade de versões + publicado_em mais recente) e é descartado assim que
 * uma nova publicação aparece — nunca serve horário desatualizado.
 */
type EntradaCache = { assinatura: string; em: number; calendarios: CalendarioPublicado[] };
const cacheCalendarios = new Map<string, EntradaCache>();
/** Janela curta: mesmo sem nova publicação, o cache se renova sozinho. */
const TTL_MS = 5 * 60 * 1000;

async function assinaturaPublicacao(supabase: any, clinicaId: string): Promise<string> {
  const { data, count, error } = await supabase
    .from("nina_calendario_versoes")
    .select("publicado_em", { count: "exact" })
    .eq("clinica_id", clinicaId)
    .in("status", ["publicado", "substituido"])
    .not("publicado_em", "is", null)
    .order("publicado_em", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return `${count ?? 0}:${data?.[0]?.publicado_em ?? "-"}`;
}

/** Igual a carregarCalendariosPublicados, com reuso por escopo e versão. */
export async function carregarCalendariosPublicadosCache(
  supabase: any,
  clinicaId: string,
): Promise<CalendarioPublicado[]> {
  const assinatura = await assinaturaPublicacao(supabase, clinicaId);
  const atual = cacheCalendarios.get(clinicaId);
  if (atual && atual.assinatura === assinatura && Date.now() - atual.em < TTL_MS) {
    return atual.calendarios;
  }
  const calendarios = await carregarCalendariosPublicados(supabase, clinicaId);
  cacheCalendarios.set(clinicaId, { assinatura, em: Date.now(), calendarios });
  return calendarios;
}

/** Só para testes: zera o cache em memória. */
export function limparCacheCalendarios() {
  cacheCalendarios.clear();
}



/** Classifica um ou vários instantes de uma mesma clínica. */
export const classificarPeriodoEventos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        eventos: z
          .array(
            z.object({
              id: z.string().optional(),
              em: z.string().nullable().optional(),
              // unidade REAL do evento; nunca a unidade selecionada na tela
              unidadeId: z.string().uuid().nullable().optional(),
            }),
          )
          .max(500),
        fuso: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<Array<ResultadoClassificacao & { id?: string }>> => {
    const { supabase, userId } = context as any;
    await exigirMembro(supabase, userId, data.clinicaId);
    const calendarios = await carregarCalendariosPublicados(supabase, data.clinicaId);
    return data.eventos.map((ev) => ({
      ...(ev.id ? { id: ev.id } : {}),
      ...classificarPeriodo({
        em: ev.em ?? null,
        escopo: { clinica_id: data.clinicaId, unidade_id: ev.unidadeId ?? null },
        calendarios,
        fuso: data.fuso ?? null,
      }),
    }));
  });
