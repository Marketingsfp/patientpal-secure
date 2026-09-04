// Roteador da API de integração v1 (agendamentos).
//
// GENÉRICA por decisão de projeto: não existe aqui nenhum parceiro, webhook,
// sincronização ou formato de sistema externo. É apenas a agenda do Health Hub
// Pro exposta como REST, com chave de API.
//
// Toda escrita passa pelos MESMOS núcleos usados pela tela da Agenda
// (`src/lib/agenda/*.core.server.ts`). Nenhum INSERT/UPDATE direto em
// `agendamentos` acontece neste arquivo — exceto a marcação de origem, que o
// próprio núcleo aplica.

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AtorAgenda, CtxAgenda } from "@/lib/agenda/ator.server";
import { EscopoClinicaError } from "@/lib/agenda/ator.server";
import { criarAgendamentoCore } from "@/lib/agenda/criar-agendamento.core.server";
import { atualizarStatusAgendamentoCore } from "@/lib/agenda/status-agendamento.core.server";
import { reagendarAgendamentoCore } from "@/lib/agenda/reagendar-agendamento.core.server";
import {
  ApiError,
  autenticarApiKey,
  concluirIdempotencia,
  consumirRateLimit,
  erroResponse,
  exigirEscopo,
  iniciarIdempotencia,
  jsonResponse,
  lerApiKeyDoRequest,
  novoRequestId,
  registrarRequisicao,
  type ApiKeyContexto,
} from "./api.server";
import { pacienteSchema, resolverPaciente } from "./pacientes-v1.server";

const CAMPOS_AGENDAMENTO =
  "id,clinica_id,paciente_id,paciente_nome,medico_id,especialidade_id,inicio,fim,procedimento,status,observacoes,tipo_atendimento,data_pagamento,origem_integracao,id_externo,created_at,updated_at";

const isoDatetime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Data/hora inválida (use ISO 8601).");

const uuid = z.string().uuid("Identificador inválido.");

const criarSchema = z.object({
  id_externo: z.string().min(1).max(120),
  // v1: paciente já cadastrado. v1.1: alternativamente o objeto `paciente`.
  // Um ou outro — nunca os dois (ver `patient_and_id_conflict`).
  paciente_id: uuid.optional(),
  paciente: pacienteSchema.optional(),
  medico_id: uuid.nullish(),
  especialidade_id: uuid.nullish(),
  inicio: isoDatetime,
  fim: isoDatetime,
  procedimento: z.string().max(300).nullish(),
  procedimentos: z.array(z.string().min(1).max(300)).max(20).optional(),
  multi_exames_modo: z.enum(["laboratorio", "imagem"]).nullish(),
  tipo_atendimento: z.enum(["particular", "convenio"]).default("particular"),
  observacoes: z.string().max(2000).nullish(),
});

const reagendarSchema = z.object({
  inicio: isoDatetime,
  fim: isoDatetime,
  medico_id: uuid.nullish(),
});

const cancelarSchema = z
  .object({ motivo: z.string().max(500).nullish() })
  .optional()
  .default({});

function ok<T>(status: number, data: T) {
  return { status, body: { data } };
}

// ------------------------------------------------------------------ handlers

async function handleAvailability(
  db: SupabaseClient<Database>,
  ctx: ApiKeyContexto,
  url: URL,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "availability:read");

  const q = z
    .object({
      medico_id: uuid.optional(),
      especialidade_id: uuid.optional(),
      dias: z.coerce.number().int().min(1).max(30).default(7),
      limite: z.coerce.number().int().min(1).max(200).default(60),
    })
    .safeParse(Object.fromEntries(url.searchParams));
  if (!q.success) {
    throw new ApiError({
      status: 422,
      code: "invalid_query",
      message: "Parâmetros inválidos.",
      details: q.error.flatten().fieldErrors,
    });
  }

  const { data, error } = await db.rpc("get_horarios_disponiveis", {
    _clinica_id: ctx.clinica_id,
    _especialidade_id: q.data.especialidade_id ?? null,
    _medico_id: q.data.medico_id ?? null,
    _dias: q.data.dias,
    _limite: q.data.limite,
  } as never);
  if (error) {
    throw new ApiError({
      status: 502,
      code: "availability_failed",
      message: "Não foi possível consultar a disponibilidade.",
    });
  }

  const slots = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((s) => Number(s["ocupados"] ?? 0) < Number(s["capacidade"] ?? 0))
    .map((s) => ({
      medico_id: s["medico_id"],
      medico_nome: s["medico_nome"],
      especialidade_id: s["especialidade_id"],
      especialidade_nome: s["especialidade_nome"],
      agenda_id: s["agenda_id"],
      agenda_nome: s["agenda_nome"],
      inicio: s["inicio"],
      fim: s["fim"],
      vagas: Number(s["capacidade"] ?? 0) - Number(s["ocupados"] ?? 0),
    }));

  return ok(200, { slots, total: slots.length });
}

async function buscarAgendamento(db: SupabaseClient<Database>, ctx: ApiKeyContexto, ref: string) {
  const query = db.from("agendamentos").select(CAMPOS_AGENDAMENTO).eq("clinica_id", ctx.clinica_id);
  const r = ref.startsWith("ext:")
    ? await query
        .eq("origem_integracao", ctx.origem_integracao)
        .eq("id_externo", ref.slice(4))
        .maybeSingle()
    : await query.eq("id", ref).maybeSingle();
  if (r.error) {
    throw new ApiError({
      status: 500,
      code: "read_failed",
      message: "Falha ao ler o agendamento.",
    });
  }
  if (!r.data) {
    throw new ApiError({
      status: 404,
      code: "appointment_not_found",
      message: "Agendamento não encontrado nesta clínica.",
    });
  }
  return r.data;
}

async function handleCriar(
  db: SupabaseClient<Database>,
  ctx: ApiKeyContexto,
  ator: AtorAgenda,
  bodyTexto: string,
  idempotencyKey: string | null,
): Promise<{ status: number; body: unknown; idExterno?: string; pacienteCriado?: boolean }> {
  exigirEscopo(ctx, "appointments:write");

  let bruto: unknown;
  try {
    bruto = JSON.parse(bodyTexto || "{}");
  } catch {
    throw new ApiError({ status: 400, code: "invalid_json", message: "Corpo JSON inválido." });
  }
  const parsed = criarSchema.safeParse(bruto);
  if (!parsed.success) {
    throw new ApiError({
      status: 422,
      code: "invalid_body",
      message: "Corpo da requisição inválido.",
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const body = parsed.data;

  if (body.paciente && body.paciente_id) {
    throw new ApiError({
      status: 422,
      code: "patient_and_id_conflict",
      message: "Envie 'paciente_id' OU o objeto 'paciente', nunca os dois.",
    });
  }
  if (!body.paciente && !body.paciente_id) {
    throw new ApiError({
      status: 422,
      code: "invalid_body",
      message: "Informe 'paciente_id' (paciente já cadastrado) ou o objeto 'paciente'.",
    });
  }
  if (body.paciente) {
    // Cadastro por rota pública exige escopo próprio e idempotência: sem isso,
    // um duplo clique ou um retry vira paciente duplicado na base real.
    exigirEscopo(ctx, "patients:write");
    if (!idempotencyKey) {
      throw new ApiError({
        status: 422,
        code: "idempotency_key_required",
        message: "Envie o cabeçalho 'Idempotency-Key' quando o corpo trouxer o objeto 'paciente'.",
      });
    }
  }

  if (Date.parse(body.fim) <= Date.parse(body.inicio)) {
    throw new ApiError({
      status: 422,
      code: "invalid_period",
      message: "O horário final precisa ser depois do inicial.",
    });
  }

  // Reenvio do mesmo id_externo devolve o registro já criado (seguro para retry).
  const { data: jaExiste } = await db
    .from("agendamentos")
    .select(CAMPOS_AGENDAMENTO)
    .eq("clinica_id", ctx.clinica_id)
    .eq("origem_integracao", ctx.origem_integracao)
    .eq("id_externo", body.id_externo)
    .maybeSingle();
  if (jaExiste) {
    return {
      status: 200,
      body: { data: { ...jaExiste, replay: true } },
      idExterno: body.id_externo,
    };
  }

  // Resolução do paciente.
  //  • v1 (`paciente_id`): precisa existir; comportamento inalterado.
  //  • v1.1 (`paciente`): encontra pelo CPF na clínica da chave ou cadastra.
  let pacienteId: string;
  let pacienteNome: string;
  let pacienteCriado = false;
  let obsExtra: string | null = null;

  if (body.paciente) {
    const resolvido = await resolverPaciente(db, ctx, body.paciente);
    pacienteId = resolvido.paciente_id;
    pacienteNome = resolvido.nome;
    pacienteCriado = resolvido.criado;
    if (resolvido.telefone_divergente) {
      // Cadastro é da recepção: telefone novo só é anotado no agendamento.
      obsExtra = `Telefone informado no agendamento online: ${resolvido.telefone_divergente}`;
    }
  } else {
    const { data: paciente } = await db
      .from("pacientes")
      .select("id,nome,clinica_id")
      .eq("id", body.paciente_id!)
      .eq("clinica_id", ctx.clinica_id)
      .maybeSingle();
    if (!paciente) {
      throw new ApiError({
        status: 422,
        code: "patient_not_found",
        message: "Paciente não encontrado nesta clínica. Cadastre o paciente antes de agendar.",
      });
    }
    pacienteId = paciente.id;
    pacienteNome = paciente.nome;
  }
  const paciente = { id: pacienteId, nome: pacienteNome };
  const observacoesFinais =
    [body.observacoes ?? null, obsExtra].filter(Boolean).join(" | ") || null;

  const ctxAgenda: CtxAgenda = { db, ator };
  const resultado = await criarAgendamentoCore(ctxAgenda, {
    clinica_id: ctx.clinica_id,
    editing_id: null,
    payload: {
      clinica_id: ctx.clinica_id,
      paciente_nome: paciente.nome,
      paciente_id: paciente.id,
      medico_id: body.medico_id ?? null,
      inicio: new Date(body.inicio).toISOString(),
      fim: new Date(body.fim).toISOString(),
      procedimento: body.procedimento ?? body.procedimentos?.[0] ?? null,
      status: "agendado",
      observacoes: observacoesFinais,
      // Agendamento vindo da API entra SEMPRE como não pago.
      data_pagamento: null,
      orcamento_id: null,
      tipo_atendimento: body.tipo_atendimento,
      forma_pagamento_prevista: null,
      especialidade_id: body.especialidade_id ?? null,
    },
    ...(body.procedimentos ? { procedimentos: body.procedimentos } : {}),
    multi_exames_modo: body.multi_exames_modo ?? null,
    checagens: {
      validar_paciente_completo: true,
      validar_agenda_aberta: true,
      validar_inadimplencia: body.tipo_atendimento === "convenio",
    },
    pending_orc_item_ids: [],
    // A API não tem como fazer a pergunta de confirmação da tela. Atendimento
    // em paralelo com OUTRO profissional é permitido pela clínica, então já
    // entra confirmado; choque com o MESMO profissional continua bloqueado.
    confirmacoes: { permitir_conflito_paciente: true },
    integracao_marca: {
      origem_integracao: ctx.origem_integracao,
      id_externo: body.id_externo,
    },
  });

  if (!resultado.ok) {
    if ("validation_error" in resultado) {
      throw new ApiError({
        status: 422,
        code: "business_rule_violation",
        message: resultado.validation_error.message,
      });
    }
    throw new ApiError({
      status: 422,
      code: "appointment_rejected",
      message: resultado.pg_error.message,
    });
  }

  const criado = await buscarAgendamento(db, ctx, resultado.id);
  return {
    status: 201,
    body: {
      data: {
        ...criado,
        ...(resultado.sibling_ids?.length ? { agendamentos_irmaos: resultado.sibling_ids } : {}),
      },
    },
    idExterno: body.id_externo,
    // Só para o log interno: a resposta HTTP não revela se o CPF já existia.
    pacienteCriado,
  };
}

/**
 * Catálogo para os seletores do site institucional. Devolve apenas id e nome —
 * nada de CRM, contato ou qualquer dado além do necessário para montar a tela.
 */
async function handleEspecialidades(
  db: SupabaseClient<Database>,
  ctx: ApiKeyContexto,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "availability:read");
  // Especialidades são globais; o recorte por clínica vem dos médicos dela.
  const { data: vinculos } = await db
    .from("medicos")
    .select("id")
    .eq("clinica_id", ctx.clinica_id)
    .eq("ativo", true);
  const medicoIds = (vinculos ?? []).map((m) => m.id);
  if (medicoIds.length === 0) return { status: 200, body: { data: [] } };

  const { data: rel } = await db
    .from("medico_especialidades")
    .select("especialidade_id")
    .in("medico_id", medicoIds);
  const espIds = [...new Set((rel ?? []).map((r) => r.especialidade_id).filter(Boolean))];
  if (espIds.length === 0) return { status: 200, body: { data: [] } };

  const { data, error } = await db
    .from("especialidades")
    .select("id,nome")
    .in("id", espIds as string[])
    .order("nome");
  if (error) {
    throw new ApiError({
      status: 500,
      code: "read_failed",
      message: "Falha ao ler especialidades.",
    });
  }
  return { status: 200, body: { data: data ?? [] } };
}

async function handleMedicos(
  db: SupabaseClient<Database>,
  ctx: ApiKeyContexto,
  url: URL,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "availability:read");
  const filtroEsp = url.searchParams.get("especialidade_id");
  if (filtroEsp && !z.string().uuid().safeParse(filtroEsp).success) {
    throw new ApiError({
      status: 422,
      code: "invalid_query",
      message: "Parâmetro 'especialidade_id' inválido.",
    });
  }

  const { data: medicos, error } = await db
    .from("medicos")
    .select("id,nome")
    .eq("clinica_id", ctx.clinica_id)
    .eq("ativo", true)
    .order("nome");
  if (error) {
    throw new ApiError({ status: 500, code: "read_failed", message: "Falha ao ler médicos." });
  }
  const lista = medicos ?? [];
  if (lista.length === 0) return { status: 200, body: { data: [] } };

  const { data: rel } = await db
    .from("medico_especialidades")
    .select("medico_id,especialidade_id")
    .in(
      "medico_id",
      lista.map((m) => m.id),
    );

  const saida: Array<{ id: string; nome: string; especialidade_id: string | null }> = [];
  for (const m of lista) {
    const espsDoMedico = (rel ?? []).filter((r) => r.medico_id === m.id);
    if (espsDoMedico.length === 0) {
      if (!filtroEsp) saida.push({ id: m.id, nome: m.nome, especialidade_id: null });
      continue;
    }
    for (const e of espsDoMedico) {
      if (filtroEsp && e.especialidade_id !== filtroEsp) continue;
      saida.push({ id: m.id, nome: m.nome, especialidade_id: e.especialidade_id ?? null });
    }
  }
  return { status: 200, body: { data: saida } };
}

async function handleCancelar(
  db: SupabaseClient<Database>,
  ctx: ApiKeyContexto,
  ator: AtorAgenda,
  ref: string,
  bodyTexto: string,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "appointments:write");
  const parsed = cancelarSchema.safeParse(bodyTexto ? JSON.parse(bodyTexto) : {});
  if (!parsed.success) {
    throw new ApiError({ status: 422, code: "invalid_body", message: "Corpo inválido." });
  }

  const atual = await buscarAgendamento(db, ctx, ref);
  if (atual.status === "cancelado") {
    return { status: 200, body: { data: { ...atual, replay: true } } };
  }

  const motivo = parsed.data?.motivo?.trim();

  await atualizarStatusAgendamentoCore(
    { db, ator },
    {
      agendamento_ids: [atual.id],
      novo_status: "cancelado",
      cascatear_pacote: false,
      // O motivo do parceiro vai para a coluna de cancelamento, junto do
      // status, para aparecer no Histórico. Quando ele não manda nada, o
      // núcleo grava "Cancelado pela integração <nome>".
      motivo: motivo ?? null,
    },
  );

  if (motivo) {
    const obs = [atual.observacoes, `Cancelado via integração: ${motivo}`]
      .filter(Boolean)
      .join(" | ");
    await db
      .from("agendamentos")
      .update({ observacoes: obs } as never)
      .eq("id", atual.id);
  }

  return { status: 200, body: { data: await buscarAgendamento(db, ctx, atual.id) } };
}

async function handleReagendar(
  db: SupabaseClient<Database>,
  ctx: ApiKeyContexto,
  ator: AtorAgenda,
  ref: string,
  bodyTexto: string,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "appointments:write");
  let bruto: unknown;
  try {
    bruto = JSON.parse(bodyTexto || "{}");
  } catch {
    throw new ApiError({ status: 400, code: "invalid_json", message: "Corpo JSON inválido." });
  }
  const parsed = reagendarSchema.safeParse(bruto);
  if (!parsed.success) {
    throw new ApiError({
      status: 422,
      code: "invalid_body",
      message: "Corpo da requisição inválido.",
      details: parsed.error.flatten().fieldErrors,
    });
  }
  if (Date.parse(parsed.data.fim) <= Date.parse(parsed.data.inicio)) {
    throw new ApiError({
      status: 422,
      code: "invalid_period",
      message: "O horário final precisa ser depois do inicial.",
    });
  }

  const atual = await buscarAgendamento(db, ctx, ref);
  const resultado = await reagendarAgendamentoCore(
    { db, ator },
    {
      clinica_id: ctx.clinica_id,
      agendamento_id: atual.id,
      novo_inicio: new Date(parsed.data.inicio).toISOString(),
      novo_fim: new Date(parsed.data.fim).toISOString(),
      novo_medico_id: parsed.data.medico_id ?? null,
    },
  );
  if (!resultado.ok) {
    throw new ApiError({
      status: 422,
      code: "business_rule_violation",
      message:
        "validation_error" in resultado
          ? resultado.validation_error.message
          : resultado.pg_error.message,
    });
  }
  return { status: 200, body: { data: await buscarAgendamento(db, ctx, resultado.id) } };
}

async function handleListar(
  db: SupabaseClient<Database>,
  ctx: ApiKeyContexto,
  url: URL,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "appointments:read");
  const q = z
    .object({
      id_externo: z.string().max(120).optional(),
      paciente_id: uuid.optional(),
      medico_id: uuid.optional(),
      status: z.string().max(30).optional(),
      de: isoDatetime.optional(),
      ate: isoDatetime.optional(),
      limite: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).max(10000).default(0),
    })
    .safeParse(Object.fromEntries(url.searchParams));
  if (!q.success) {
    throw new ApiError({
      status: 422,
      code: "invalid_query",
      message: "Parâmetros inválidos.",
      details: q.error.flatten().fieldErrors,
    });
  }
  const f = q.data;
  let query = db
    .from("agendamentos")
    .select(CAMPOS_AGENDAMENTO, { count: "exact" })
    .eq("clinica_id", ctx.clinica_id)
    .order("inicio", { ascending: true })
    .range(f.offset, f.offset + f.limite - 1);
  if (f.id_externo) {
    query = query.eq("origem_integracao", ctx.origem_integracao).eq("id_externo", f.id_externo);
  }
  if (f.paciente_id) query = query.eq("paciente_id", f.paciente_id);
  if (f.medico_id) query = query.eq("medico_id", f.medico_id);
  if (f.status) query = query.eq("status", f.status as never);
  if (f.de) query = query.gte("inicio", new Date(f.de).toISOString());
  if (f.ate) query = query.lte("inicio", new Date(f.ate).toISOString());

  const { data, error, count } = await query;
  if (error) {
    throw new ApiError({ status: 500, code: "read_failed", message: "Falha ao listar." });
  }
  return ok(200, {
    appointments: data ?? [],
    total: count ?? 0,
    limite: f.limite,
    offset: f.offset,
  });
}

// ------------------------------------------------------------------ roteador

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,x-api-key,content-type,idempotency-key",
  "access-control-max-age": "86400",
};

/** Trata QUALQUER rota abaixo de `<base>/` — o splat vem sem barra inicial. */
export async function handleIntegracoesV1(request: Request, splat: string): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const requestId = novoRequestId();
  const inicio = Date.now();
  const url = new URL(request.url);
  const partes = (splat || "").split("/").filter(Boolean);
  const rota = `/${partes.join("/")}`;
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient<Database>;

  let ctx: ApiKeyContexto | null = null;
  let idExterno: string | null = null;
  let status = 500;
  let erroCodigo: string | null = null;
  let erroResumo: string | null = null;
  let response: Response;
  const idempotencyKey = request.headers.get("idempotency-key");
  let bodyTexto = "";

  try {
    ctx = await autenticarApiKey(db, lerApiKeyDoRequest(request));
    await consumirRateLimit(db, ctx);

    const ator: AtorAgenda = {
      tipo: "integracao",
      api_key_id: ctx.api_key_id,
      clinica_id: ctx.clinica_id,
      origem_integracao: ctx.origem_integracao,
      pode_gerenciar_todos: ctx.escopos.includes("appointments:write:all"),
    };

    if (request.method === "POST") bodyTexto = await request.text();

    const replay =
      request.method === "POST"
        ? await iniciarIdempotencia(db, ctx.api_key_id, idempotencyKey, bodyTexto)
        : null;

    let resultado: {
      status: number;
      body: unknown;
      idExterno?: string;
      pacienteCriado?: boolean;
    };
    if (replay) {
      resultado = { status: replay.status, body: replay.body };
    } else if (request.method === "GET" && partes[0] === "availability" && partes.length === 1) {
      resultado = await handleAvailability(db, ctx, url);
    } else if (request.method === "GET" && partes[0] === "specialties" && partes.length === 1) {
      resultado = await handleEspecialidades(db, ctx);
    } else if (request.method === "GET" && partes[0] === "doctors" && partes.length === 1) {
      resultado = await handleMedicos(db, ctx, url);
    } else if (request.method === "GET" && partes[0] === "appointments" && partes.length === 1) {
      resultado = await handleListar(db, ctx, url);
    } else if (request.method === "GET" && partes[0] === "appointments" && partes.length === 2) {
      exigirEscopo(ctx, "appointments:read");
      resultado = ok(200, await buscarAgendamento(db, ctx, decodeURIComponent(partes[1]!)));
    } else if (request.method === "POST" && partes[0] === "appointments" && partes.length === 1) {
      resultado = await handleCriar(db, ctx, ator, bodyTexto, idempotencyKey);
    } else if (
      request.method === "POST" &&
      partes[0] === "appointments" &&
      partes.length === 3 &&
      partes[2] === "cancel"
    ) {
      resultado = await handleCancelar(db, ctx, ator, decodeURIComponent(partes[1]!), bodyTexto);
    } else if (
      request.method === "POST" &&
      partes[0] === "appointments" &&
      partes.length === 3 &&
      partes[2] === "reschedule"
    ) {
      resultado = await handleReagendar(db, ctx, ator, decodeURIComponent(partes[1]!), bodyTexto);
    } else {
      // Recursos do Cartão Benefícios (leitura). Devolve null quando o caminho
      // não é de lá, e aí cai no 404 abaixo.
      const { rotearCartaoV1 } = await import("./cartao-v1.server");
      const cartao = await rotearCartaoV1(db, ctx, request.method, partes, url);
      if (!cartao) {
        throw new ApiError({
          status: 404,
          code: "route_not_found",
          message: `Rota ${request.method} ${rota} não existe na API v1.`,
        });
      }
      resultado = cartao;
    }

    status = resultado.status;
    idExterno = resultado.idExterno ?? null;
    // A criação de paciente fica registrada só aqui, no log interno — a
    // resposta HTTP jamais revela se o CPF já existia na base.
    if (resultado.pacienteCriado) erroResumo = "paciente_criado_via_api";
    if (!replay) {
      await concluirIdempotencia(db, ctx.api_key_id, idempotencyKey, status, resultado.body);
    }
    response = jsonResponse(status, resultado.body, requestId);
  } catch (e) {
    const escopo = e instanceof EscopoClinicaError;
    const apiErr =
      e instanceof ApiError
        ? e
        : new ApiError(
            escopo
              ? {
                  status: 404,
                  code: "appointment_not_found",
                  message: "Agendamento não encontrado nesta clínica.",
                }
              : {
                  status: 400,
                  code: "request_failed",
                  message: e instanceof Error ? e.message : "Erro ao processar a requisição.",
                },
          );
    status = apiErr.status;
    erroCodigo = apiErr.code;
    erroResumo = apiErr.message.slice(0, 300);
    if (ctx && request.method === "POST") {
      await concluirIdempotencia(db, ctx.api_key_id, idempotencyKey, status, null);
    }
    response = erroResponse(apiErr, requestId);
  }

  await registrarRequisicao(db, {
    api_key_id: ctx?.api_key_id ?? null,
    clinica_id: ctx?.clinica_id ?? null,
    request_id: requestId,
    metodo: request.method,
    rota,
    status_http: status,
    erro_codigo: erroCodigo,
    erro_resumo: erroResumo,
    duracao_ms: Date.now() - inicio,
    id_externo: idExterno,
    ip,
  });

  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}
