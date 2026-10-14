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

export const listarSiteAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as Db;
    const ids = await clinicasAdmin(db, context.userId);
    if (!ids.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: clinicas }, { data: cfgs }] = await Promise.all([
      supabaseAdmin.from("clinicas").select("id, nome").in("id", ids),
      supabaseAdmin
        .from("site_agendamento_config")
        .select("clinica_id, ativo, motivo, atualizado_em, atualizado_por")
        .in("clinica_id", ids),
    ]);
    const autores = [...new Set((cfgs ?? []).map((c) => c.atualizado_por).filter(Boolean))] as string[];
    const nomes = new Map<string, string>();
    if (autores.length) {
      const { data: perfis } = await supabaseAdmin
        .from("profiles")
        .select("id, nome")
        .in("id", autores);
      for (const p of (perfis ?? []) as { id: string; nome: string | null }[])
        nomes.set(p.id, p.nome ?? "");
    }
    return (clinicas ?? [])
      .map((c) => {
        const cfg = (cfgs ?? []).find((x) => x.clinica_id === c.id);
        return {
          clinicaId: c.id as string,
          nome: c.nome as string,
          ativo: cfg ? cfg.ativo : true,
          motivo: cfg?.motivo ?? "",
          atualizadoEm: cfg?.atualizado_em ?? null,
          atualizadoPor: cfg?.atualizado_por ? nomes.get(cfg.atualizado_por) || "Usuário" : null,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  });

export const salvarSiteAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        ativo: z.boolean(),
        motivo: z.string().trim().max(500).optional(),
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
