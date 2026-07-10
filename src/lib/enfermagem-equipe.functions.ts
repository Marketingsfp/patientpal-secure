import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

async function assertManager(userId: string, clinicaId: string) {
  const { data, error } = await supabaseAdmin.rpc("can_manage_clinica", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem permissão para gerenciar a equipe desta clínica");
}

export const salvarVinculosAgendas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        userId: z.string().uuid(),
        recursoIds: z.array(z.string().uuid()).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);

    // Carrega vínculos atuais para o user nesta clínica
    const { data: atuais, error: aErr } = await supabaseAdmin
      .from("enfermagem_recurso_atendentes")
      .select("id, recurso_id")
      .eq("clinica_id", data.clinicaId)
      .eq("user_id", data.userId);
    if (aErr) throw new Error(aErr.message);

    const atuaisSet = new Set((atuais ?? []).map((r) => r.recurso_id));
    const novosSet = new Set(data.recursoIds);

    const paraRemover = (atuais ?? []).filter((r) => !novosSet.has(r.recurso_id)).map((r) => r.id);
    const paraInserir = data.recursoIds
      .filter((rid) => !atuaisSet.has(rid))
      .map((rid) => ({
        clinica_id: data.clinicaId,
        user_id: data.userId,
        recurso_id: rid,
      }));

    if (paraRemover.length) {
      const { error } = await supabaseAdmin
        .from("enfermagem_recurso_atendentes")
        .delete()
        .in("id", paraRemover);
      if (error) throw new Error(error.message);
    }
    if (paraInserir.length) {
      const { error } = await supabaseAdmin
        .from("enfermagem_recurso_atendentes")
        .insert(paraInserir);
      if (error) throw new Error(error.message);
    }
    return { ok: true, total: data.recursoIds.length };
  });

export const listarVinculosAgendas = createServerFn({ method: "POST" })
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
    const { data: rows, error } = await supabaseAdmin
      .from("enfermagem_recurso_atendentes")
      .select("recurso_id")
      .eq("clinica_id", data.clinicaId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => r.recurso_id as string);
  });
