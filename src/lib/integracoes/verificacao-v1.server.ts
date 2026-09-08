// Verificação de paciente pelo WhatsApp (API de integração v1.2).
//
// Fluxo: o site pede um desafio (`/patients/verify/start`), mostra um código
// curto ao visitante, ele manda esse código pelo WhatsApp dele mesmo, o webhook
// reconhece o código, casa o número com a base pelos ÚLTIMOS 8 DÍGITOS
// (via `integracao_verificacao_pacientes_por_telefone`, que já cobre os dois
// telefones do cadastro) e libera um token de uso único para o site anexar ao
// POST /appointments.
//
// Regras de privacidade que valem para TODO este arquivo:
//   • nenhuma resposta diferencia "existe cadastro" de "não existe":
//     `nao_localizado` e `expirado` são indistinguíveis de fora;
//   • `paciente_id` nunca sai na resposta da API — a escolha entre homônimos
//     usa `opcao_id` opaco, válido só para aquele desafio;
//   • nome exibido é só primeiro nome + inicial do sobrenome ("Maria S.").

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  ApiError,
  comparaSeguro,
  consumirRateLimitCustom,
  exigirEscopo,
  sha256Hex,
  type ApiKeyContexto,
} from "./api.server";

/** Sem O, 0, I, 1 e L: código é lido em voz alta e digitado no celular. */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PREFIXO = "MJ";
const MINUTOS_DESAFIO = 15;
const MINUTOS_TOKEN = 20;

type Db = SupabaseClient<Database>;
type Tabela = Record<string, unknown>;

// A tabela é nova e ainda não está nos tipos gerados: acesso destipado,
// contido nesta única função.
function tabela(db: Db) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db as unknown as SupabaseClient<any>).from("integracao_verificacoes");
}


function aleatorio(tamanho: number): Uint8Array {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function gerarCodigoVerificacao(): string {
  const bytes = aleatorio(4);
  let sufixo = "";
  for (const b of bytes) sufixo += ALFABETO[b % ALFABETO.length];
  return `${PREFIXO}-${sufixo}`;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizarCodigo(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Últimos 8 dígitos do número — regra do banco (35,5% da base não tem DDD). */
export function ultimos8Digitos(telefone: string): string {
  const digitos = String(telefone ?? "").replace(/\D/g, "");
  return digitos.slice(-8);
}

export function nomeExibicao(nome: string): string {
  const partes = String(nome ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "Paciente";
  const primeiro = partes[0]!;
  const ultimo = partes.length > 1 ? partes[partes.length - 1]! : "";
  const inicial = ultimo ? ` ${ultimo[0]!.toUpperCase()}.` : "";
  return `${primeiro.charAt(0).toUpperCase()}${primeiro.slice(1).toLowerCase()}${inicial}`;
}

/** Limpeza dos desafios vencidos, oportunista (não pode derrubar a resposta). */
async function limparOportunista(db: Db): Promise<void> {
  try {
    await db.rpc("integracao_verificacoes_limpar" as never, {} as never);
  } catch {
    /* limpeza é best-effort */
  }
}

// ------------------------------------------------------------------- start

async function handleStart(
  db: Db,
  ctx: ApiKeyContexto,
  ip: string | null,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "patients:verify");
  await consumirRateLimitCustom(db, ctx, "verify_start", 60, 5000);
  await limparOportunista(db);

  const { data: cfg } = await db
    .from("whatsapp_configs")
    .select("display_phone_number")
    .eq("clinica_id", ctx.clinica_id)
    .maybeSingle();
  const numero = String((cfg as { display_phone_number?: string } | null)?.display_phone_number ?? "").trim();
  if (!numero) {
    throw new ApiError({
      status: 503,
      code: "verification_unavailable",
      message: "Verificação por WhatsApp indisponível para esta clínica.",
    });
  }

  const expiraEm = new Date(Date.now() + MINUTOS_DESAFIO * 60_000).toISOString();

  // Colisão do índice único parcial (mesmo código ainda `aguardando` na
  // clínica) é esperada e resolvida com re-sorteio — nunca vira 500.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigoVerificacao();
    const { data, error } = await tabela(db)
      .insert({
        clinica_id: ctx.clinica_id,
        api_key_id: ctx.api_key_id,
        codigo,
        codigo_normalizado: normalizarCodigo(codigo),
        status: "aguardando",
        expira_em: expiraEm,
        ip,
      } as never)
      .select("id")
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === "23505") continue;
      throw new ApiError({
        status: 500,
        code: "verification_start_failed",
        message: "Não foi possível iniciar a verificação.",
      });
    }

    const texto = `Quero agendar pelo site - codigo ${codigo}`;
    const digitos = numero.replace(/\D/g, "");
    return {
      status: 202,
      body: {
        data: {
          desafio_id: (data as { id: string } | null)?.id ?? null,
          codigo,
          whatsapp_numero: numero,
          texto_sugerido: texto,
          wa_url: `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`,
          expira_em: expiraEm,
        },
      },
    };
  }

  throw new ApiError({
    status: 503,
    code: "verification_start_failed",
    message: "Não foi possível gerar um código agora. Tente novamente.",
  });
}

// ------------------------------------------------------------------ status

function respostaExpirada() {
  return { status: 200, body: { data: { status: "expirado" } } };
}

async function handleStatus(
  db: Db,
  ctx: ApiKeyContexto,
  url: URL,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "patients:verify");
  // O site consulta a cada 3s por até 5 min: limite próprio e generoso.
  await consumirRateLimitCustom(db, ctx, "verify_status", 600, 100000);

  const q = z
    .object({ desafio_id: z.string().uuid() })
    .safeParse(Object.fromEntries(url.searchParams));
  // Desafio inexistente responde igual a expirado (não revela nada).
  if (!q.success) return respostaExpirada();

  const { data } = await tabela(db)
    .select("id,status,paciente_id,token_hash,token_expira_em,consumido_em,expira_em,opcoes")
    .eq("id", q.data.desafio_id)
    .eq("clinica_id", ctx.clinica_id)
    .maybeSingle();
  const reg = data as Tabela | null;
  if (!reg) return respostaExpirada();

  const status = String(reg["status"] ?? "");
  const expiraEm = String(reg["expira_em"] ?? "");
  const vencido = expiraEm ? new Date(expiraEm).getTime() <= Date.now() : false;

  if (status === "aguardando") {
    if (vencido) return respostaExpirada();
    return { status: 200, body: { data: { status: "aguardando", expira_em: expiraEm } } };
  }

  if (status === "escolher_paciente") {
    if (vencido) return respostaExpirada();
    const opcoes = Array.isArray(reg["opcoes"]) ? (reg["opcoes"] as Tabela[]) : [];
    return {
      status: 200,
      body: {
        data: {
          status: "escolher_paciente",
          expira_em: expiraEm,
          // `paciente_id` fica guardado na coluna e NUNCA sai daqui.
          opcoes: opcoes.map((o) => ({
            opcao_id: o["opcao_id"],
            nome_exibicao: o["nome_exibicao"],
          })),
        },
      },
    };
  }

  if (status === "verificado") {
    const tokenPlano = tokensEmMemoria.get(String(reg["id"]));
    const tokenExpira = String(reg["token_expira_em"] ?? "");
    const tokenVencido = tokenExpira ? new Date(tokenExpira).getTime() <= Date.now() : true;
    if (reg["consumido_em"] || tokenVencido) return respostaExpirada();
    if (!tokenPlano) {
      // Token só é entregue uma vez, no primeiro status após a verificação.
      return { status: 200, body: { data: { status: "verificado" } } };
    }
    tokensEmMemoria.delete(String(reg["id"]));
    return {
      status: 200,
      body: {
        data: {
          status: "verificado",
          verificacao_token: tokenPlano,
          expira_em: tokenExpira,
        },
      },
    };
  }

  // `nao_localizado` e `expirado` são indistinguíveis de fora.
  return respostaExpirada();
}

/**
 * O token em claro só existe entre a verificação (webhook) e a primeira
 * consulta de status; o banco guarda apenas o hash. Guardar aqui evita
 * persistir segredo reversível.
 */
const tokensEmMemoria = new Map<string, string>();

export function guardarTokenPlano(desafioId: string, token: string): void {
  tokensEmMemoria.set(desafioId, token);
  // Rede de segurança: nunca fica em memória além da validade do token.
  setTimeout(() => tokensEmMemoria.delete(desafioId), MINUTOS_TOKEN * 60_000).unref?.();
}

// ------------------------------------------------------------------ select

async function handleSelect(
  db: Db,
  ctx: ApiKeyContexto,
  bodyTexto: string,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "patients:verify");
  await consumirRateLimitCustom(db, ctx, "verify_select", 120, 10000);

  let bruto: unknown;
  try {
    bruto = JSON.parse(bodyTexto || "{}");
  } catch {
    throw new ApiError({ status: 400, code: "invalid_json", message: "Corpo JSON inválido." });
  }
  const parsed = z
    .object({ desafio_id: z.string().uuid(), opcao_id: z.string().min(4).max(80) })
    .safeParse(bruto);
  if (!parsed.success) {
    throw new ApiError({ status: 422, code: "invalid_body", message: "Corpo inválido." });
  }

  const falhou = new ApiError({
    status: 422,
    code: "verification_failed",
    message: "Não foi possível concluir a verificação.",
  });

  const { data } = await tabela(db)
    .select("id,status,opcoes,expira_em")
    .eq("id", parsed.data.desafio_id)
    .eq("clinica_id", ctx.clinica_id)
    .maybeSingle();
  const reg = data as Tabela | null;
  if (!reg || reg["status"] !== "escolher_paciente") throw falhou;
  if (new Date(String(reg["expira_em"])).getTime() <= Date.now()) throw falhou;

  const opcoes = Array.isArray(reg["opcoes"]) ? (reg["opcoes"] as Tabela[]) : [];
  const escolhida = opcoes.find((o) =>
    comparaSeguro(String(o["opcao_id"] ?? ""), parsed.data.opcao_id),
  );
  if (!escolhida) throw falhou;

  const { token, hash, expira } = await novoToken();
  const { error } = await tabela(db)
    .update({
      status: "verificado",
      paciente_id: String(escolhida["paciente_id"]),
      token_hash: hash,
      token_expira_em: expira,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", parsed.data.desafio_id)
    .eq("status", "escolher_paciente");
  if (error) throw falhou;

  guardarTokenPlano(parsed.data.desafio_id, token);
  return { status: 200, body: { data: { status: "verificado" } } };
}

export async function novoToken(): Promise<{ token: string; hash: string; expira: string }> {
  const token = hex(aleatorio(32));
  return {
    token,
    hash: await sha256Hex(token),
    expira: new Date(Date.now() + MINUTOS_TOKEN * 60_000).toISOString(),
  };
}

// --------------------------------------------------- consumo pelo /appointments

/** Uso único: marca `consumido_em` e devolve o paciente. Nunca vaza o motivo. */
export async function consumirTokenVerificacao(
  db: Db,
  clinicaId: string,
  token: string,
): Promise<string> {
  const falhou = new ApiError({
    status: 422,
    code: "verification_failed",
    message: "Verificação inválida ou expirada. Refaça a confirmação pelo WhatsApp.",
  });
  const hash = await sha256Hex(token);
  const agora = new Date().toISOString();

  const { data } = await tabela(db)
    .update({ consumido_em: agora, updated_at: agora } as never)
    .eq("clinica_id", clinicaId)
    .eq("token_hash", hash)
    .eq("status", "verificado")
    .is("consumido_em", null)
    .gt("token_expira_em", agora)
    .select("paciente_id")
    .maybeSingle();
  const pacienteId = (data as { paciente_id?: string | null } | null)?.paciente_id ?? null;
  if (!pacienteId) throw falhou;
  return pacienteId;
}

// ---------------------------------------------- reconhecimento no webhook

export type ResultadoReconhecimento = { tratada: boolean; resposta?: string };

/**
 * Chamado pelo webhook ANTES de reabrir conversa e antes da Nina. Devolve
 * `tratada: true` quando a mensagem era só o código do desafio — nesse caso o
 * webhook responde uma linha curta e encerra, sem criar conversa nem tarefa.
 */
export async function reconhecerCodigoVerificacao(params: {
  db: Db;
  clinicaId: string;
  texto: string;
  fromNumber: string;
  waMessageId: string;
}): Promise<ResultadoReconhecimento> {
  const { db, clinicaId, texto, fromNumber, waMessageId } = params;
  const normalizado = normalizarCodigo(texto ?? "");
  const candidatos = [...new Set(normalizado.match(/MJ[A-Z0-9]{4}/g) ?? [])];
  if (candidatos.length === 0) return { tratada: false };

  const agora = new Date().toISOString();
  const { data } = await tabela(db)
    .select("id,codigo_normalizado")
    .eq("clinica_id", clinicaId)
    .eq("status", "aguardando")
    .gt("expira_em", agora)
    .in("codigo_normalizado", candidatos)
    .limit(1)
    .maybeSingle();
  const desafio = data as { id: string; codigo_normalizado: string } | null;
  if (!desafio) return { tratada: false };

  const ultimos8 = ultimos8Digitos(fromNumber);
  let pacientes: Array<{ id: string; nome: string }> = [];
  if (ultimos8.length === 8) {
    const { data: achados } = await db.rpc(
      "integracao_verificacao_pacientes_por_telefone" as never,
      { _clinica_id: clinicaId, _ultimos8: ultimos8, _limite: 7 } as never,
    );
    pacientes = (achados ?? []) as Array<{ id: string; nome: string }>;
  }

  const base = { wa_message_id: waMessageId, updated_at: agora };

  if (pacientes.length === 1) {
    const { token, hash, expira } = await novoToken();
    const { error } = await tabela(db)
      .update({
        ...base,
        status: "verificado",
        paciente_id: pacientes[0]!.id,
        token_hash: hash,
        token_expira_em: expira,
      } as never)
      .eq("id", desafio.id)
      .eq("status", "aguardando");
    if (!error) guardarTokenPlano(desafio.id, token);
  } else if (pacientes.length >= 2 && pacientes.length <= 6) {
    const opcoes = pacientes.map((p) => ({
      opcao_id: hex(aleatorio(12)),
      paciente_id: p.id,
      nome_exibicao: nomeExibicao(p.nome),
    }));
    await tabela(db)
      .update({ ...base, status: "escolher_paciente", opcoes } as never)
      .eq("id", desafio.id)
      .eq("status", "aguardando");
  } else {
    // 0 ou 7+: indistinguível de expirado para quem está de fora.
    await tabela(db)
      .update({ ...base, status: "nao_localizado" } as never)
      .eq("id", desafio.id)
      .eq("status", "aguardando");
  }

  return {
    tratada: true,
    resposta: "Recebemos! Volte para a página do site para concluir seu agendamento.",
  };
}

// ----------------------------------------------------------------- roteador

export async function rotearVerificacaoV1(
  db: Db,
  ctx: ApiKeyContexto,
  metodo: string,
  partes: string[],
  url: URL,
  bodyTexto: string,
  ip: string | null,
): Promise<{ status: number; body: unknown } | null> {
  if (partes[0] !== "patients" || partes[1] !== "verify" || partes.length !== 3) return null;
  const acao = partes[2];
  if (metodo === "POST" && acao === "start") return handleStart(db, ctx, ip);
  if (metodo === "GET" && acao === "status") return handleStatus(db, ctx, url);
  if (metodo === "POST" && acao === "select") return handleSelect(db, ctx, bodyTexto);
  return null;
}

/** O `status` tem limite próprio; o roteador pula o limite geral nele. */
export function ehConsultaDeStatusVerificacao(metodo: string, partes: string[]): boolean {
  return (
    metodo === "GET" &&
    partes[0] === "patients" &&
    partes[1] === "verify" &&
    partes[2] === "status" &&
    partes.length === 3
  );
}
