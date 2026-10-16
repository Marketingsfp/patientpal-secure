import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MSG_SEM_PERMISSAO_BLOQUEIO, telefoneDoBloqueio } from "./contatos-bloqueados";

type Contexto = { supabase: any; userId: string };

/** Membro da clínica E supervisão/administração (mesma função do RLS da tabela). */
async function exigirSupervisao(ctx: Contexto, clinicaId: string) {
  const [membro, pode] = await Promise.all([
    ctx.supabase.rpc("is_member", { _user_id: ctx.userId, _clinica_id: clinicaId }),
    ctx.supabase.rpc("atend_pode_bloquear_contato", {
      _user_id: ctx.userId,
      _clinica_id: clinicaId,
    }),
  ]);
  if (membro.error || !membro.data) throw new Error("Sem acesso a esta clínica");
  if (pode.error || !pode.data) throw new Error(MSG_SEM_PERMISSAO_BLOQUEIO);
}

/** A tela mostra "Bloquear contato" só para quem pode (o servidor confere de novo). */
export const podeBloquearContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: pode } = await (context.supabase as any).rpc("atend_pode_bloquear_contato", {
      _user_id: context.userId,
      _clinica_id: data.clinicaId,
    });
    return { pode: pode === true };
  });

/**
 * Bloqueia o número da conversa e encerra a conversa, sem pesquisa de
 * satisfação e sem mensagem ao paciente. As próximas mensagens dele ficam
 * guardadas, mas não acionam a Nina nem a fila (webhook).
 */
export const bloquearContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        motivo: z.string().trim().min(3, "Informe o motivo do bloqueio.").max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Contexto;
    await exigirSupervisao(ctx, data.clinicaId);
    const { data: conversa, error } = await ctx.supabase
      .from("atend_conversas")
      .select("id, contato_telefone, status")
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conversa) throw new Error("Conversa não encontrada nesta clínica.");
    const telefone = telefoneDoBloqueio(conversa.contato_telefone);
    if (!telefone) throw new Error("Esta conversa não tem um telefone válido para bloquear.");

    const { error: erroBloqueio } = await ctx.supabase.from("atend_contatos_bloqueados").upsert(
      {
        clinica_id: data.clinicaId,
        telefone,
        motivo: data.motivo,
        bloqueado_por: ctx.userId,
      },
      { onConflict: "clinica_id,telefone", ignoreDuplicates: true },
    );
    if (erroBloqueio) throw new Error(erroBloqueio.message);

    if (conversa.status !== "closed") {
      const { resolverConversaCore } = await import("./resolver-conversa.server");
      await resolverConversaCore(ctx.supabase as never, {
        clinicaId: data.clinicaId,
        conversaId: data.conversaId,
        userId: ctx.userId,
        motivo: `Contato bloqueado: ${data.motivo}`.slice(0, 500),
        adiarResumo: true,
      });
    }
    return { ok: true as const };
  });

export const desbloquearContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Contexto;
    await exigirSupervisao(ctx, data.clinicaId);
    const { error } = await ctx.supabase
      .from("atend_contatos_bloqueados")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type ContatoBloqueadoView = {
  id: string;
  telefone: string;
  motivo: string;
  bloqueadoEm: string;
  bloqueadoPor: string;
};

export const listarContatosBloqueados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ContatoBloqueadoView[]> => {
    const ctx = context as unknown as Contexto;
    await exigirSupervisao(ctx, data.clinicaId);
    const { data: linhas, error } = await ctx.supabase
      .from("atend_contatos_bloqueados")
      .select("id, telefone, motivo, bloqueado_em, bloqueado_por")
      .eq("clinica_id", data.clinicaId)
      .order("bloqueado_em", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const ids = [...new Set((linhas ?? []).map((l: any) => String(l.bloqueado_por)))];
    const { data: perfis } = ids.length
      ? await ctx.supabase.from("profiles").select("id, nome").in("id", ids)
      : { data: [] };
    const nomes = new Map((perfis ?? []).map((p: any) => [String(p.id), String(p.nome ?? "")]));
    return (linhas ?? []).map((l: any) => ({
      id: String(l.id),
      telefone: String(l.telefone),
      motivo: String(l.motivo),
      bloqueadoEm: String(l.bloqueado_em),
      bloqueadoPor: nomes.get(String(l.bloqueado_por)) || "Supervisão",
    }));
  });
