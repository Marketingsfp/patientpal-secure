// Infraestrutura da API pública de integração (/api/integrations/v1).
//
// Genérica e desacoplada: nada aqui conhece parceiro, sistema externo,
// webhook ou sincronização. É só o "porteiro" de uma API REST:
//   • autenticação por chave de API (hash SHA-256 no banco)
//   • escopos por chave
//   • rate limit por minuto e por dia (contador atômico no banco)
//   • idempotência de POST via cabeçalho Idempotency-Key
//   • log técnico de cada requisição
//   • formato único de erro
//
// Toda operação roda com service role (sem RLS), então o escopo de clínica é
// verificado no código — ver `src/lib/agenda/ator.server.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ApiKeyContexto = {
  api_key_id: string;
  clinica_id: string;
  origem_integracao: string;
  escopos: string[];
  limite_por_minuto: number;
  limite_por_dia: number;
};

export type ApiErro = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

export const ESCOPOS_CONHECIDOS = [
  "availability:read",
  "appointments:read",
  "appointments:write",
  // Permite alterar QUALQUER agendamento da clínica, não só os criados pela
  // própria chave. Concedido caso a caso.
  "appointments:write:all",
  // Cartão Benefícios (somente leitura). `contracts:read` é separado de
  // `members:read` de propósito: dá para entregar os números do contrato e a
  // situação financeira SEM entregar CPF, nascimento e telefone de titular e
  // dependentes.
  "contracts:read",
  "members:read",
  "billing:read",
  "plans:read",
] as const;

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(erro: ApiErro) {
    super(erro.message);
    this.name = "ApiError";
    this.status = erro.status;
    this.code = erro.code;
    this.details = erro.details;
  }
}

export function novoRequestId(): string {
  return (
    (globalThis.crypto as { randomUUID?: () => string } | undefined)?.randomUUID?.() ??
    `req_${Date.now()}_${Math.random().toString(16).slice(2)}`
  );
}

export async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparação de hashes em tempo constante (evita timing attack). */
function comparaSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function jsonResponse(status: number, body: unknown, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
}

export function erroResponse(erro: ApiError, requestId: string): Response {
  return jsonResponse(
    erro.status,
    {
      error: {
        code: erro.code,
        message: erro.message,
        ...(erro.details !== undefined ? { details: erro.details } : {}),
        request_id: requestId,
      },
    },
    requestId,
  );
}

/** Lê a chave do cabeçalho Authorization: Bearer <key> ou X-API-Key. */
export function lerApiKeyDoRequest(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth && /^bearer\s+/i.test(auth)) {
    const v = auth.replace(/^bearer\s+/i, "").trim();
    if (v) return v;
  }
  const alt = request.headers.get("x-api-key");
  return alt?.trim() || null;
}

/**
 * Autentica a chave. Formato: hh_<8 hex>_<64 hex>.
 * O banco guarda só o prefixo (para localizar) e o SHA-256 da chave inteira.
 */
export async function autenticarApiKey(
  db: SupabaseClient<Database>,
  chave: string | null,
): Promise<ApiKeyContexto> {
  if (!chave) {
    throw new ApiError({
      status: 401,
      code: "missing_api_key",
      message: "Envie a chave de API em 'Authorization: Bearer <key>' ou no cabeçalho 'X-API-Key'.",
    });
  }
  const partes = chave.split("_");
  if (partes.length !== 3 || partes[0] !== "hh") {
    throw new ApiError({ status: 401, code: "invalid_api_key", message: "Chave de API inválida." });
  }
  const prefixo = `${partes[0]}_${partes[1]}`;

  const { data, error } = await db
    .from("integracao_api_keys")
    .select(
      "id,clinica_id,origem_integracao,key_hash,escopos,ativo,expira_em,limite_por_minuto,limite_por_dia",
    )
    .eq("key_prefix", prefixo)
    .maybeSingle();
  if (error) {
    throw new ApiError({
      status: 500,
      code: "auth_lookup_failed",
      message: "Falha ao validar a chave de API.",
    });
  }
  const invalida = new ApiError({
    status: 401,
    code: "invalid_api_key",
    message: "Chave de API inválida.",
  });
  if (!data) throw invalida;

  const hash = await sha256Hex(chave);
  if (!comparaSeguro(hash, data.key_hash)) throw invalida;
  if (!data.ativo) {
    throw new ApiError({
      status: 401,
      code: "api_key_revoked",
      message: "Chave de API revogada.",
    });
  }
  if (data.expira_em && new Date(data.expira_em).getTime() <= Date.now()) {
    throw new ApiError({ status: 401, code: "api_key_expired", message: "Chave de API expirada." });
  }

  // Uso registrado sem bloquear a resposta (best-effort).
  void db
    .from("integracao_api_keys")
    .update({ ultima_utilizacao_em: new Date().toISOString() } as never)
    .eq("id", data.id);

  return {
    api_key_id: data.id,
    clinica_id: data.clinica_id,
    origem_integracao: data.origem_integracao,
    escopos: (data.escopos ?? []) as string[],
    limite_por_minuto: data.limite_por_minuto,
    limite_por_dia: data.limite_por_dia,
  };
}

export function exigirEscopo(ctx: ApiKeyContexto, escopo: string): void {
  if (!ctx.escopos.includes(escopo)) {
    throw new ApiError({
      status: 403,
      code: "insufficient_scope",
      message: `Esta chave não tem o escopo '${escopo}'.`,
    });
  }
}

/** Rate limit por minuto e por dia. Lança 429 quando estoura. */
export async function consumirRateLimit(
  db: SupabaseClient<Database>,
  ctx: ApiKeyContexto,
): Promise<void> {
  const agora = new Date();
  const minuto = new Date(
    Date.UTC(
      agora.getUTCFullYear(),
      agora.getUTCMonth(),
      agora.getUTCDate(),
      agora.getUTCHours(),
      agora.getUTCMinutes(),
    ),
  ).toISOString();
  const dia = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()),
  ).toISOString();

  const janelas: Array<[string, string, number]> = [
    ["minuto", minuto, ctx.limite_por_minuto],
    ["dia", dia, ctx.limite_por_dia],
  ];
  for (const [janela, inicio, limite] of janelas) {
    const { data, error } = await db.rpc("integracao_rate_limit_consumir", {
      _api_key_id: ctx.api_key_id,
      _janela: janela,
      _janela_inicio: inicio,
      _limite: limite,
    } as never);
    if (error) continue; // contador indisponível não derruba a API
    const r = (data ?? {}) as { permitido?: boolean; contador?: number; limite?: number };
    if (r.permitido === false) {
      throw new ApiError({
        status: 429,
        code: "rate_limit_exceeded",
        message: `Limite de ${limite} requisições por ${janela} atingido para esta chave.`,
      });
    }
  }
}

// ---------------------------------------------------------------- idempotência

export type ReplayIdempotente = { status: number; body: unknown };

/**
 * Registra a tentativa. Retorna a resposta anterior quando a MESMA chave de
 * idempotência já foi concluída com o MESMO corpo.
 */
export async function iniciarIdempotencia(
  db: SupabaseClient<Database>,
  apiKeyId: string,
  idempotencyKey: string | null,
  bodyTexto: string,
): Promise<ReplayIdempotente | null> {
  if (!idempotencyKey) return null;
  const bodyHash = await sha256Hex(bodyTexto);

  const { error } = await db
    .from("integracao_idempotencia")
    .insert({ api_key_id: apiKeyId, idempotency_key: idempotencyKey, body_hash: bodyHash } as never);
  if (!error) return null; // primeira vez

  if ((error as { code?: string }).code !== "23505") {
    throw new ApiError({
      status: 500,
      code: "idempotency_failed",
      message: "Falha ao registrar a chave de idempotência.",
    });
  }

  const { data: existente } = await db
    .from("integracao_idempotencia")
    .select("body_hash,concluido,status_http,response_json")
    .eq("api_key_id", apiKeyId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (!existente) return null;
  if (existente.body_hash !== bodyHash) {
    throw new ApiError({
      status: 409,
      code: "idempotency_key_reuse",
      message: "Esta Idempotency-Key já foi usada com um corpo diferente.",
    });
  }
  if (!existente.concluido) {
    throw new ApiError({
      status: 409,
      code: "request_in_progress",
      message: "Uma requisição com esta Idempotency-Key ainda está em processamento.",
    });
  }
  return { status: existente.status_http ?? 200, body: existente.response_json };
}

export async function concluirIdempotencia(
  db: SupabaseClient<Database>,
  apiKeyId: string,
  idempotencyKey: string | null,
  status: number,
  body: unknown,
): Promise<void> {
  if (!idempotencyKey) return;
  // Só respostas de sucesso viram "resposta memorizada": um erro deve poder
  // ser tentado de novo com a mesma chave.
  if (status >= 400) {
    await db
      .from("integracao_idempotencia")
      .delete()
      .eq("api_key_id", apiKeyId)
      .eq("idempotency_key", idempotencyKey);
    return;
  }
  await db
    .from("integracao_idempotencia")
    .update({
      concluido: true,
      status_http: status,
      response_json: body as never,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("api_key_id", apiKeyId)
    .eq("idempotency_key", idempotencyKey);
}

// ---------------------------------------------------------------------- logs

export async function registrarRequisicao(
  db: SupabaseClient<Database>,
  dados: {
    api_key_id: string | null;
    clinica_id: string | null;
    request_id: string;
    metodo: string;
    rota: string;
    status_http: number;
    erro_codigo?: string | null;
    erro_resumo?: string | null;
    duracao_ms: number;
    id_externo?: string | null;
    ip?: string | null;
  },
): Promise<void> {
  try {
    await db.from("integracao_requisicoes").insert(dados as never);
  } catch {
    // Log não pode derrubar a resposta da API.
  }
}
