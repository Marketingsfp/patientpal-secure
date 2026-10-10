import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { carregarAcessosOsZap } from "@/lib/permissoes-oszap.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEPARTAMENTOS_HABILITADOS } from "./departamentos-flag";
import { ipOrigemDepartamentos } from "./departamentos-auditoria.server";

const clinicaSchema = z.object({ clinicaId: z.string().uuid() });
const dadosSchema = z.object({
  departamentos: z.array(z.object({ id: z.string().uuid(), nome: z.string(), ativo: z.boolean() })),
  atendentes: z.array(
    z.object({
      userId: z.string().uuid(),
      nome: z.string(),
      departamentoId: z.string().uuid().nullable(),
      presenca: z.string().nullable(),
    }),
  ),
});

async function assertAcesso(
  db: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
  escrita = false,
) {
  if (!DEPARTAMENTOS_HABILITADOS) throw new Error("Departamentos aguardam publicação.");
  const permissoes = await carregarAcessosOsZap(db, userId, clinicaId);
  const acesso = permissoes["oszap-departamentos"];
  if (!acesso || acesso === "none" || (escrita && acesso !== "write"))
    throw new Error("Sem permissão para gerenciar departamentos.");
  return acesso === "write";
}

export const consultarDepartamentosZap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinicaSchema.parse(i))
  .handler(async ({ data, context }) => {
    const podeEditar = await assertAcesso(context.supabase, context.userId, data.clinicaId);
    const { data: resultado, error } = await (context.supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc("atend_listar_departamentos", {
      _clinica_id: data.clinicaId,
      _ip_origem: ipOrigemDepartamentos(),
    });
    if (error) throw new Error(error.message);
    return { ...dadosSchema.parse(resultado), podeEditar };
  });

export const salvarDepartamentoZap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    clinicaSchema
      .extend({ id: z.string().uuid().nullable(), nome: z.string().trim().min(1).max(120) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAcesso(context.supabase, context.userId, data.clinicaId, true);
    const { data: id, error } = await (context.supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc("atend_salvar_departamento", {
      _clinica_id: data.clinicaId,
      _nome: data.nome,
      _id: data.id,
      _ip_origem: ipOrigemDepartamentos(),
    });
    if (error) throw new Error(error.message);
    return { id: id as string | null };
  });

export const vincularDepartamentoZap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    clinicaSchema
      .extend({ userId: z.string().uuid(), departamentoId: z.string().uuid().nullable() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAcesso(context.supabase, context.userId, data.clinicaId, true);
    const { error } = await (context.supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc("atend_vincular_departamento", {
      _clinica_id: data.clinicaId,
      _user_id: data.userId,
      _departamento_id: data.departamentoId,
      _ip_origem: ipOrigemDepartamentos(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
