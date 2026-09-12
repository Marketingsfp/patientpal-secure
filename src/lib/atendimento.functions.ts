import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { hojeBR, janelaDiaClinica } from "@/lib/date-utils";
import { z } from "zod";
import {
  STATUS_FECHADOS,
  atendenteFiltroEfetivo,
  escopoEscondeFechadas,
  normalizarEscopo,
  filtroEscopoInbox,
  escopoComAtendente,
} from "@/lib/atendimento/escopo-inbox";
import {
  filtroResponsavel,
  idsPorEsperaCrescente,
  ordenarPorEspera,
  planoVisualizacao,
} from "@/lib/atendimento/filtros-inbox";
import { loadWhatsAppConfig, metaSendText } from "./whatsapp.server";
import {
  MSG_ADMIN_NAO_ATENDE,
  apenasDestinatariosValidos,
  statusPresenca,

} from "@/lib/atendimento/perfil-atendimento";
import {
  ESTADOS_MANUAIS,
  ehEstadoManual,
  precisaEscolherPresenca,
  tecnicoDoEstadoManual,
  versaoAceita,
  type EstadoManualPresenca,
} from "@/lib/atendimento/presenca-manual";

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
/**
 * Administrador não atende paciente: esta checagem é a barreira do
 * aplicativo (o banco tem a sua própria, para chamadas diretas).
 */
async function ehAdminClinica(
  supabase: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("atend_usuario_e_admin", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  return !!data;
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
        // FASE 1 — filtro de supervisão por atendente. Apenas visualização:
        // não transfere, não atribui, não muda status nem leitura.
        atendenteId: z.string().uuid().nullish(),
        // FASE 2 — segundo eixo do filtro (estado + ordenação). Aplicado no
        // banco, antes do LIMIT, para nunca esconder resultado válido.
        visualizacao: z.enum(["recentes", "resolvidas", "espera"]).default("recentes"),
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

    // FASE 4 — listar é só listar. O vencimento da espera do paciente (regra
    // dos 30 minutos) continua valendo, mas roda em segundo plano
    // (`/api/public/nina/espera-timeout`, agendado no banco) e no recebimento
    // de mensagem — nunca dentro deste request da tela.
    marcar("timeouts");

    // Gestor/admin da clínica pode escolher ver tudo; atendente comum, não.
    const gestor = !!podeGerirRes;
    // FASE 2 — supervisão por atendente: só vale para quem já pode ver
    // conversas de terceiros; sem essa permissão o parâmetro é ignorado e o
    // atendente continua vendo exatamente o que já via.
    const atendenteFiltro = atendenteFiltroEfetivo(data.atendenteId, gestor);
    const escopoAplicado = escopoComAtendente(data.escopo, data.atendenteId, gestor);
    const filtroEscopo = filtroEscopoInbox({
      escopo: escopoAplicado,
      userId: context.userId,
      gestor,
    });

    // FASE 2 — matriz Escopo × Visualização montada de forma composicional:
    // base → escopo → estado da visualização → busca → ordenação → limite.
    // Nunca há uma implementação diferente por combinação, e todo o corte
    // acontece no banco, antes do LIMIT.
    const plano = planoVisualizacao(data.visualizacao);

    // "Maior tempo esperando" usa a métrica canônica de paciente aguardando
    // (`atend_espera_por_conversa`): conversa em que a clínica é que aguarda
    // o paciente fica de fora. O conjunto vem antes do corte da lista.
    let idsEspera: string[] | null = null;
    const mapaEspera: Record<string, string> = {};
    if (plano.exigeEsperaPaciente) {
      const { data: esperas } = await context.supabase.rpc("atend_espera_por_conversa", {
        _clinica_id: data.clinicaId,
        _is_teste: false,
      });
      for (const e of (esperas ?? []) as any[]) {
        if (e?.conversa_id && e?.aguardando_desde) mapaEspera[e.conversa_id] = e.aguardando_desde;
      }
      // Recorte pela métrica canônica ANTES do LIMIT: se houver mais conversas
      // aguardando do que o teto da lista, ficam as de maior espera.
      idsEspera = idsPorEsperaCrescente(mapaEspera).slice(0, data.limit);
      if (idsEspera.length === 0) {
        marcar("consulta");
        return [];
      }
    }

    let q = context.supabase
      .from("atend_conversas")
      // O nome do paciente vinculado vem embutido na MESMA consulta (sem
      // consulta por item da lista). Sem vínculo, vem null.
      .select("*, pacientes:contato_paciente_id(nome)")
      // Conversas do console de homologação nunca aparecem no atendimento real.
      .eq("is_teste", false)
      .eq("clinica_id", data.clinicaId);

    // --- Escopo (de quem é a conversa) -------------------------------------
    // Filtro por responsável direto no banco, antes de ordenar e cortar a
    // lista — nunca depois de baixar tudo para o navegador.
    // FASE 3 — em conversa resolvida o responsável ativo já foi limpo, então a
    // responsabilidade canônica é `last_assigned_user_id` (gravado antes da
    // limpeza) ou, na falta dele, `resolved_by`.
    const porResponsavel = (query: any, userId: string, resolvidas: boolean) => {
      const f = filtroResponsavel(userId, { somenteResolvidas: resolvidas });
      return f.tipo === "ou" ? query.or(f.expr) : query.eq(f.coluna, f.userId);
    };

    if (atendenteFiltro) q = porResponsavel(q, atendenteFiltro, plano.somenteResolvidas);
    if (filtroEscopo.tipo === "atribuida")
      q = porResponsavel(q, filtroEscopo.userId, plano.somenteResolvidas);
    else if (filtroEscopo.tipo === "sem_responsavel")
      q = q.is("atribuida_user_id", null).neq("owner_type", "AI");
    else if (filtroEscopo.tipo === "nina") q = q.eq("owner_type", "AI");
    else if (filtroEscopo.tipo === "fechadas") {
      q = q.in("status", [...STATUS_FECHADOS]);
      if (filtroEscopo.userId) q = porResponsavel(q, filtroEscopo.userId, true);
    }

    // --- Visualização (estado da conversa) ---------------------------------
    if (plano.somenteResolvidas) {
      q = q.in("status", [...STATUS_FECHADOS]);
    } else if (escopoEscondeFechadas(escopoAplicado, gestor)) {
      // Filtros operacionais mostram só conversas em andamento.
      q = q.not("status", "in", `(${STATUS_FECHADOS.join(",")})`);
    }
    if (idsEspera) q = q.in("id", idsEspera);

    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.canal !== "todos") q = q.eq("canal", data.canal);
    if (data.busca) {
      // Sanitiza para evitar injeção de filtros PostgREST via .or()
      // — remove operadores e separadores reservados.
      const safe = data.busca.replace(/[%_,.()'"\\:*]/g, "");
      if (safe.length > 0) {
        // Busca por nome também alcança o cadastro do paciente vinculado.
        // Uma única consulta em lote, com teto — nunca por item da lista.
        let filtro = `contato_nome.ilike.%${safe}%,whatsapp_profile_name.ilike.%${safe}%,contato_telefone.ilike.%${safe}%,protocol_number.ilike.%${safe}%`;
        const { data: pacs } = await context.supabase
          .from("pacientes")
          .select("id")
          .eq("clinica_id", data.clinicaId)
          .ilike("nome", `%${safe}%`)
          .limit(50);
        const ids = (pacs ?? []).map((p) => p.id);
        if (ids.length) filtro += `,contato_paciente_id.in.(${ids.join(",")})`;
        q = q.or(filtro);
      }
    }
    // --- Ordenação e limite (sempre por último) ----------------------------
    q = q.order(plano.ordenarPor, { ascending: plano.ascendente, nullsFirst: false });
    // Desempate estável: conversa sem a coluna da visualização não embaralha.
    if (plano.ordenarPor !== "ultima_msg_em") {
      q = q.order("ultima_msg_em", { ascending: false });
    }
    q = q.limit(data.limit);

    const { data: rows, error } = await q;
    marcar("consulta");
    if (error) throw new Error(error.message);

    // Não lidas DESTE usuário: mensagens recebidas do paciente depois do
    // marcador de leitura dele. O contador antigo da conversa continua na
    // linha, apenas como referência histórica.
    let naoLidas = new Map<string, number>();
    const ids = (rows ?? []).map((r: any) => r.id);
    if (ids.length) {
      try {
        const { data: cont } = await context.supabase.rpc("atend_nao_lidas", {
          _clinica_id: data.clinicaId,
          _conversa_ids: ids,
        });
        naoLidas = new Map((cont ?? []).map((c: any) => [c.conversa_id, Number(c.nao_lidas) || 0]));
      } catch (e) {
        console.error("[atendimento] contagem de nao lidas falhou", e);
      }
      marcar("nao_lidas");
    }

    const total = Date.now() - t0;
    // Só registra quando realmente demorou, para não poluir o log.
    if (total > 400) {
      console.warn("[atendimento] listarConversas lenta", {
        totalMs: total,
        linhas: rows?.length ?? 0,
        etapas: marcos,
      });
    }
    const saida = (rows ?? []).map((r: any) => ({
      ...r,
      nao_lidas: naoLidas.get(r.id) ?? 0,
      // Métrica canônica de espera (mesma da Central "Prioridades Agora"),
      // devolvida pronta para a tela não recalcular duração item a item.
      ...(plano.exigeEsperaPaciente ? { aguardando_desde: mapaEspera[r.id] ?? r.aguardando_desde } : {}),
    }));
    // Quem começou a esperar antes vem primeiro, pela métrica canônica.
    return plano.exigeEsperaPaciente ? ordenarPorEspera(saida, mapaEspera) : saida;
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
      .select("*, pacientes:contato_paciente_id(nome)")
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
      .select("*, pacientes:contato_paciente_id(nome)")
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
    // `admin` = supervisão total, sem atender: a Inbox usa isto para abrir na
    // visão da equipe e esconder as ações de atendimento.
    const admin = await ehAdminClinica(context.supabase, context.userId, data.clinicaId);
    return { gestor: !!podeGerir, admin };
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
    // Responsável antes da ação: define se o registro é "atribuiu" ou
    // "transferiu de X para Y" e evita evento quando nada muda.
    const { data: antes } = await context.supabase
      .from("atend_conversas")
      .select("atribuida_user_id")
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    const anterior = (antes as { atribuida_user_id: string | null } | null)?.atribuida_user_id ?? null;
    const semMudanca = anterior === (data.userId ?? null) && data.departamentoId === undefined;
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
    // Escolher de novo a mesma responsável não é acontecimento: sem registro.
    if (semMudanca) return { ok: true, semAlteracao: true };
    await registrarEventoConversa(context.supabase, {
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      evento: data.userId ? "ASSUMIDA" : "DESATRIBUIDA",
      // Autor = quem executou a ação (vem da sessão autenticada), nunca o
      // destinatário informado pela tela.
      userId: context.userId,
      departamentoId: data.departamentoId ?? null,
      detalhes: {
        manual: true,
        para_user_id: data.userId ?? null,
        de_user_id: anterior,
      },
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
    if (data.paraUserId && (await ehAdminClinica(context.supabase, data.paraUserId, data.clinicaId)))
      throw new Error(MSG_ADMIN_NAO_ATENDE);
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
    // Repetir a responsável atual, sem setor novo, não é transferência.
    if (
      data.paraUserId &&
      data.paraUserId === conv.atribuida_user_id &&
      (!data.paraDepartamentoId || data.paraDepartamentoId === conv.departamento_id)
    )
      return { ok: true, semAlteracao: true };
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

    // Encaminhamento para setor: usa a distribuição já existente (mesma regra
    // de presença, capacidade e carga). Se ninguém estiver disponível, a
    // conversa fica em "Não atribuídas" e o texto do registro diz isso.
    let sorteada: string | null = null;
    let setorNome: string | null = null;
    if (!data.paraUserId && data.paraDepartamentoId) {
      const { data: dep } = await context.supabase
        .from("atend_departamentos")
        .select("nome")
        .eq("id", data.paraDepartamentoId)
        .eq("clinica_id", data.clinicaId)
        .maybeSingle();
      setorNome = (dep as { nome?: string | null } | null)?.nome ?? null;
      const { atribuirAtendenteOnline } = await import("@/lib/atendimento/handoff.server");
      const escolhido = await atribuirAtendenteOnline({
        clinicaId: data.clinicaId,
        conversaId: data.conversaId,
        departamentoId: data.paraDepartamentoId,
        origem: "queue_distribution",
        semMarcador: true,
      });
      sorteada = escolhido?.userId ?? null;
    }

    await registrarEventoConversa(context.supabase, {
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      evento: "TRANSFERIDA",
      // Autor sempre da sessão autenticada (pode ser administrador).
      userId: context.userId,
      departamentoId: data.paraDepartamentoId ?? conv.departamento_id,
      motivo: data.motivo ?? null,
      detalhes: {
        manual: true,
        de_user_id: conv.atribuida_user_id,
        para_user_id: data.paraUserId ?? sorteada,
        setor_nome: setorNome,
        setor: Boolean(setorNome),
        sorteio: Boolean(sorteada),
      },
    });
    // Se a conversa veio da Nina e agora tem responsável humano, o protocolo é
    // gerado (ou reaproveitado, quando já existir neste atendimento).
    const destinatario = data.paraUserId ?? sorteada ?? null;
    if (destinatario) {
      try {
        const { protocoloAoAtribuirHumano } = await import(
          "@/lib/atendimento/protocolo-atendimento.server"
        );
        await protocoloAoAtribuirHumano({
          clinicaId: data.clinicaId,
          conversaId: data.conversaId,
          userId: destinatario,
        });
      } catch (e) {
        console.error("[atendimento] protocolo ao transferir", e);
      }
    }
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

/** Contagem individual real (marcador de leitura deste usuário) de uma conversa. */
async function contarNaoLidasConversa(
  supabase: any,
  clinicaId: string,
  conversaId: string,
): Promise<number> {
  const { data } = await supabase.rpc("atend_nao_lidas", {
    _clinica_id: clinicaId,
    _conversa_ids: [conversaId],
  });
  const linha = (data ?? [])[0];
  return Number(linha?.nao_lidas ?? 0) || 0;
}

/**

 * Registra a leitura DESTE usuário até uma mensagem real da timeline.
 *
 * A leitura é individual (`atend_leituras`): o que Maria leu não interfere no
 * que Jean leu. O usuário vem da autenticação — a tela não pode informar outra
 * pessoa. Fase 1 preservada: quem tem perfil administrativo/gestor apenas
 * acompanha e não registra leitura automática ao abrir.
 *
 * O contador antigo da conversa (`unread_count`) NÃO é zerado: fica como
 * referência histórica.
 */
export const marcarLida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        // Última mensagem realmente vista. Sem ela, usa a última existente no
        // momento da chamada (nunca "agora", para não engolir o que chegar).
        mensagemId: z.string().uuid().optional().nullable(),
        // Leitura por abertura da conversa (padrão) x ação explícita.
        automatico: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const { assertAcessoConversa, usuarioEhGestor } = await import(
      "./atendimento/acesso-conversa.server"
    );
    const { avaliarLeituraAutomatica } = await import("./atendimento/leitura-inbox");
    const conv = await assertAcessoConversa(
      context.supabase,
      context.userId,
      data.clinicaId,
      data.conversaId,
    );
    const ehGestor = await usuarioEhGestor(context.supabase, context.userId, data.clinicaId);
    const admin = await ehAdminClinica(context.supabase, context.userId, data.clinicaId);
    const { pode, motivo } = avaliarLeituraAutomatica({
      userId: context.userId,
      atribuidaUserId: conv.atribuida_user_id ?? null,
      ehGestor: ehGestor || admin,
    });
    if (data.automatico && !pode) {
      const naoLidas = await contarNaoLidasConversa(context.supabase, data.clinicaId, data.conversaId);
      return { ok: true, marcada: false, motivo, lidaAte: null, naoLidas };
    }

    // O avanço monotônico e o vínculo mensagem/conversa são garantidos no banco.
    const { data: lidaAte, error } = await context.supabase.rpc("atend_registrar_leitura", {
      _clinica_id: data.clinicaId,
      _conversa_id: data.conversaId,
      _mensagem_id: data.mensagemId ?? undefined,
    });
    if (error) throw new Error(error.message);
    // Reconciliação: devolve o número verdadeiro DEPOIS da gravação. Se uma
    // mensagem nova chegou durante a operação, ela continua contando como não
    // lida — a tela não fica com um zero falso.
    const naoLidas = await contarNaoLidasConversa(context.supabase, data.clinicaId, data.conversaId);
    return { ok: true, marcada: true, motivo, lidaAte: (lidaAte as string | null) ?? null, naoLidas };


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
    // FASE 2 — travar/destravar a fila do departamento NÃO mexe mais na
    // presença: "filaAberta = false" deixou de ser prova de que o atendente
    // escolheu Offline. A presença só muda em `definirPresencaManual`.
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
        .select(
          "status, aceita_novas, visto_em, estado_manual, estado_manual_em, estado_manual_por, estado_manual_versao",
        )
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

    // FASE 2 — status efetivo: é EXATAMENTE o que a distribuição enxerga
    // (presença recente + aceita novas + sem pausa aberta). A tela passa a
    // mostrar isto, e não o que ela mesma acha que enviou, para não existir
    // "frontend Online / backend Offline".
    const { data: pausaAberta } = await context.supabase
      .from("atend_pausas_log")
      .select("id")
      .eq("clinica_id", data.clinicaId)
      .eq("user_id", context.userId)
      .is("finalizada_em", null)
      .maybeSingle();
    const presencaEfetiva = statusPresenca({
      status: presencaStatus,
      vistoEm: (pres as { visto_em?: string } | null)?.visto_em ?? null,
      emPausa: !!pausaAberta,
    });
    // FASE 1 — escolha manual: fonte oficial, separada do sinal de conexão.
    const manual = pres as {
      estado_manual?: string | null;
      estado_manual_em?: string | null;
      estado_manual_por?: string | null;
      estado_manual_versao?: number | null;
    } | null;
    const estadoManual = ehEstadoManual(manual?.estado_manual)
      ? (manual!.estado_manual as EstadoManualPresenca)
      : null;
    return {
      isMember: total > 0,
      filaAberta: presencaEfetiva === "ONLINE" && filaAberta,
      totalDeptos: total,
      presencaStatus,
      presencaEfetiva,
      vistoEm: (pres as { visto_em?: string } | null)?.visto_em ?? null,
      estadoManual,
      estadoManualEm: manual?.estado_manual_em ?? null,
      estadoManualPor: manual?.estado_manual_por ?? null,
      estadoManualVersao: manual?.estado_manual_versao ?? 0,
      precisaEscolherPresenca: precisaEscolherPresenca(manual?.estado_manual ?? null),
    };
  });

/**
 * FASE 2 — encerra a presença do usuário em todas as clínicas.
 *
 * Usado no logout e ao fechar a ÚLTIMA aba: quem sai da sessão não pode
 * continuar no pool de distribuição. Não mexe nas conversas já atribuídas —
 * ficar offline só impede novas atribuições.
 */
export const encerrarMinhaPresenca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("atend_agente_presenca")
      .update({
        status: "OFFLINE",
        aceita_novas: false,
        visto_em: new Date().toISOString(),
      })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
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
    // FASE 2 — entrar em pausa tira do pool NA HORA: a presença gravada passa a
    // dizer a mesma coisa que a tela ("Em pausa"), sem esperar heartbeat.
    await context.supabase.from("atend_agente_presenca").upsert(
      {
        clinica_id: data.clinicaId,
        user_id: context.userId,
        status: "BUSY",
        aceita_novas: false,
        visto_em: new Date().toISOString(),
      },
      { onConflict: "clinica_id,user_id" },
    );
    return { id: ins!.id };
  });

/**
 * FASE 3 — quem entra na distribuição automática dos handoffs da Nina é quem
 * tem o PERFIL Telefonia (Cadastros › Perfis), e não uma permissão avulsa.
 * A fonte é a mesma do banco (`atend_tem_perfil_telefonia`, que lê
 * `clinica_memberships.role`), então tela e distribuição nunca divergem.
 */
async function temTelefonia(
  supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown; error: unknown }> },
  userId: string,
  clinicaId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("atend_tem_perfil_telefonia", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) return false; // fail-closed
  return data === true;
}

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

    // Sair da pausa devolve a presença para ONLINE na mesma operação, senão a
    // tela mostraria "Online" e o pool continuaria vendo "BUSY" até o próximo
    // heartbeat (até 60s de divergência).
    await context.supabase.from("atend_agente_presenca").upsert(
      {
        clinica_id: data.clinicaId,
        user_id: context.userId,
        status: "ONLINE",
        aceita_novas: true,
        visto_em: new Date().toISOString(),
      },
      { onConflict: "clinica_id,user_id" },
    );

    // Voltar da pausa é voltar a estar disponível: reavalia a fila "Não
    // atribuídas" na hora, com o MESMO algoritmo de distribuição usado ao
    // ficar Online (mais antiga primeiro, para quem tem menos conversas).
    // Sem isso, a fila só seria reavaliada no próximo heartbeat (até 60s).
    let distribuidas = 0;
    if (await temTelefonia(context.supabase as never, context.userId, data.clinicaId)) {
      const { data: n, error: e2 } = await context.supabase.rpc("atend_distribuir_fila", {
        _clinica_id: data.clinicaId,
        _max: 20,
      } as never);
      if (e2) console.error("[atendimento] falha ao distribuir fila após pausa:", e2.message);
      else distribuidas = Number(n ?? 0);
    }
    return { ok: true, distribuidas };
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
    const [{ data: profs }, { data: pres }, { data: pausas }] = await Promise.all([
      userIds.length
        ? context.supabase.from("profiles").select("id, nome").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      context.supabase
        .from("atend_agente_presenca")
        .select("user_id, status, visto_em")
        .eq("clinica_id", data.clinicaId),
      context.supabase
        .from("atend_pausas_log")
        .select("user_id")
        .eq("clinica_id", data.clinicaId)
        .is("finalizada_em", null),
    ]);
    const nomeMap = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
    const presMap = new Map((pres ?? []).map((p: any) => [p.user_id, p]));
    const emPausa = new Set((pausas ?? []).map((p: any) => p.user_id));
    // Administrador não aparece como destinatário de atendimento.
    return apenasDestinatariosValidos(
      (rows ?? []).map((r: any) => ({
        user_id: r.user_id,
        role: r.role as string | null,
        nome: nomeMap.get(r.user_id) ?? r.user_id,
        // Presença vem da fonte já existente (atend_agente_presenca + pausas).
        presenca: statusPresenca({
          status: presMap.get(r.user_id)?.status ?? null,
          vistoEm: presMap.get(r.user_id)?.visto_em ?? null,
          emPausa: emPausa.has(r.user_id),
        }),
      })),
    );
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
        "id, direction, from_number, to_number, body, tipo, enviada_por, recebida_em, media_url, media_mime, status, execucao_id, client_message_id",
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

/**
 * Janela de contexto em volta de UMA mensagem específica (id interno).
 *
 * Usada por "Ver conversa" na Revisão de aprendizados: em vez de percorrer o
 * histórico página por página até achar a mensagem reportada, busca a própria
 * mensagem pelo id e um bloco limitado de mensagens antes e depois.
 * Somente leitura: não assume, transfere, resolve nem reabre o atendimento.
 */
export const carregarJanelaMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        mensagemId: z.string().uuid(),
        antes: z.number().int().min(1).max(200).default(30),
        depois: z.number().int().min(0).max(200).default(30),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    {
      const { assertAcessoConversa } = await import("./atendimento/acesso-conversa.server");
      await assertAcessoConversa(context.supabase, context.userId, data.clinicaId, data.conversaId);
    }
    const COLUNAS =
      "id, direction, from_number, to_number, body, tipo, enviada_por, recebida_em, media_url, media_mime, status, client_message_id";
    const { data: alvo, error: eAlvo } = await context.supabase
      .from("whatsapp_mensagens")
      .select(COLUNAS)
      .eq("clinica_id", data.clinicaId)
      .eq("conversa_id", data.conversaId)
      .eq("id", data.mensagemId)
      .maybeSingle();
    if (eAlvo) throw new Error(eAlvo.message);
    // Mensagem removida ou fora desta conversa: quem chamou avisa a pessoa em
    // vez de destacar outra mensagem parecida.
    if (!alvo) return { encontrada: false as const, mensagens: [] as any[] };

    const [ant, dep] = await Promise.all([
      context.supabase
        .from("whatsapp_mensagens")
        .select(COLUNAS)
        .eq("clinica_id", data.clinicaId)
        .eq("conversa_id", data.conversaId)
        .lt("recebida_em", alvo.recebida_em)
        .order("recebida_em", { ascending: false })
        .limit(data.antes),
      context.supabase
        .from("whatsapp_mensagens")
        .select(COLUNAS)
        .eq("clinica_id", data.clinicaId)
        .eq("conversa_id", data.conversaId)
        .gt("recebida_em", alvo.recebida_em)
        .order("recebida_em", { ascending: true })
        .limit(data.depois),
    ]);
    if (ant.error) throw new Error(ant.error.message);
    if (dep.error) throw new Error(dep.error.message);
    return {
      encontrada: true as const,
      mensagens: [...(ant.data ?? []).slice().reverse(), alvo, ...(dep.data ?? [])],
    };
  });




export const enviarMensagemConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        text: z.string().trim().min(1).max(3500),
        // Identificador do envio gerado pelo navegador (Fase 2). É o mesmo da
        // bolha otimista e da linha gravada: garante que duplo clique ou
        // retry não criem uma segunda mensagem no WhatsApp.
        clientMessageId: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    // FASE 1 (telemetria) — só medição: nenhuma validação, ordem ou regra
    // deste envio foi alterada por causa do trace.
    const { iniciarTraceServidor } = await import("./atendimento/latencia.server");
    const trace = iniciarTraceServidor({ fluxo: "send", conversationId: data.conversaId });
    trace.marcar("SEND_T3_BACKEND_RECEIVED");
    await assertMember(context.supabase, context.userId, data.clinicaId);
    {
      const { assertAcessoConversa } = await import("./atendimento/acesso-conversa.server");
      await assertAcessoConversa(context.supabase, context.userId, data.clinicaId, data.conversaId);
    }
    if (await ehAdminClinica(context.supabase, context.userId, data.clinicaId))
      throw new Error(MSG_ADMIN_NAO_ATENDE);
    trace.marcar("SEND_T4_AUTH_DONE");
    // IDEMPOTÊNCIA: se este mesmo envio já foi concluído (duplo clique, retry,
    // reenvio acidental), devolvemos a mensagem existente sem chamar o
    // WhatsApp de novo. A checagem é pelo identificador do envio, nunca pelo
    // texto — duas mensagens iguais podem ser legítimas.
    if (data.clientMessageId) {
      const { data: jaExiste } = await context.supabase
        .from("whatsapp_mensagens")
        .select(
          "id, conversa_id, direction, from_number, to_number, body, tipo, enviada_por, recebida_em, status, client_message_id, wa_message_id",
        )
        .eq("clinica_id", data.clinicaId)
        .eq("client_message_id", data.clientMessageId)
        .maybeSingle();
      if (jaExiste) return { duplicada: true as const, mensagem: jaExiste };
    }
    const cfg = await trace.medir("loadWhatsAppConfig", () => loadWhatsAppConfig(data.clinicaId));
    if (!cfg?.phone_number_id || !cfg?.access_token) throw new Error("WhatsApp não configurado.");
    trace.marcar("SEND_T5_CONFIG_READY");
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
      try {
        const { protocoloAoAtribuirHumano } = await import(
          "@/lib/atendimento/protocolo-atendimento.server"
        );
        await protocoloAoAtribuirHumano({
          clinicaId: data.clinicaId,
          conversaId: data.conversaId,
          userId: context.userId,
        });
      } catch (e) {
        console.error("[atendimento] protocolo ao responder direto", e);
      }
    }


    const to = conv.contato_telefone.startsWith("+")
      ? conv.contato_telefone
      : `+${conv.contato_telefone}`;
    trace.marcar("SEND_T6_META_REQUEST_START");
    const { wa_message_id } = await metaSendText(
      cfg.phone_number_id,
      cfg.access_token,
      to,
      data.text,
    );
    trace.marcar("SEND_T7_META_RESPONSE");

    const { data: gravada } = await context.supabase
      .from("whatsapp_mensagens")
      .insert({
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
        // Mesmo identificador do clique — nada é gerado de novo aqui.
        client_message_id: data.clientMessageId ?? null,
      } as any)
      .select(
        "id, conversa_id, direction, from_number, to_number, body, tipo, enviada_por, recebida_em, status, client_message_id, wa_message_id",
      )
      .maybeSingle();
    trace.marcar("SEND_T8_DB_INSERT_DONE");

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
    trace.marcar("SEND_T9_CONVERSATION_UPDATE_DONE");
    trace.marcar("SEND_T10_BACKEND_RESPONSE");
    trace.publicar();

    // `latencia` é diagnóstico técnico (tempos e etapas). A tela junta essas
    // marcas com as dela para montar o trace ponta a ponta.
    return {
      ok: true,
      wa_message_id,
      mensagem: gravada ?? null,
      latencia: { traceId: trace.traceId, marcas: trace.marcas(), subprocessos: trace.subprocessos() },
    };
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
    // FASE 3 — status da identidade e candidatos por telefone (sem confirmar).
    let identidadeStatus: string = "NO_MATCH";
    let candidatos: Array<{ id: string; nome: string | null }> = [];

    // FASE 3: abrir a conversa NÃO grava vínculo. O telefone apenas sugere
    // candidatos; dados clínicos só aparecem com vínculo explícito.
    {
      const { resolverContatoConversa } = await import("./atendimento/vinculo-contato.server");
      const resolvido = await resolverContatoConversa(context.supabase, {
        clinicaId: data.clinicaId,
        conversaId: data.conversaId,
        contatoPacienteId: conv.contato_paciente_id ?? null,
        contatoTelefone: conv.contato_telefone ?? null,
      });
      identidadeStatus = resolvido.status;
      candidatos = resolvido.candidatos;
      if (resolvido.status === "EXPLICIT_LINK" && resolvido.pacienteId) {
        const { data: p } = await context.supabase
          .from("pacientes")
          .select("id, nome, telefone, email, cpf, data_nascimento, sexo, cidade, estado")
          .eq("id", resolvido.pacienteId)
          .maybeSingle();
        paciente = p;
        contatoVia = "id";
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
      identidade_status: identidadeStatus,
      candidatos_paciente: candidatos,
    };
  });

/* =========================================================
 *  FASE 5 — revisão manual do vínculo contato ↔ paciente
 * =========================================================
 * Nome diferente NÃO prova vínculo errado (responsável, mãe, acompanhante,
 * apelido, número da empresa). Por isso nada é desvinculado automaticamente:
 * a troca só acontece aqui, por escolha explícita e confirmada de alguém com
 * acesso à conversa, e fica registrada em `atend_conversa_eventos`.
 */
export const revisarVinculoPacienteConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        pacienteId: z.string().uuid(),
        confirmado: z.literal(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    {
      const { assertAcessoConversa } = await import("./atendimento/acesso-conversa.server");
      await assertAcessoConversa(context.supabase, context.userId, data.clinicaId, data.conversaId);
    }
    // O paciente precisa ser da mesma clínica da conversa.
    const { data: pac } = await context.supabase
      .from("pacientes")
      .select("id, nome")
      .eq("id", data.pacienteId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (!pac) throw new Error("Paciente não encontrado nesta clínica.");

    const { data: conv } = await context.supabase
      .from("atend_conversas")
      .select("contato_paciente_id")
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    const anterior = (conv as { contato_paciente_id?: string | null } | null)?.contato_paciente_id ?? null;
    if (anterior === data.pacienteId) return { ok: true, paciente: pac, trocado: false };

    const { vincularPacienteConversa } = await import("./atendimento/vinculo-contato.server");
    const ok = await vincularPacienteConversa(context.supabase as never, {
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      pacienteId: data.pacienteId,
      // Revisão explícita: pode substituir um vínculo antigo incorreto.
      forcar: true,
      origem: "atendente",
      responsavelUserId: context.userId,
    });
    if (!ok) throw new Error("Não foi possível atualizar o vínculo.");
    // Auditoria adicional guardando o vínculo anterior (o histórico não some).
    try {
      await context.supabase.from("atend_conversa_eventos").insert({
        clinica_id: data.clinicaId,
        conversa_id: data.conversaId,
        evento: "vinculo_paciente_revisado",
        user_id: context.userId,
        detalhes: {
          paciente_id_anterior: anterior,
          paciente_id: data.pacienteId,
          em: new Date().toISOString(),
        },
      });
    } catch {
      /* auditoria não bloqueia a revisão */
    }
    return { ok: true, paciente: pac, trocado: true };
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
    // FASE 2 — este era um segundo caminho de atribuição automática que NÃO
    // olhava presença Online, pausa, Telefonia nem administrador: era a única
    // rota capaz de entregar conversa para quem não podia receber. Agora ele
    // delega para a MESMA função do banco usada pela Nina, que aplica todas as
    // regras e a trava por clínica. Mantido apenas por compatibilidade.
    if (data.departamentoId) {
      await context.supabase
        .from("atend_conversas")
        .update({ departamento_id: data.departamentoId })
        .eq("id", data.conversaId)
        .eq("clinica_id", data.clinicaId);
    }
    const { data: userId, error } = await context.supabase.rpc("atend_auto_assign_conversa", {
      _clinica_id: data.clinicaId,
      _conversa_id: data.conversaId,
    } as never);
    if (error) throw new Error(error.message);
    if (!userId) return { ok: false, motivo: "Sem atendentes elegíveis (Telefonia + Online)" };
    return { ok: true, user_id: userId as string };
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
        "id, status, contato_nome, whatsapp_profile_name, contato_telefone, ultima_msg_em, ultima_msg_preview, aguardando_desde, atribuida_user_id, departamento_id, sla_first_response_seg, unread_count",
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
        "id, contato_nome, whatsapp_profile_name, contato_telefone, canal, status, departamento_id, prioridade, aguardando_desde, handoff_motivo, handoff_resumo, ultima_msg_preview, ultima_msg_em, unread_count, pacientes:contato_paciente_id(nome)",
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
    if (await ehAdminClinica(context.supabase, context.userId, data.clinicaId))
      return { ok: false as const, motivo: "ADMIN_NAO_ATENDE" as const };
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
    // Encaminhamento da Nina concluído por quem assumiu na fila.
    try {
      const { protocoloAoAtribuirHumano } = await import(
        "@/lib/atendimento/protocolo-atendimento.server"
      );
      await protocoloAoAtribuirHumano({
        clinicaId: data.clinicaId,
        conversaId: data.conversaId,
        userId: context.userId,
      });
    } catch (e) {
      console.error("[atendimento] protocolo ao assumir", e);
    }
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
          const det = (r.detalhes ?? null) as
            | { para_user_id?: string | null; de_user_id?: string | null }
            | null;
          return [r.user_id, det?.para_user_id ?? null, det?.de_user_id ?? null];
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
      const det = (r.detalhes ?? null) as
        | { para_user_id?: string | null; de_user_id?: string | null }
        | null;
      const paraId = det?.para_user_id ?? null;
      const deId = det?.de_user_id ?? null;
      return {
        ...r,
        user_nome: r.user_id ? (nomes.get(r.user_id) ?? null) : null,
        para_nome: paraId ? (nomes.get(paraId) ?? null) : null,
        de_nome: deId ? (nomes.get(deId) ?? null) : null,
      };
    });
  });

/**
 * Sinal de vida / estado técnico da conexão.
 *
 * FASE 1 — este caminho NUNCA muda a escolha manual do atendente. Quando já
 * existe escolha gravada (`estado_manual`), o que chega aqui é ignorado: só o
 * `visto_em` é atualizado e `status`/`aceita_novas` continuam derivados da
 * escolha. Sem escolha registrada, o comportamento antigo é mantido para não
 * quebrar telas legadas — mas nada disso vira escolha manual.
 */
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
    const { data: atual } = await context.supabase
      .from("atend_agente_presenca")
      .select("estado_manual")
      .eq("clinica_id", data.clinicaId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const manual = (atual as { estado_manual?: string | null } | null)?.estado_manual ?? null;
    const tecnico = ehEstadoManual(manual)
      ? tecnicoDoEstadoManual(manual)
      : { status: data.status, aceitaNovas: data.aceitaNovas ?? data.status === "ONLINE" };
    const { error } = await context.supabase.from("atend_agente_presenca").upsert(
      {
        clinica_id: data.clinicaId,
        user_id: context.userId,
        status: tecnico.status,
        aceita_novas: tecnico.aceitaNovas,
        visto_em: new Date().toISOString(),
      },
      { onConflict: "clinica_id,user_id" },
    );
    if (error) throw new Error(error.message);

    // Ao ficar online, o que estava parado na fila "Não atribuídas" é
    // distribuído na hora (da conversa que espera há mais tempo para a mais
    // recente), sempre para quem tem menos conversas ativas.
    let distribuidas = 0;
    if (
      tecnico.status === "ONLINE" &&
      tecnico.aceitaNovas &&
      (await temTelefonia(context.supabase as never, context.userId, data.clinicaId))
    ) {
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
 * FASE 1 — ÚNICA operação que grava a escolha manual de presença.
 *
 * • Só o próprio atendente altera a própria presença (`context.userId`), nunca
 *   a de outra pessoa: nenhum `userId` é aceito na entrada.
 * • Só os três estados permitidos são aceitos (Online, Offline, Em pausa).
 * • Concorrência: a tela envia a versão que leu; se já mudou em outro lugar, a
 *   gravação é recusada com a versão atual, em vez de sobrescrever.
 * • Registra estado, quem alterou, quando e versão — e guarda o histórico em
 *   `atend_presenca_manual_log`, sem apagar nada.
 */
export const definirPresencaManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        estado: z.enum(ESTADOS_MANUAIS),
        versao: z.number().int().nonnegative().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);

    const { data: atual } = await context.supabase
      .from("atend_agente_presenca")
      .select("estado_manual_versao")
      .eq("clinica_id", data.clinicaId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const versaoAtual =
      (atual as { estado_manual_versao?: number | null } | null)?.estado_manual_versao ?? 0;
    if (!versaoAceita(versaoAtual, data.versao)) {
      return { ok: false as const, conflito: true as const, versao: versaoAtual };
    }

    const agora = new Date().toISOString();
    const novaVersao = versaoAtual + 1;
    const tecnico = tecnicoDoEstadoManual(data.estado);
    const { error } = await context.supabase.from("atend_agente_presenca").upsert(
      {
        clinica_id: data.clinicaId,
        user_id: context.userId,
        status: tecnico.status,
        aceita_novas: tecnico.aceitaNovas,
        visto_em: agora,
        estado_manual: data.estado,
        estado_manual_em: agora,
        estado_manual_por: context.userId,
        estado_manual_versao: novaVersao,
      },
      { onConflict: "clinica_id,user_id" },
    );
    if (error) throw new Error(error.message);

    const { error: eLog } = await context.supabase.from("atend_presenca_manual_log").insert({
      clinica_id: data.clinicaId,
      user_id: context.userId,
      estado: data.estado,
      versao: novaVersao,
      definido_por: context.userId,
    });
    if (eLog) console.error("[atendimento] falha ao registrar histórico de presença:", eLog.message);

    // Escolher Online devolve a pessoa ao pool e reavalia "Não atribuídas".
    let distribuidas = 0;
    if (
      data.estado === "ONLINE" &&
      (await temTelefonia(context.supabase as never, context.userId, data.clinicaId))
    ) {
      const { data: n, error: e2 } = await context.supabase.rpc("atend_distribuir_fila", {
        _clinica_id: data.clinicaId,
        _max: 20,
      } as never);
      if (e2) console.error("[atendimento] falha ao distribuir fila:", e2.message);
      else distribuidas = Number(n ?? 0);
    }

    return {
      ok: true as const,
      conflito: false as const,
      estado: data.estado,
      versao: novaVersao,
      em: agora,
      distribuidas,
    };
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


/**
 * Diagnóstico (somente leitura) do pool de distribuição automática.
 *
 * Mostra, candidato a candidato, por que ele foi aceito ou rejeitado — as
 * MESMAS condições que `public.atend_auto_assign_conversa` aplica no banco.
 * Não atribui, não altera presença e não movimenta a fila: serve para
 * investigar "por que fulano não recebeu" sem precisar de log temporário.
 */
export const diagnosticarPoolTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clinIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.clinicaId);
    const clinicaId = data.clinicaId;

    // Uma única chamada ao banco monta o quadro completo (sem N+1): é a mesma
    // avaliação que a atribuição automática grava na auditoria.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: avaliacao, error }, { data: membros }] = await Promise.all([
      supabaseAdmin.rpc("atend_pool_telefonia_avaliacao", {
        _clinica_id: clinicaId,
        _departamento_id: null,
      } as never),
      supabaseAdmin
        .from("clinica_memberships")
        .select("user_id, role")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true),
    ]);
    if (error) throw new Error(error.message);

    const perfilPorUser = new Map(
      ((membros ?? []) as { user_id: string; role: string }[]).map((m) => [m.user_id, m.role]),
    );

    type Linha = {
      user_id: string;
      permission_telefonia: boolean;
      presence_status: string;
      aceita_novas: boolean;
      presenca_recente: boolean;
      em_pausa: boolean;
      admin: boolean;
      load_at_selection: number;
      capacidade: number;
      elegivel: boolean;
      motivo_exclusao: string | null;
    };

    const candidatos = ((avaliacao ?? []) as Linha[]).map((l) => ({
      user_id: l.user_id,
      perfil: perfilPorUser.get(l.user_id) ?? "desconhecido",
      telefonia: l.permission_telefonia,
      status: l.presence_status,
      aceita_novas: l.aceita_novas,
      presenca_recente: l.presenca_recente,
      em_pausa: l.em_pausa,
      admin: l.admin,
      online: l.presence_status === "ONLINE" && l.aceita_novas && l.presenca_recente,
      carga_atual: l.load_at_selection,
      capacidade: l.capacidade,
      elegivel: l.elegivel,
      motivo: l.motivo_exclusao,
    }));

    return {
      clinicaId,
      avaliadoEm: new Date().toISOString(),
      elegiveis: candidatos.filter((c) => c.elegivel).length,
      candidatos,
    };
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
