import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RelatorioDiario } from "./relatorio-diario.server";

export interface EntradaInput {
  id?: string;
  data: string;
  hora: string;
  titulo: string;
  descricao?: string | null;
  area?: string | null;
  tipo: string;
  chave_loop?: string | null;
  loop_manual?: boolean;
  loop_motivo?: string | null;
}

/** Monta o relatório de um dia (padrão 07:00–19:00). */
export const obterRelatorioDiario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { data: string }) => d)
  .handler(async ({ data }): Promise<RelatorioDiario> => {
    const { montarRelatorioDiario } = await import("./relatorio-diario.server");
    return montarRelatorioDiario(data.data);
  });

/** Cria ou atualiza um registro de alteração do dia. */
export const salvarEntradaRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: EntradaInput) => d)
  .handler(async ({ data, context }) => {
    const payload = {
      data: data.data,
      hora: data.hora.length === 5 ? `${data.hora}:00` : data.hora,
      titulo: data.titulo.trim(),
      descricao: data.descricao?.trim() || null,
      area: data.area?.trim() || null,
      tipo: data.tipo,
      chave_loop: data.chave_loop?.trim() || null,
      loop_manual: !!data.loop_manual,
      loop_motivo: data.loop_motivo?.trim() || null,
    };
    if (!payload.titulo) throw new Error("Informe o título da alteração");

    if (data.id) {
      const { error } = await context.supabase
        .from("dev_relatorio_entradas")
        .update(payload as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("dev_relatorio_entradas")
      .insert({ ...payload, origem: "manual", created_by: context.userId } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

/** Remove um registro (somente administradores, garantido pela RLS). */
export const excluirEntradaRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("dev_relatorio_entradas")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Envia agora o relatório do dia informado pelo WhatsApp. */
export const enviarRelatorioAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { data: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: mem } = await context.supabase
      .from("clinica_memberships")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "gestor"])
      .limit(1);
    if (!((mem ?? []) as unknown[]).length) {
      throw new Error("Somente administradores e gestores podem enviar o relatório");
    }
    const { enviarRelatorioWhatsApp } = await import("./relatorio-diario.server");
    return enviarRelatorioWhatsApp(data.data);
  });