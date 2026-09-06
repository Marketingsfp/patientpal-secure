import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { hojeBR, janelaDiaClinica } from "@/lib/date-utils";
import { z } from "zod";
import {
  STATUS_FECHADOS,
  escopoEscondeFechadas,
  normalizarEscopo,
  filtroEscopoInbox,
} from "@/lib/atendimento/escopo-inbox";
import { loadWhatsAppConfig, metaSendText } from "./whatsapp.server";

/* =========================================================
 *  Helpers
 * ======================================================= */
async function assertMember(
  supabase: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
) {
  const { data, error } = await supabase.rpc("is_member", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
}
async function assertManager(
  supabase: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
) {
  const { data, error } = await supabase.rpc("can_manage_clinica", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas gestores/admins podem alterar isto");
}

/**
 * Confere que a conversa realmente pertence à clínica informada.
 *
 * Defesa adicional ao RLS: confirma que o identificador recebido pertence à
 * clínica selecionada antes de executar a ação. A sessão autenticada também
 * aplica as políticas de isolamento por clínica no banco.
 *
 * Use isto sempre que o id do registro vier do cliente e a consulta não puder
 * ser filtrada direto por `clinica_id`.
 */
async function assertConversaDaClinica(
  supabase: SupabaseClient<Database>,
  conversaId: string,
  clinicaId: string,
) {
  const { data, error } = await supabase
    .from("atend_conversas")
    .select("id")
    .eq("id", conversaId)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Conversa não encontrada nesta clínica");
}

const clinIdSchema = z.object({ clinicaId: z.string().uuid() });

/* =========================================================
 *  CONVERSAS
 * ======================================================= */
export const listarConversas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        status: z
          .enum(["bot_attending", "active", "waiting", "closed", "finished", "all"])
          .default("all"),
        busca: z.string().trim().max(120).optional(),
        canal: z.enum(["whatsapp", "instagram", "facebook", "webchat", "todos"]).default("todos"),
        // Escopo de visibilidade: por padrão o atendente vê só o que está
        // atribuído a ele agora. "todas" é privilégio de gestor/admin.
        escopo: z
          .enum(["minhas", "nina", "nao_atribuidas", "fechadas", "equipe", "todas"])
          .default("minhas")
          .transform((v) => normalizarEscopo(v)),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    // FASE 3 — medição por etapa. Sem dado de paciente no log: só tempos.
    const t0 = Date.now();
    const marcos: Record<string, number> = {};
    let ultimo = t0;
    const marcar = (etapa: string) => {
      const agora = Date.now();
      marcos[etapa] = agora - ultimo;
      ultimo = agora;
    };

    // Autorização e permissão de gestão não dependem uma da outra: saem juntas.
    const [, podeGerirRes] = await Promise.all([
      assertMember(context.supabase, context.userId, data.clinicaId),
      (async () => {
        try {
          const { data: podeGerir } = await context.supabase.rpc("can_manage_clinica", {
            _user_id: context.userId,
            _clinica_id: data.clinicaId,
          });
          return !!podeGerir;
        } catch {
          return false;
        }
      })(),
    ]);
    marcar("autorizacao");

    // Varredura barata e limitada dos prazos já vencidos desta clínica, para
    // que a transferência automática aconteça mesmo sem mensagem nova.
    try {
      const { processarTimeoutsEsperaPaciente } = await import("@/lib/nina/espera-timeout.server");
      await processarTimeoutsEsperaPaciente({ clinicaId: data.clinicaId, limite: 10 });
    } catch (e) {
      console.error("[nina-timeout] varredura na listagem falhou", e);
    }
    marcar("timeouts");

    // Gestor/admin da clínica pode escolher ver tudo; atendente comum, não.
    const gestor = !!podeGerirRes;
    const filtroEscopo = filtroEscopoInbox({
      escopo: data.escopo,
      userId: context.userId,
      gestor,
    });

    let q = context.supabase
      .from("atend_conversas")
      .select("*")
      // Conversas do console de homologação nunca aparecem no atendimento real.
      .eq("is_teste", false)
      .eq("clinica_id", data.clinicaId)
      .order("ultima_msg_em", { ascending: false })
      .limit(data.limit);
    // Escopo aplicado na própria consulta (nunca filtrado só no frontend).
    if (filtroEscopo.tipo === "atribuida") q = q.eq("atribuida_user_id", filtroEscopo.userId);
    else if (filtroEscopo.tipo === "sem_responsavel")
      q = q.is("atribuida_user_id", null).neq("owner_type", "AI");
    else if (filtroEscopo.tipo === "nina") q = q.eq("owner_type", "AI");
    else if (filtroEscopo.tipo === "fechadas") {
      q = q.in("status", [...STATUS_FECHADOS]);
      if (filtroEscopo.userId) q = q.eq("atribuida_user_id", filtroEscopo.userId);
    }
    // Filtros operacionais mostram só conversas em andamento.
    if (escopoEscondeFechadas(data.escopo, gestor)) {
      q = q.not("status", "in", `(${STATUS_FECHADOS.join(",")})`);
    }
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.canal !== "todos") q = q.eq("canal", data.canal);
    if (data.busca) {
      // Sanitiza para evitar injeção de filtros PostgREST via .or()
      // — remove operadores e separadores reservados.
      const safe = data.busca.replace(/[%_,.()'"\\:*]/g, "");
      if (safe.length > 0) {
        q = q.or(
          `contato_nome.ilike.%${safe}%,contato_telefone.ilike.%${safe}%,protocol_number.ilike.%${safe}%`,
        );
      }
    }
    const { data: rows, error } = await q;
    marcar("consulta");
    if (error) throw new Error(error.message);
    const total = Date.now() - t0;
    // Só registra quando realmente demorou, para não poluir o log.
    if (total > 400) {
      console.warn("[atendimento] listarConversas lenta", {
        totalMs: total,
        linhas: rows?.length ?? 0,
        etapas: marcos,
      });
    }
    return rows ?? [];
  });

/**
 * FASE 2 — Deep link / F5: carrega UMA conversa pelo id do endereço, mesmo
 * que ela não esteja na lista do filtro atual. O isolamento continua valendo:
 * exige ser membro da clínica e que a conversa pertença a ela (além do RLS).
 */
export const obterConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    {
      const { assertAcessoConversa } = await import("./atendimento/acesso-conversa.server");
      await assertAcessoConversa(context.supabase, context.userId, data.clinicaId, data.conversaId);
    }
    const { data: row, error } = await context.supabase
      .from("atend_conversas")
      .select("*")
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId)
      .eq("is_teste", false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

/**
 * FASE 2 — Localizar uma conversa pelo número permanente (#1342).
 *
 * Consulta exata e indexada: nada de varrer mensagens nem baixar a lista
 * inteira no navegador. Encontra mesmo que a conversa seja antiga, esteja
 * encerrada ou fora do filtro que a pessoa está vendo.
 *
 * Permissão continua valendo: só devolve conversas desta clínica e que este
 * usuário pode ver. Conversa inexistente e conversa sem acesso recebem a MESMA
 * resposta neutra (`null`), para não revelar a existência de nada restrito.
 * Conversas de homologação (`is_teste`) ficam fora da busca operacional.
 *
 * Somente leitura: não muda responsável, fila nem status.
 */
export const buscarConversaPorNumero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        numero: z.number().int().positive().max(1_000_000_000_000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: row, error } = await context.supabase
      .from("atend_conversas")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .eq("numero_conversa", data.numero)
      .eq("is_teste", false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    try {
      const { assertAcessoConversa } = await import("./atendimento/acesso-conversa.server");
      await assertAcessoConversa(context.supabase, context.userId, data.clinicaId, row.id);
    } catch {
      // Resposta neutra: sem acesso é indistinguível de não existir.
      return null;
    }
    return row;
  });


/**
 * Contagem independente de cada filtro da Inbox. Cada número é calculado com
 * o mesmo critério da listagem, sem misturar escopos.
 */
export const contarConversasInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    let gestor = false;
    try {
      const { data: podeGerir } = await context.supabase.rpc("can_manage_clinica", {
        _user_id: context.userId,
        _clinica_id: data.clinicaId,
      });
      gestor = !!podeGerir;
    } catch {
      gestor = false;
    }

    const base = () =>
      context.supabase
        .from("atend_conversas")
        .select("id", { count: "exact", head: true })
        .eq("is_teste", false)
        .eq("clinica_id", data.clinicaId);
    const abertas = () => base().not("status", "in", `(${STATUS_FECHADOS.join(",")})`);

    const [minhas, nina, naoAtribuidas, fechadas, todas] = await Promise.all([
      abertas().eq("atribuida_user_id", context.userId),
      abertas().eq("owner_type", "AI"),
      abertas().is("atribuida_user_id", null).neq("owner_type", "AI"),
      gestor
        ? base().in("status", [...STATUS_FECHADOS])
        : base().in("status", [...STATUS_FECHADOS]).eq("atribuida_user_id", context.userId),
      gestor ? abertas() : Promise.resolve({ count: null } as { count: number | null }),
    ]);

    return {
      gestor,
      minhas: minhas.count ?? 0,
      nina: nina.count ?? 0,
      nao_atribuidas: naoAtribuidas.count ?? 0,
      fechadas: fechadas.count ?? 0,
      equipe: todas.count ?? 0,
    };
  });

/**
 * Diz se o usuário logado é gestor/admin da clínica — usado pela Inbox para
 * oferecer (ou não) a visão "Todas as conversas da clínica".
 */
export const souGestorAtendimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: podeGerir } = await context.supabase.rpc("can_manage_clinica", {
      _user_id: context.userId,
      _clinica_id: data.clinicaId,
    });
    return { gestor: !!podeGerir };
  });

/**
 * Registra um evento de estado da conversa (resolvida, atribuída, transferida…)
 * usando a sessão do próprio usuário — a política de RLS exige ser membro da
 * clínica. Falha aqui nunca derruba a ação principal: o evento é o registro
 * visual da linha do tempo, não a operação em si.
 */
async function registrarEventoConversa(
  supabase: { from: (t: string) => any },
  args: {
    clinicaId: string;
    conversaId: string;
    evento: string;
    userId?: string | null;
    departamentoId?: string | null;
    motivo?: string | null;
    detalhes?: Record<string, unknown> | null;
  },
) {
  const { error } = await supabase.from("atend_conversa_eventos").insert({
    clinica_id: args.clinicaId,
    conversa_id: args.conversaId,
    evento: args.evento,
    user_id: args.userId ?? null,
    departamento_id: args.departamentoId ?? null,
    motivo: args.motivo ?? null,
    detalhes: args.detalhes ?? null,
  });
  if (error) console.error("[atendimento] evento não registrado:", args.evento, error.message);
}

export const atribuirConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        userId: z.string().uuid().nullable(),
        departamentoId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const patch: {
      atribuida_user_id: string | null;
      status: "active" | "waiting";
      departamento_id?: string | null;
      owner_type: "HUMAN" | "NONE";
      ai_enabled: boolean;
      assigned_at?: string | null;
    } = {
      atribuida_user_id: data.userId,
      status: data.userId ? "active" : "waiting",
      // Enquanto houver pessoa (ou fila aguardando pessoa), a Nina fica muda.
      owner_type: data.userId ? "HUMAN" : "NONE",
      ai_enabled: false,
      assigned_at: data.userId ? new Date().toISOString() : null,
    };
    if (data.departamentoId !== undefined) patch.departamento_id = data.departamentoId;
    const { error } = await context.supabase
      .from("atend_conversas")
      .update(patch)
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    await registrarEventoConversa(context.supabase, {
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      evento: data.userId ? "ASSUMIDA" : "DESATRIBUIDA",
      userId: data.userId ?? context.userId,
      departamentoId: data.departamentoId ?? null,
    });
    return { ok: true };
  });

export const transferirConversa = createServerFn({ method: "POST" })

  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        paraUserId: z.string().uuid().nullable().optional(),
        paraDepartamentoId: z.string().uuid().nullable().optional(),
        motivo: z.string().trim().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: conv, error: e1 } = await context.supabase
      .from("atend_conversas")
      .select("atribuida_user_id, departamento_id")
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    // A conversa pode ter sido encerrada/removida enquanto estava selecionada
    // no inbox. Nesse caso devolvemos `null` em vez de derrubar a tela.
    if (!conv) return null;
    await context.supabase.from("atend_transferencias").insert({
      clinica_id: data.clinicaId,
      conversa_id: data.conversaId,
      de_user_id: conv.atribuida_user_id,
      para_user_id: data.paraUserId ?? null,
      de_departamento_id: conv.departamento_id,
      para_departamento_id: data.paraDepartamentoId ?? null,
      motivo: data.motivo ?? null,
    });
    const { error: e2 } = await context.supabase
      .from("atend_conversas")
      .update({
        atribuida_user_id: data.paraUserId ?? null,
        departamento_id: data.paraDepartamentoId ?? conv.departamento_id,
        status: data.paraUserId ? "active" : "waiting",
        owner_type: data.paraUserId ? "HUMAN" : "NONE",
        ai_enabled: false,
        assigned_at: data.paraUserId ? new Date().toISOString() : null,
      })
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId);
    if (e2) throw new Error(e2.message);
    await registrarEventoConversa(context.supabase, {
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      evento: "TRANSFERIDA",
      userId: context.userId,
      departamentoId: data.paraDepartamentoId ?? conv.departamento_id,
      motivo: data.motivo ?? null,
      detalhes: { para_user_id: data.paraUserId ?? null },
    });
    return { ok: true };
  });

export const fecharConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    // Só o responsável atual encerra (evita encerrar atendimento de outra pessoa).
    const { data: dono } = await context.supabase
      .from("atend_conversas")
      .select("atribuida_user_id, last_assigned_user_id, nina_fluxo_estado")
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (dono?.atribuida_user_id && dono.atribuida_user_id !== context.userId)
      throw new Error("Esta conversa está com outro atendente. Assuma antes de encerrar.");
    // Mecanismo ÚNICO de resolução (o mesmo usado pela Nina no encerramento
    // automático): status, prazos, estados transacionais, evento e resumo.
    const { resolverConversaCore } = await import("@/lib/atendimento/resolver-conversa.server");
    const r = await resolverConversaCore(context.supabase as never, {
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      userId: context.userId,
    });
    return { ok: true, protocol: r.protocol as string };


  });

export const marcarLida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    await context.supabase
      .from("atend_conversas")
      .update({ unread_count: 0 })
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId);
    return { ok: true };
  });

/* =========================================================
 *  NOTAS INTERNAS
 * ======================================================= */
export const listarNotas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    {
      const { assertAcessoConversa } = await import("./atendimento/acesso-conversa.server");
      await assertAcessoConversa(context.supabase, context.userId, data.clinicaId, data.conversaId);
    }
    const { data: rows, error } = await context.supabase
      .from("atend_notas_internas")
      .select("*")
      .eq("conversa_id", data.conversaId)
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const criarNota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        conteudo: z.string().trim().min(1).max(2000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    {
      const { assertAcessoConversa } = await import("./atendimento/acesso-conversa.server");
      await assertAcessoConversa(context.supabase, context.userId, data.clinicaId, data.conversaId);
    }
    // Sem isto, a nota entraria na conversa de outra clínica: o INSERT grava
    // `clinica_id` da clínica do autor, mas `conversa_id` vem do cliente.
    await assertConversaDaClinica(context.supabase, data.conversaId, data.clinicaId);
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("nome")
      .eq("id", context.userId)
      .maybeSingle();
    const { error } = await context.supabase.from("atend_notas_internas").insert({
      clinica_id: data.clinicaId,
      conversa_id: data.conversaId,
      autor_user_id: context.userId,
      autor_nome: prof?.nome ?? null,
      conteudo: data.conteudo,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  DEPARTAMENTOS
 * ======================================================= */
export const listarDepartamentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: deps, error } = await context.supabase
      .from("atend_departamentos")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("prioridade", { ascending: true })
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return deps ?? [];
  });

const DepartSchema = z.object({
  clinicaId: z.string().uuid(),
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(500).optional(),
  distribuicao: z.enum(["manual", "round_robin", "menor_carga"]).default("manual"),
  prioridade: z.number().int().min(0).max(999).default(0),
  ativo: z.boolean().default(true),
});

export const salvarDepartamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DepartSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    const row = {
      clinica_id: data.clinicaId,
      nome: data.nome,
      descricao: data.descricao ?? null,
      distribuicao: data.distribuicao,
      prioridade: data.prioridade,
      ativo: data.ativo,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("atend_departamentos")
        .update(row)
        .eq("id", data.id)
        .eq("clinica_id", data.clinicaId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("atend_departamentos")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirDepartamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase
      .from("atend_departamentos")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  MEMBROS DE DEPARTAMENTO
 * ======================================================= */
export const listarMembros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ clinicaId: z.string().uuid(), departamentoId: z.string().uuid().optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    let q = context.supabase
      .from("atend_departamento_membros")
      .select("*")
      .eq("clinica_id", data.clinicaId);
    if (data.departamentoId) q = q.eq("departamento_id", data.departamentoId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return [] as any[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("id, nome")
      .in("id", userIds);
    const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
    return rows.map((r: any) => ({ ...r, nome: nameById.get(r.user_id) ?? r.user_id }));
  });

export const adicionarMembro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        departamentoId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(["agente", "supervisor", "gestor", "admin"]).default("agente"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    // `departamentoId` vem do cliente: sem conferir, um gestor vincularia um
    // usuário a um departamento de outra clínica.
    const { data: dep } = await context.supabase
      .from("atend_departamentos")
      .select("id")
      .eq("id", data.departamentoId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (!dep) throw new Error("Departamento não encontrado nesta clínica");
    const { error } = await context.supabase.from("atend_departamento_membros").upsert(
      {
        clinica_id: data.clinicaId,
        departamento_id: data.departamentoId,
        user_id: data.userId,
        role: data.role,
      },
      { onConflict: "departamento_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removerMembro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase
      .from("atend_departamento_membros")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const travarMinhaFila = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), travada: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase
      .from("atend_departamento_membros")
      .update({ queue_locked: data.travada })
      .eq("clinica_id", data.clinicaId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    // A presença é a fonte da verdade da distribuição: fechar a fila precisa
    // derrubar o "ONLINE", senão o atendente continua recebendo conversas
    // mesmo aparecendo como offline na tela (e quem não está em nenhum
    // departamento não tinha nenhum bloqueio aplicado).
    const { error: eP } = await context.supabase.from("atend_agente_presenca").upsert(
      {
        clinica_id: data.clinicaId,
        user_id: context.userId,
        status: data.travada ? "OFFLINE" : "ONLINE",
        aceita_novas: !data.travada,
        visto_em: new Date().toISOString(),
      },
      { onConflict: "clinica_id,user_id" },
    );
    if (eP) throw new Error(eP.message);
    return { ok: true };
  });

export const meuStatusAgente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const [{ data: rows }, { data: pres }] = await Promise.all([
      context.supabase
        .from("atend_departamento_membros")
        .select("queue_locked")
        .eq("clinica_id", data.clinicaId)
        .eq("user_id", context.userId),
      context.supabase
        .from("atend_agente_presenca")
        .select("status, aceita_novas")
        .eq("clinica_id", data.clinicaId)
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    const total = rows?.length ?? 0;
    // Fonte da verdade: a presença registrada. Só cai no critério antigo
    // (departamentos) quando ainda não existe presença gravada.
    const presencaStatus = (pres?.status as string | undefined) ?? null;
    const filaAberta = presencaStatus
      ? presencaStatus === "ONLINE" && pres?.aceita_novas !== false
      : (rows ?? []).some((r: any) => !r.queue_locked);
    return { isMember: total > 0, filaAberta, totalDeptos: total, presencaStatus };
  });


/* =========================================================
 *  BASE DE CONHECIMENTO
 * ======================================================= */
export const listarKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: rows, error } = await context.supabase
      .from("atend_kb")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().optional(),
        titulo: z.string().trim().min(1).max(200),
        conteudo: z.string().trim().min(1).max(20000),
        categoria: z.string().trim().max(80).optional(),
        tags: z.array(z.string().trim().max(40)).max(20).default([]),
        publicado: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const row = {
      clinica_id: data.clinicaId,
      titulo: data.titulo,
      conteudo: data.conteudo,
      categoria: data.categoria ?? null,
      tags: data.tags,
      publicado: data.publicado,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("atend_kb")
        .update(row)
        .eq("id", data.id)
        .eq("clinica_id", data.clinicaId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("atend_kb")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase
      .from("atend_kb")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  MACROS
 * ======================================================= */
export const listarMacros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: rows, error } = await context.supabase
      .from("atend_macros")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("atalho");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarMacro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().optional(),
        atalho: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[a-z0-9_-]+$/i, "Use letras, números, hífen ou underscore"),
        titulo: z.string().trim().min(1).max(120),
        conteudo: z.string().trim().min(1).max(4000),
        ativo: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const row = {
      clinica_id: data.clinicaId,
      atalho: data.atalho.toLowerCase(),
      titulo: data.titulo,
      conteudo: data.conteudo,
      ativo: data.ativo,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("atend_macros")
        .update(row)
        .eq("id", data.id)
        .eq("clinica_id", data.clinicaId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("atend_macros")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirMacro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase
      .from("atend_macros")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  MOTIVOS DE PAUSA + LOG
 * ======================================================= */
export const listarPauseReasons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: rows, error } = await context.supabase
      .from("atend_pause_reasons")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("nome");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarPauseReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().optional(),
        nome: z.string().trim().min(1).max(80),
        cor: z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#6b7280"),
        icone: z.string().trim().max(40).optional(),
        tolerancia_minutos: z.number().int().min(0).max(480).default(5),
        conta_trabalhado: z.boolean().default(false),
        ativo: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    const row = {
      clinica_id: data.clinicaId,
      nome: data.nome,
      cor: data.cor,
      icone: data.icone ?? null,
      tolerancia_minutos: data.tolerancia_minutos,
      conta_trabalhado: data.conta_trabalhado,
      ativo: data.ativo,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("atend_pause_reasons")
        .update(row)
        .eq("id", data.id)
        .eq("clinica_id", data.clinicaId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("atend_pause_reasons")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirPauseReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase
      .from("atend_pause_reasons")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const iniciarPausa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), reasonId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    // `reasonId` vem do cliente: confere que o motivo é desta clínica.
    const { data: motivo } = await context.supabase
      .from("atend_pause_reasons")
      .select("id")
      .eq("id", data.reasonId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (!motivo) throw new Error("Motivo de pausa não encontrado nesta clínica");
    // fecha pausas abertas
    await context.supabase
      .from("atend_pausas_log")
      .update({ finalizada_em: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("finalizada_em", null);
    const { data: ins, error } = await context.supabase
      .from("atend_pausas_log")
      .insert({
        clinica_id: data.clinicaId,
        user_id: context.userId,
        reason_id: data.reasonId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id };
  });

export const finalizarPausa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase
      .from("atend_pausas_log")
      .update({ finalizada_em: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("finalizada_em", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const pausaAtual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: row } = await context.supabase
      .from("atend_pausas_log")
      .select("*, atend_pause_reasons(nome, cor, tolerancia_minutos)")
      .eq("user_id", context.userId)
      .is("finalizada_em", null)
      .order("iniciada_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    return row ?? null;
  });

/* =========================================================
 *  HORÁRIOS
 * ======================================================= */
export const listarHorarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: rows, error } = await context.supabase
      .from("atend_horarios")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("dia_semana")
      .order("hora_inicio");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().optional(),
        dia_semana: z.number().int().min(0).max(6),
        hora_inicio: z.string().regex(/^\d{2}:\d{2}$/),
        hora_fim: z.string().regex(/^\d{2}:\d{2}$/),
        canal: z.enum(["whatsapp", "telefonia", "todos"]).default("whatsapp"),
        ativo: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    const row = {
      clinica_id: data.clinicaId,
      dia_semana: data.dia_semana,
      hora_inicio: data.hora_inicio,
      hora_fim: data.hora_fim,
      canal: data.canal,
      ativo: data.ativo,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("atend_horarios")
        .update(row)
        .eq("id", data.id)
        .eq("clinica_id", data.clinicaId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("atend_horarios")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

export const excluirHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase
      .from("atend_horarios")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  NÚMEROS AUTORIZADOS
 * ======================================================= */
export const listarNumerosAutorizados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: rows, error } = await context.supabase
      .from("atend_numeros_autorizados")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("telefone");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adicionarNumero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        telefone: z
          .string()
          .trim()
          .min(8)
          .max(20)
          .regex(/^\+?\d+$/),
        nota: z.string().trim().max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase.from("atend_numeros_autorizados").insert({
      clinica_id: data.clinicaId,
      telefone: data.telefone,
      nota: data.nota ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removerNumero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase
      .from("atend_numeros_autorizados")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  PROTOCOLO CONFIG
 * ======================================================= */
export const obterProtocoloConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    await context.supabase
      .from("atend_protocolo_config")
      .upsert({ clinica_id: data.clinicaId }, { onConflict: "clinica_id", ignoreDuplicates: true });
    const { data: row, error } = await context.supabase
      .from("atend_protocolo_config")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const salvarProtocoloConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        prefixo: z.string().trim().min(1).max(10),
        formato: z.enum(["ANO-SEQ", "ANOMES-SEQ", "SEQ"]),
        zerar_anualmente: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase.from("atend_protocolo_config").upsert(
      {
        clinica_id: data.clinicaId,
        prefixo: data.prefixo.toUpperCase(),
        formato: data.formato,
        zerar_anualmente: data.zerar_anualmente,
      },
      { onConflict: "clinica_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  BOT CONFIGS
 * ======================================================= */
export const listarBotConfigs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: rows, error } = await context.supabase
      .from("atend_bot_configs")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarBotConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().optional(),
        departamentoId: z.string().uuid().nullable().optional(),
        bot_type: z.enum(["menu", "ai", "both"]).default("ai"),
        welcome_message: z.string().trim().max(2000).optional(),
        menu_options: z
          .array(
            z.object({
              key: z.string().trim().max(10),
              label: z.string().trim().max(120),
              departamento_id: z.string().uuid().optional(),
            }),
          )
          .max(20)
          .default([]),
        ai_prompt: z.string().trim().max(8000).optional(),
        ai_model: z.string().trim().max(80).default("google/gemini-3-flash-preview"),
        max_ai_interactions: z.number().int().min(1).max(50).default(5),
        fallback_departamento_id: z.string().uuid().nullable().optional(),
        ativo: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    const row = {
      clinica_id: data.clinicaId,
      departamento_id: data.departamentoId ?? null,
      bot_type: data.bot_type,
      welcome_message: data.welcome_message ?? null,
      menu_options: data.menu_options,
      ai_prompt: data.ai_prompt ?? null,
      ai_model: data.ai_model,
      max_ai_interactions: data.max_ai_interactions,
      fallback_departamento_id: data.fallback_departamento_id ?? null,
      ativo: data.ativo,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("atend_bot_configs")
        .update(row)
        .eq("id", data.id)
        .eq("clinica_id", data.clinicaId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("atend_bot_configs")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id as string };
  });

/* =========================================================
 *  USUÁRIOS DA CLÍNICA (para selects)
 * ======================================================= */
export const listarUsuariosClinica = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: rows, error } = await context.supabase
      .from("clinica_memberships")
      .select("user_id, role")
      .eq("clinica_id", data.clinicaId)
      .eq("ativo", true);
    if (error) throw new Error(error.message);
    const userIds = (rows ?? []).map((r: any) => r.user_id);
    const { data: profs } = userIds.length
      ? await context.supabase.from("profiles").select("id, nome").in("id", userIds)
      : { data: [] as any[] };
    const nomeMap = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
    return (rows ?? []).map((r: any) => ({
      user_id: r.user_id,
      role: r.role,
      nome: nomeMap.get(r.user_id) ?? r.user_id,
    }));
  });

/* =========================================================
 *  PAINEL — métricas do dia
 * ======================================================= */
export const dashboardAtendimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    // Início do dia civil da CLÍNICA (America/Sao_Paulo). No Worker (UTC),
    // `new Date()` + `setHours(0,0,0)` fazia as métricas "de hoje" incluírem
    // as 3 últimas horas de ontem.
    const isoHoje = janelaDiaClinica(hojeBR()).inicio;
    const [
      { count: hojeCount },
      { count: ativas },
      { count: espera },
      { count: fechadas },
      { data: csatRows },
    ] = await Promise.all([
      context.supabase
        .from("atend_conversas")
        .select("id", { count: "exact", head: true })
        .eq("is_teste", false)
        .eq("clinica_id", data.clinicaId)
        .gte("created_at", isoHoje),
      context.supabase
        .from("atend_conversas")
        .select("id", { count: "exact", head: true })
        .eq("is_teste", false)
        .eq("clinica_id", data.clinicaId)
        .eq("status", "active"),
      context.supabase
        .from("atend_conversas")
        .select("id", { count: "exact", head: true })
        .eq("is_teste", false)
        .eq("clinica_id", data.clinicaId)
        .eq("status", "waiting"),
      context.supabase
        .from("atend_conversas")
        .select("id", { count: "exact", head: true })
        .eq("is_teste", false)
        .eq("clinica_id", data.clinicaId)
        .eq("status", "closed")
        .gte("closed_at", isoHoje),
      context.supabase
        .from("atend_avaliacoes")
        .select("nota")
        .eq("clinica_id", data.clinicaId)
        .gte("created_at", isoHoje),
    ]);
    const csat = (csatRows ?? []).length
      ? (csatRows!.reduce((s: number, r: any) => s + r.nota, 0) / csatRows!.length).toFixed(2)
      : null;
    return {
      conversas_hoje: hojeCount ?? 0,
      ativas: ativas ?? 0,
      em_espera: espera ?? 0,
      fechadas_hoje: fechadas ?? 0,
      csat_hoje: csat,
    };
  });

/* =========================================================
 *  INBOX — mensagens, envio, contato
 * ======================================================= */
export const listarMensagensConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        limit: z.number().int().min(1).max(500).default(200),
        // Cursor da paginação: busca apenas mensagens ANTERIORES a este
        // instante (usado ao rolar para cima em conversas longas).
        antesDe: z.string().min(1).optional(),
        // Cursor da atualização incremental (Realtime): busca apenas
        // mensagens POSTERIORES a este instante.
        depoisDe: z.string().min(1).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    {
      const { assertAcessoConversa } = await import("./atendimento/acesso-conversa.server");
      await assertAcessoConversa(context.supabase, context.userId, data.clinicaId, data.conversaId);
    }
    // Pega as mensagens MAIS RECENTES (descendente) e reordena para exibição.
    // Antes o limite cortava pelo começo e a conversa ficava parada no passado.
    let q = context.supabase
      .from("whatsapp_mensagens")
      .select(
        "id, direction, from_number, to_number, body, tipo, enviada_por, recebida_em, media_url, media_mime, status",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("conversa_id", data.conversaId);
    if (data.antesDe) q = q.lt("recebida_em", data.antesDe);
    if (data.depoisDe) q = q.gt("recebida_em", data.depoisDe);
    const { data: rows, error } = await q
      .order("recebida_em", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []).slice().reverse();
  });


export const enviarMensagemConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        text: z.string().trim().min(1).max(3500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    {
      const { assertAcessoConversa } = await import("./atendimento/acesso-conversa.server");
      await assertAcessoConversa(context.supabase, context.userId, data.clinicaId, data.conversaId);
    }
    const cfg = await loadWhatsAppConfig(data.clinicaId);
    if (!cfg?.phone_number_id || !cfg?.access_token) throw new Error("WhatsApp não configurado.");
    const { data: conv, error: cErr } = await context.supabase
      .from("atend_conversas")
      .select(
        "id, contato_telefone, primeiro_resp_em, aguardando_desde, atribuida_user_id, status",
      )
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    // A conversa pode ter sido encerrada/removida enquanto estava selecionada
    // no inbox. Nesse caso devolvemos `null` em vez de derrubar a tela.
    if (!conv) return null;
    if (!conv.contato_telefone) throw new Error("Conversa sem telefone");
    // Bloqueio de atendimento duplicado: só o responsável atual pode responder.
    if (conv.status === "closed")
      throw new Error("Conversa encerrada. Reabra o atendimento para responder.");
    if (conv.atribuida_user_id && conv.atribuida_user_id !== context.userId)
      throw new Error(
        "Esta conversa está sendo atendida por outra pessoa. Use “Assumir conversa” para responder.",
      );
    if (!conv.atribuida_user_id) {
      // Conversa livre: quem responde primeiro vira responsável, de forma atômica.
      const { data: claim, error: claimErr } = await context.supabase
        .from("atend_conversas")
        .update({
          atribuida_user_id: context.userId,
          status: "active",
          owner_type: "HUMAN",
          ai_enabled: false,
          assigned_at: new Date().toISOString(),
          atribuicao_origem: "resposta_direta",
        })
        .eq("id", data.conversaId)
        .eq("clinica_id", data.clinicaId)
        .is("atribuida_user_id", null)
        .neq("status", "closed")
        .select("id");
      if (claimErr) throw new Error(claimErr.message);
      if (!claim || claim.length === 0)
        throw new Error(
          "Outra pessoa assumiu esta conversa agora. Sua mensagem não foi enviada.",
        );
      await registrarEventoConversa(context.supabase, {
        clinicaId: data.clinicaId,
        conversaId: data.conversaId,
        evento: "ASSUMIDA",
        userId: context.userId,
      });
    }


    const to = conv.contato_telefone.startsWith("+")
      ? conv.contato_telefone
      : `+${conv.contato_telefone}`;
    const { wa_message_id } = await metaSendText(
      cfg.phone_number_id,
      cfg.access_token,
      to,
      data.text,
    );

    await context.supabase.from("whatsapp_mensagens").insert({
      clinica_id: data.clinicaId,
      conversa_id: data.conversaId,
      wa_message_id,
      direction: "out",
      from_number: cfg.display_phone_number,
      to_number: to,
      body: data.text,
      tipo: "text",
      status: "sent",
      enviada_por: "humano",
    });

    // SLA primeira resposta
    const patch: any = {
      atribuida_user_id: conv.atribuida_user_id ?? context.userId,
      status: "active",
    };
    if (!conv.primeiro_resp_em) {
      const ref = conv.aguardando_desde ?? conv.primeiro_resp_em;
      patch.primeiro_resp_em = new Date().toISOString();
      if (ref) {
        patch.sla_first_response_seg = Math.max(
          0,
          Math.round((Date.now() - new Date(ref).getTime()) / 1000),
        );
      }
    }
    await context.supabase
      .from("atend_conversas")
      .update(patch)
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId);

    return { ok: true, wa_message_id };
  });

export const obterDadosContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    {
      const { assertAcessoConversa } = await import("./atendimento/acesso-conversa.server");
      await assertAcessoConversa(context.supabase, context.userId, data.clinicaId, data.conversaId);
    }
    const { data: conv } = await context.supabase
      .from("atend_conversas")
      .select("*, atend_departamentos(nome)")
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    // A conversa pode ter sido encerrada/removida enquanto estava selecionada
    // no inbox. Nesse caso devolvemos `null` em vez de derrubar a tela.
    if (!conv) return null;

    let paciente: any = null;
    let agendamentos: any[] = [];
    let contratos: any[] = [];
    // FASE 4 — como o contato foi obtido nesta abertura ("id" = vínculo direto).
    let contatoVia: "id" | "telefone" | "sem_contato" = "sem_contato";

    // Fase 2: o vínculo direto (`contato_paciente_id`) é a referência
    // principal. Só quando ele não existe é que buscamos pelo telefone
    // normalizado — e, achando, gravamos o vínculo para não repetir.
    {
      const { resolverContatoConversa } = await import("./atendimento/vinculo-contato.server");
      const resolvido = await resolverContatoConversa(context.supabase, {
        clinicaId: data.clinicaId,
        conversaId: data.conversaId,
        contatoPacienteId: conv.contato_paciente_id ?? null,
        contatoTelefone: conv.contato_telefone ?? null,
      });
      if (resolvido.pacienteId) {
        const { data: p } = await context.supabase
          .from("pacientes")
          .select("id, nome, telefone, email, cpf, data_nascimento, sexo, cidade, estado")
          .eq("id", resolvido.pacienteId)
          .maybeSingle();
        paciente = p;
        contatoVia = resolvido.viaVinculo ? "id" : "telefone";
        if (resolvido.vinculado) (conv as any).contato_paciente_id = resolvido.pacienteId;
      }
    }

    if (paciente?.id) {
      const [agR, ctR] = await Promise.all([
        context.supabase
          .from("agendamentos")
          // O nome do médico não fica em `agendamentos`; vem do vínculo com
          // `medicos` (a coluna medico_nome nunca existiu e derrubava o drawer).
          .select("id, inicio, procedimento, tipo_atendimento, status, medicos(nome)")

          .eq("paciente_id", paciente.id)
          .order("inicio", { ascending: false })
          .limit(5),
        context.supabase
          .from("contratos_assinatura")
          .select("id, numero, status, data_inicio")
          .eq("paciente_id", paciente.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      // Mantém o formato antigo (`medico_nome`) para quem consome no front.
      agendamentos = ((agR.data ?? []) as Array<Record<string, unknown>>).map((a) => {
        const m = a.medicos as { nome?: string } | Array<{ nome?: string }> | null;
        const nome = Array.isArray(m) ? (m[0]?.nome ?? null) : (m?.nome ?? null);
        const { medicos: _m, ...resto } = a;
        return { ...resto, medico_nome: nome };
      });
      contratos = ctR.data ?? [];
    }

    const { data: atribuidoProfile } = conv.atribuida_user_id
      ? await context.supabase
          .from("profiles")
          .select("nome")
          .eq("id", conv.atribuida_user_id)
          .maybeSingle()
      : { data: null };

    return {
      conversa: conv,
      paciente,
      agendamentos,
      contratos,
      atribuido_nome: atribuidoProfile?.nome ?? null,
      contato_via: contatoVia,
    };
  });

/* =========================================================
 *  ROUND-ROBIN — auto-atribuição
 * ======================================================= */
export const autoAtribuirRoundRobin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        departamentoId: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);

    // Pega departamento alvo
    let deptId = data.departamentoId;
    if (!deptId) {
      const { data: c } = await context.supabase
        .from("atend_conversas")
        .select("departamento_id")
        .eq("id", data.conversaId)
        .eq("clinica_id", data.clinicaId)
        .maybeSingle();
      deptId = c?.departamento_id ?? undefined;
    }
    if (!deptId) throw new Error("Conversa sem departamento — configure roteamento.");

    // Membros disponíveis (não em pausa, fila desbloqueada)
    const { data: membros } = await context.supabase
      .from("atend_departamento_membros")
      .select("user_id, max_simultaneas, queue_locked")
      .eq("clinica_id", data.clinicaId)
      .eq("departamento_id", deptId)
      .eq("queue_locked", false);
    if (!membros || membros.length === 0) {
      // fica em waiting na fila do departamento
      await context.supabase
        .from("atend_conversas")
        .update({
          departamento_id: deptId,
          status: "waiting",
          aguardando_desde: new Date().toISOString(),
        })
        .eq("id", data.conversaId)
        .eq("clinica_id", data.clinicaId);
      return { ok: false, motivo: "Sem agentes disponíveis" };
    }

    // Filtra em pausa
    const agora = new Date().toISOString();
    const { data: pausados } = await context.supabase
      .from("atend_pausas_log")
      .select("user_id")
      .is("finalizada_em", null)
      .eq("clinica_id", data.clinicaId);
    const pausadosSet = new Set((pausados ?? []).map((p: any) => p.user_id));

    // Carga atual
    const userIds = membros.map((m: any) => m.user_id).filter((u: string) => !pausadosSet.has(u));
    if (userIds.length === 0) {
      await context.supabase
        .from("atend_conversas")
        .update({
          departamento_id: deptId,
          status: "waiting",
          aguardando_desde: agora,
        })
        .eq("id", data.conversaId)
        .eq("clinica_id", data.clinicaId);
      return { ok: false, motivo: "Todos em pausa" };
    }
    const { data: cargas } = await context.supabase
      .from("atend_conversas")
      .select("atribuida_user_id")
      .eq("clinica_id", data.clinicaId)
      .in("status", ["active", "waiting"])
      .in("atribuida_user_id", userIds);
    const cargaMap = new Map<string, number>();
    for (const u of userIds) cargaMap.set(u, 0);
    for (const r of cargas ?? []) {
      const k = (r as any).atribuida_user_id;
      cargaMap.set(k, (cargaMap.get(k) ?? 0) + 1);
    }
    const membroMap = new Map((membros ?? []).map((m: any) => [m.user_id, m]));
    let best: string | null = null;
    let bestCarga = Infinity;
    for (const u of userIds) {
      const carga = cargaMap.get(u) ?? 0;
      const max = (membroMap.get(u) as any)?.max_simultaneas ?? 5;
      if (carga >= max) continue;
      if (carga < bestCarga) {
        best = u;
        bestCarga = carga;
      }
    }
    if (!best) {
      await context.supabase
        .from("atend_conversas")
        .update({
          departamento_id: deptId,
          status: "waiting",
          aguardando_desde: agora,
        })
        .eq("id", data.conversaId)
        .eq("clinica_id", data.clinicaId);
      return { ok: false, motivo: "Capacidade lotada" };
    }
    await context.supabase
      .from("atend_conversas")
      .update({
        departamento_id: deptId,
        atribuida_user_id: best,
        status: "active",
      })
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId);
    return { ok: true, user_id: best };
  });

/* =========================================================
 *  ROUTING RULES
 * ======================================================= */
export const listarRoutingRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: rows, error } = await context.supabase
      .from("atend_routing_rules")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("ordem");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const salvarRoutingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().optional(),
        nome: z.string().trim().min(1).max(120),
        ordem: z.number().int().min(0).max(999).default(0),
        ativo: z.boolean().default(true),
        canal: z.string().max(20).optional().nullable(),
        palavras_chave: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
        horario_inicio: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional()
          .nullable(),
        horario_fim: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional()
          .nullable(),
        dias_semana: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5, 6, 7]),
        departamento_id: z.string().uuid().optional().nullable(),
        mensagem_auto: z.string().max(1000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    const { id, clinicaId, ...rest } = data;
    if (id) {
      const { error } = await context.supabase
        .from("atend_routing_rules")
        .update(rest)
        .eq("id", id)
        .eq("clinica_id", clinicaId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("atend_routing_rules")
        .insert({ clinica_id: clinicaId, ...rest });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const excluirRoutingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase
      .from("atend_routing_rules")
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 *  SUPERVISOR — visão geral em tempo real
 * ======================================================= */
export const supervisaoLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: convs } = await context.supabase
      .from("atend_conversas")
      .select(
        "id, status, contato_nome, contato_telefone, ultima_msg_em, ultima_msg_preview, aguardando_desde, atribuida_user_id, departamento_id, sla_first_response_seg, unread_count",
      )
      .eq("clinica_id", data.clinicaId)
      .in("status", ["active", "waiting", "bot_attending"])
      .order("ultima_msg_em", { ascending: false })
      .limit(300);

    const userIds = Array.from(
      new Set((convs ?? []).map((c: any) => c.atribuida_user_id).filter(Boolean)),
    );
    const deptIds = Array.from(
      new Set((convs ?? []).map((c: any) => c.departamento_id).filter(Boolean)),
    );
    const [{ data: profs }, { data: depts }, { data: pausas }] = await Promise.all([
      userIds.length
        ? context.supabase.from("profiles").select("id, nome").in("id", userIds)
        : Promise.resolve({ data: [] }),
      deptIds.length
        ? context.supabase.from("atend_departamentos").select("id, nome").in("id", deptIds)
        : Promise.resolve({ data: [] }),
      // Pausa em aberto = `finalizada_em` nulo. Ver comentário no relatório
      // abaixo: esta tabela não tem `inicio`/`fim`/`motivo`.
      context.supabase
        .from("atend_pausas_log")
        .select("user_id, reason_id, iniciada_em")
        .is("finalizada_em", null)
        .eq("clinica_id", data.clinicaId),
    ]);
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
    const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.nome]));
    const pausaMap = new Map((pausas ?? []).map((p: any) => [p.user_id, p]));

    return (convs ?? []).map((c: any) => ({
      ...c,
      agente_nome: c.atribuida_user_id ? (profMap.get(c.atribuida_user_id) ?? null) : null,
      agente_em_pausa: c.atribuida_user_id ? pausaMap.has(c.atribuida_user_id) : false,
      departamento_nome: c.departamento_id ? (deptMap.get(c.departamento_id) ?? null) : null,
    }));
  });

/* =========================================================
 *  RELATÓRIOS — métricas por período
 * ======================================================= */
export const relatorioAtendimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        de: z.string(),
        ate: z.string(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const [{ data: convs }, { data: avals }] = await Promise.all([
      context.supabase
        .from("atend_conversas")
        .select(
          "id, status, departamento_id, atribuida_user_id, created_at, closed_at, sla_first_response_seg",
        )
        .eq("clinica_id", data.clinicaId)
        .gte("created_at", data.de)
        .lte("created_at", data.ate),
      context.supabase
        .from("atend_avaliacoes")
        .select("nota, created_at")
        .eq("clinica_id", data.clinicaId)
        .gte("created_at", data.de)
        .lte("created_at", data.ate),
    ]);

    const userIds = Array.from(
      new Set((convs ?? []).map((c: any) => c.atribuida_user_id).filter(Boolean)),
    );
    const deptIds = Array.from(
      new Set((convs ?? []).map((c: any) => c.departamento_id).filter(Boolean)),
    );
    const [{ data: profs }, { data: depts }] = await Promise.all([
      userIds.length
        ? context.supabase.from("profiles").select("id, nome").in("id", userIds)
        : Promise.resolve({ data: [] }),
      deptIds.length
        ? context.supabase.from("atend_departamentos").select("id, nome").in("id", deptIds)
        : Promise.resolve({ data: [] }),
    ]);
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
    const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.nome]));

    const totais = {
      conversas: (convs ?? []).length,
      fechadas: (convs ?? []).filter((c: any) => c.status === "closed").length,
      ativas: (convs ?? []).filter((c: any) => c.status === "active").length,
      espera: (convs ?? []).filter((c: any) => c.status === "waiting").length,
      sla_medio_seg: (() => {
        const arr = (convs ?? [])
          .map((c: any) => c.sla_first_response_seg)
          .filter((v: any) => v != null);
        return arr.length
          ? Math.round(arr.reduce((s: number, v: number) => s + v, 0) / arr.length)
          : null;
      })(),
      csat: (() => {
        const arr = (avals ?? []).map((a: any) => a.nota);
        return arr.length
          ? Number((arr.reduce((s: number, v: number) => s + v, 0) / arr.length).toFixed(2))
          : null;
      })(),
    };

    type AgRow = {
      user_id: string;
      nome: string;
      conversas: number;
      fechadas: number;
      sla_seg: number[];
    };
    const porAgente = new Map<string, AgRow>();
    for (const c of convs ?? []) {
      const uid = (c as any).atribuida_user_id;
      if (!uid) continue;
      const row: AgRow = porAgente.get(uid) ?? {
        user_id: uid,
        nome: profMap.get(uid) ?? uid,
        conversas: 0,
        fechadas: 0,
        sla_seg: [],
      };
      row.conversas += 1;
      if ((c as any).status === "closed") row.fechadas += 1;
      if ((c as any).sla_first_response_seg != null)
        row.sla_seg.push(Number((c as any).sla_first_response_seg));
      porAgente.set(uid, row);
    }
    const agentes = Array.from(porAgente.values())
      .map((r) => ({
        user_id: r.user_id,
        nome: r.nome,
        conversas: r.conversas,
        fechadas: r.fechadas,
        sla_medio: r.sla_seg.length
          ? Math.round(r.sla_seg.reduce((s, v) => s + v, 0) / r.sla_seg.length)
          : null,
      }))
      .sort((a, b) => b.conversas - a.conversas);

    const porDept = new Map<
      string,
      { id: string; nome: string; conversas: number; fechadas: number }
    >();
    for (const c of convs ?? []) {
      const did = (c as any).departamento_id;
      if (!did) continue;
      const row = porDept.get(did) ?? {
        id: did,
        nome: deptMap.get(did) ?? "—",
        conversas: 0,
        fechadas: 0,
      };
      row.conversas += 1;
      if ((c as any).status === "closed") row.fechadas += 1;
      porDept.set(did, row);
    }
    const departamentos = Array.from(porDept.values()).sort((a, b) => b.conversas - a.conversas);

    return { totais, agentes, departamentos };
  });

/* =========================================================
 *  ATENDIMENTO HÍBRIDO — fila, claim, devolução e presença
 * ======================================================= */

/** Fila de conversas aguardando um atendente humano (handoff da Nina). */
export const listarFilaHumana = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        departamentoId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    let q = context.supabase
      .from("atend_conversas")
      .select(
        "id, contato_nome, contato_telefone, canal, status, departamento_id, prioridade, aguardando_desde, handoff_motivo, handoff_resumo, ultima_msg_preview, ultima_msg_em, unread_count",
      )
      .eq("clinica_id", data.clinicaId)
      // Fila global "Não atribuídas": tudo que aguarda uma pessoa e ainda não
      // tem responsável, independente de já ter sido aberta antes.
      .in("status", ["waiting", "active", "in_progress"])
      .is("atribuida_user_id", null)
      .eq("is_teste", false)
      .order("prioridade", { ascending: false })
      .order("aguardando_desde", { ascending: true })
      .limit(data.limit);
    if (data.departamentoId) q = q.eq("departamento_id", data.departamentoId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r, i) => ({ ...r, posicao: i + 1 }));
  });

/**
 * Assumir conversa (fila ou tomada de atendimento).
 *
 * Fonte única de responsável: `atend_conversas.atribuida_user_id`.
 * - Conversa livre: usa a RPC atômica `atend_claim_conversa` — em disputa,
 *   apenas um atendente recebe `ok: true`.
 * - Conversa já atribuída: só troca com `forcar = true`, e mesmo assim por
 *   UPDATE condicional no responsável atual (protege contra corrida e contra
 *   sobrescrever uma transferência feita no mesmo instante).
 * Conversa encerrada nunca é assumida.
 */
export const assumirConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        forcar: z.boolean().default(false),
        motivo: z.string().trim().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    await assertConversaDaClinica(context.supabase, data.conversaId, data.clinicaId);
    const { data: conv, error: eConv } = await context.supabase
      .from("atend_conversas")
      .select("id, atribuida_user_id, status, departamento_id")
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (eConv) throw new Error(eConv.message);
    if (!conv) return { ok: false as const, motivo: "NAO_ENCONTRADA" as const };
    if (conv.status === "closed") return { ok: false as const, motivo: "ENCERRADA" as const };
    // Idempotente: repetir o clique (ou outra aba) não muda nada.
    if (conv.atribuida_user_id === context.userId)
      return { ok: true as const, motivo: null, atribuidaUserId: context.userId, jaEra: true };

    // A conversa passou para uma pessoa: nenhum prazo de espera da Nina
    // continua valendo a partir daqui.
    const { limparEsperaPaciente: limparEsperaAoAssumir } = await import(
      "@/lib/nina/espera-paciente.server"
    );

    if (conv.atribuida_user_id && !data.forcar)
      return {
        ok: false as const,
        motivo: "JA_ASSUMIDA" as const,
        atribuidaUserId: conv.atribuida_user_id,
      };

    if (!conv.atribuida_user_id) {
      const { data: ok, error } = await context.supabase.rpc("atend_claim_conversa", {
        _conversa_id: data.conversaId,
        _clinica_id: data.clinicaId,
        _user_id: context.userId,
      });
      if (error) throw new Error(error.message);
      if (!ok) {
        const { data: atual } = await context.supabase
          .from("atend_conversas")
          .select("atribuida_user_id")
          .eq("id", data.conversaId)
          .eq("clinica_id", data.clinicaId)
          .maybeSingle();
        return {
          ok: false as const,
          motivo: "JA_ASSUMIDA" as const,
          atribuidaUserId: atual?.atribuida_user_id ?? null,
        };
      }
      await context.supabase
        .from("atend_conversas")
        .update({ atribuicao_origem: "manual_assignment" })
        .eq("id", data.conversaId)
        .eq("clinica_id", data.clinicaId);
    } else {
      // Tomada consciente: troca condicionada ao responsável que o atendente viu.
      const { data: rows, error } = await context.supabase
        .from("atend_conversas")
        .update({
          atribuida_user_id: context.userId,
          status: "active",
          owner_type: "HUMAN",
          ai_enabled: false,
          assigned_at: new Date().toISOString(),
          atribuicao_origem: "takeover",
        })
        .eq("id", data.conversaId)
        .eq("clinica_id", data.clinicaId)
        .eq("atribuida_user_id", conv.atribuida_user_id)
        .neq("status", "closed")
        .select("id");
      if (error) throw new Error(error.message);
      if (!rows || rows.length === 0) {
        const { data: atual } = await context.supabase
          .from("atend_conversas")
          .select("atribuida_user_id")
          .eq("id", data.conversaId)
          .eq("clinica_id", data.clinicaId)
          .maybeSingle();
        return {
          ok: false as const,
          motivo: "CORRIDA" as const,
          atribuidaUserId: atual?.atribuida_user_id ?? null,
        };
      }
      // Tomada entra no histórico como transferência, com motivo opcional.
      await context.supabase.from("atend_transferencias").insert({
        clinica_id: data.clinicaId,
        conversa_id: data.conversaId,
        de_user_id: conv.atribuida_user_id,
        para_user_id: context.userId,
        de_departamento_id: conv.departamento_id,
        para_departamento_id: conv.departamento_id,
        motivo: data.motivo ?? "Tomada de atendimento",
      });
    }

    await limparEsperaAoAssumir(data.clinicaId, data.conversaId);

    const { registrarEvento } = await import("@/lib/atendimento/handoff.server");
    await registrarEvento({
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      evento: "ASSUMIDA",
      userId: context.userId,
    });
    return {
      ok: true as const,
      motivo: null,
      atribuidaUserId: context.userId,
      jaEra: false,
    };
  });



/** Devolve a conversa para a Nina (reativa a IA). */
export const devolverParaNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        motivo: z.string().trim().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    await assertConversaDaClinica(context.supabase, data.conversaId, data.clinicaId);
    const { devolverParaIA } = await import("@/lib/atendimento/handoff.server");
    await devolverParaIA({
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      userId: context.userId,
      motivo: data.motivo ?? null,
    });
    return { ok: true };
  });

/** Encaminha manualmente uma conversa da Nina para a fila humana. */
export const encaminharParaFilaHumana = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        motivo: z.string().trim().min(1).max(500),
        departamentoNome: z.string().trim().max(120).nullable().optional(),
        urgencia: z.enum(["baixa", "normal", "alta"]).default("normal"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    await assertConversaDaClinica(context.supabase, data.conversaId, data.clinicaId);
    const { encaminharParaHumano } = await import("@/lib/atendimento/handoff.server");
    return encaminharParaHumano({
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      motivo: data.motivo,
      urgencia: data.urgencia,
      departamentoNome: data.departamentoNome ?? null,
      solicitadoPor: "SISTEMA",
    });
  });

/** Linha do tempo do fluxo (handoff, fila, assumida, transferida, finalizada). */
export const listarEventosConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    {
      const { assertAcessoConversa } = await import("./atendimento/acesso-conversa.server");
      await assertAcessoConversa(context.supabase, context.userId, data.clinicaId, data.conversaId);
    }
    await assertConversaDaClinica(context.supabase, data.conversaId, data.clinicaId);
    const { data: rows, error } = await context.supabase
      .from("atend_conversa_eventos")
      .select("id, evento, user_id, motivo, detalhes, created_at")
      .eq("clinica_id", data.clinicaId)
      .eq("conversa_id", data.conversaId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    const lista = rows ?? [];
    // Nome de quem agiu: o banner da timeline diz "resolvida por Fulano", não
    // um UUID. Uma consulta só para todos os responsáveis dos eventos.
    const ids = Array.from(
      new Set(
        lista.flatMap((r) => {
          const det = (r.detalhes ?? null) as { para_user_id?: string | null } | null;
          return [r.user_id, det?.para_user_id ?? null];
        }).filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    );
    const nomes = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids);
      (profs ?? []).forEach((p: { id: string; nome: string | null }) => {
        if (p.nome) nomes.set(p.id, p.nome);
      });
    }
    return lista.map((r) => {
      const det = (r.detalhes ?? null) as { para_user_id?: string | null } | null;
      const paraId = det?.para_user_id ?? null;
      return {
        ...r,
        user_nome: r.user_id ? (nomes.get(r.user_id) ?? null) : null,
        para_nome: paraId ? (nomes.get(paraId) ?? null) : null,
      };
    });
  });

/** Presença do atendente (Disponível / Ocupado / Ausente / Offline). */
export const definirPresenca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        status: z.enum(["ONLINE", "BUSY", "AWAY", "OFFLINE"]),
        aceitaNovas: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase.from("atend_agente_presenca").upsert(
      {
        clinica_id: data.clinicaId,
        user_id: context.userId,
        status: data.status,
        aceita_novas: data.aceitaNovas ?? data.status === "ONLINE",
        visto_em: new Date().toISOString(),
      },
      { onConflict: "clinica_id,user_id" },
    );
    if (error) throw new Error(error.message);

    // Ao ficar online, o que estava parado na fila "Não atribuídas" é
    // distribuído na hora (da conversa que espera há mais tempo para a mais
    // recente), sempre para quem tem menos conversas ativas.
    let distribuidas = 0;
    if (data.status === "ONLINE" && (data.aceitaNovas ?? true)) {
      const { data: n, error: e2 } = await context.supabase.rpc("atend_distribuir_fila", {
        _clinica_id: data.clinicaId,
        _max: 20,
      } as never);
      if (e2) console.error("[atendimento] falha ao distribuir fila:", e2.message);
      else distribuidas = Number(n ?? 0);
    }
    return { ok: true, distribuidas };
  });

/**
 * Distribui manualmente o que está parado na fila "Não atribuídas".
 * Usado pelo botão "Distribuir agora" e após o heartbeat de presença.
 */
export const distribuirFilaPendentes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: n, error } = await context.supabase.rpc("atend_distribuir_fila", {
      _clinica_id: data.clinicaId,
      _max: 50,
    } as never);
    if (error) throw new Error(error.message);
    return { distribuidas: Number(n ?? 0) };
  });


export const listarPresenca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: rows, error } = await context.supabase
      .from("atend_agente_presenca")
      .select("user_id, status, aceita_novas, visto_em")
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Desde quando cada conversa aberta está aguardando resposta.
 *
 * Devolve o instante da primeira mensagem do paciente ainda não respondida
 * (nem pela Nina, nem por atendente). Conversas sem pendência não aparecem.
 * Leitura pura — não altera nada do fluxo de atendimento.
 */
export const esperaConversas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), isTeste: z.boolean().default(false) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { data: rows, error } = await context.supabase.rpc("atend_espera_por_conversa", {
      _clinica_id: data.clinicaId,
      _is_teste: data.isTeste,
    } as never);
    if (error) throw new Error(error.message);
    const mapa: Record<string, string> = {};
    for (const r of (rows ?? []) as Array<{ conversa_id: string; aguardando_desde: string }>) {
      if (r?.conversa_id && r?.aguardando_desde) mapa[r.conversa_id] = r.aguardando_desde;
    }
    return mapa;
  });
