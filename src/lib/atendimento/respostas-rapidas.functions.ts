/**
 * Mensagens rápidas do atendimento — acesso a dados.
 *
 * Todo acesso passa por RLS (cliente autenticado do usuário) e pela checagem
 * de membro da clínica. Criar/editar/excluir exige permissão de ESCRITA no
 * módulo de mensagens prontas, inclusive para mensagens pessoais.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { normalizarComando, validarComando } from "@/lib/atendimento/respostas-rapidas";

async function assertMember(supabase: SupabaseClient<Database>, userId: string, clinicaId: string) {
  const { data, error } = await supabase.rpc("is_member", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
}

/** Espelha `usePermissoes`: perfil_permissoes é a fonte, preset é o padrão. */
async function podeEscreverAtendimento(
  supabase: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
): Promise<boolean> {
  const { carregarAcessosOsZap } = await import("@/lib/permissoes-oszap.server");
  const acessos = await carregarAcessosOsZap(supabase, userId, clinicaId);
  return acessos["oszap-mensagens-prontas"] === "write";
}

const camposSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  comando: z.string().trim().min(1).max(41),
  conteudo: z.string().trim().min(1).max(3000),
  categoria: z.string().trim().max(60).nullish(),
  ativo: z.boolean(),
  escopo: z.enum(["clinica", "pessoal"]),
});

/* =========================================================
 *  LEITURA
 * ======================================================= */
export const listarRespostasRapidas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);

    const [respR, favR, usosR] = await Promise.all([
      context.supabase
        .from("atend_respostas_rapidas")
        .select(
          "id, clinica_id, comando, nome, conteudo, categoria, ativo, escopo, owner_user_id, updated_at",
        )
        .eq("clinica_id", data.clinicaId)
        .order("comando"),
      context.supabase
        .from("atend_resposta_favoritos")
        .select("resposta_id")
        .eq("clinica_id", data.clinicaId)
        .eq("user_id", context.userId),
      context.supabase
        .from("atend_resposta_usos")
        .select("resposta_id, created_at")
        .eq("clinica_id", data.clinicaId)
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    if (respR.error) throw new Error(respR.error.message);

    const usosLinhas = (usosR.data ?? []).filter((u) => u.resposta_id);
    const usos: Record<string, number> = {};
    const recentes: string[] = [];
    for (const u of usosLinhas) {
      const id = u.resposta_id as string;
      usos[id] = (usos[id] ?? 0) + 1;
      if (!recentes.includes(id) && recentes.length < 10) recentes.push(id);
    }

    return {
      respostas: respR.data ?? [],
      favoritos: (favR.data ?? []).map((f) => f.resposta_id as string),
      usos,
      recentes,
      podeGerenciar: await podeEscreverAtendimento(
        context.supabase,
        context.userId,
        data.clinicaId,
      ),
    };
  });

/* =========================================================
 *  CRUD
 * ======================================================= */
export const salvarRespostaRapida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    camposSchema.extend({ clinicaId: z.string().uuid(), id: z.string().uuid().nullish() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);

    const ok = await podeEscreverAtendimento(context.supabase, context.userId, data.clinicaId);
    if (!ok) throw new Error("Você não tem permissão para editar mensagens rápidas.");

    const erro = validarComando(data.comando);
    if (erro) throw new Error(erro);
    const comando = normalizarComando(data.comando);
    if (!comando) throw new Error("Comando inválido.");

    // Registro existente: garante que pertence à clínica e respeita o escopo.
    if (data.id) {
      const { data: atual } = await context.supabase
        .from("atend_respostas_rapidas")
        .select("id, escopo, owner_user_id")
        .eq("id", data.id)
        .eq("clinica_id", data.clinicaId)
        .maybeSingle();
      if (!atual) throw new Error("Mensagem rápida não encontrada.");
      if (atual.escopo === "pessoal" && atual.owner_user_id !== context.userId)
        throw new Error("Esta mensagem rápida é pessoal de outro atendente.");
    }

    // Duplicidade: só vale entre ATIVAS do mesmo escopo.
    if (data.ativo) {
      let q = context.supabase
        .from("atend_respostas_rapidas")
        .select("id")
        .eq("clinica_id", data.clinicaId)
        .eq("comando", comando)
        .eq("ativo", true)
        .eq("escopo", data.escopo);
      q =
        data.escopo === "pessoal"
          ? q.eq("owner_user_id", context.userId)
          : q.is("owner_user_id", null);
      if (data.id) q = q.neq("id", data.id);
      const { data: dup } = await q.limit(1);
      if (dup && dup.length > 0)
        throw new Error("Já existe uma mensagem rápida utilizando este comando.");
    }

    const payload = {
      clinica_id: data.clinicaId,
      comando,
      nome: data.nome,
      conteudo: data.conteudo,
      categoria: data.categoria?.trim() ? data.categoria.trim() : null,
      ativo: data.ativo,
      escopo: data.escopo,
      owner_user_id: data.escopo === "pessoal" ? context.userId : null,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("atend_respostas_rapidas")
        .update(payload)
        .eq("id", data.id)
        .eq("clinica_id", data.clinicaId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: novo, error } = await context.supabase
      .from("atend_respostas_rapidas")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: novo.id };
  });

export const excluirRespostaRapida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const podeExcluir = await podeEscreverAtendimento(
      context.supabase,
      context.userId,
      data.clinicaId,
    );
    if (!podeExcluir) throw new Error("Você não tem permissão para excluir mensagens rápidas.");
    const { data: atual } = await context.supabase
      .from("atend_respostas_rapidas")
      .select("id, escopo, owner_user_id")
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (!atual) return { ok: true };
    if (atual.escopo === "pessoal") {
      if (atual.owner_user_id !== context.userId)
        throw new Error("Esta mensagem rápida é pessoal de outro atendente.");
    }
    const { error } = await context.supabase
      .from("atend_respostas_rapidas")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  FAVORITOS (individual por usuário)
 * ======================================================= */
export const alternarFavoritoResposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        respostaId: z.string().uuid(),
        favorito: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    if (data.favorito) {
      const { error } = await context.supabase.from("atend_resposta_favoritos").upsert(
        {
          resposta_id: data.respostaId,
          user_id: context.userId,
          clinica_id: data.clinicaId,
        },
        { onConflict: "resposta_id,user_id" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("atend_resposta_favoritos")
        .delete()
        .eq("resposta_id", data.respostaId)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* =========================================================
 *  LOG DE USO (para métricas futuras)
 * ======================================================= */
export const registrarUsoResposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        respostaId: z.string().uuid(),
        conversaId: z.string().uuid().nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    await context.supabase.from("atend_resposta_usos").insert({
      clinica_id: data.clinicaId,
      resposta_id: data.respostaId,
      user_id: context.userId,
      conversa_id: data.conversaId ?? null,
    });
    return { ok: true };
  });
