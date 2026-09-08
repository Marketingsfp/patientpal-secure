// Reconhecimento do paciente pelo WhatsApp — API de integração v1.2.
//
// Desenho invertido de propósito: NÃO existe nenhuma rota pública que responda
// "esse CPF/telefone tem cadastro?". Quem prova a posse do número é o próprio
// paciente, enviando uma mensagem a partir do aparelho dele para o WhatsApp da
// clínica com um código curto que o site acabou de gerar.
//
// Vantagens sobre um código enviado pela clínica:
//   • não precisa de template aprovado na Meta nem de mensagem ativa — a
//     janela de 24h é aberta pelo paciente, sem custo e dentro das regras;
//   • prova de posse mais forte: a mensagem sai do aparelho dele;
//   • o CPF sai completamente do fluxo de identificação.
//
// Este módulo NÃO cadastra, NÃO altera e NÃO apaga nada em `pacientes`.

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ApiError, exigirEscopo, sha256Hex, type ApiKeyContexto } from "./api.server";

/** Validade do desafio (tempo que o paciente tem para mandar a mensagem). */
const DESAFIO_MINUTOS = 15;
/** Validade do token de verificação devolvido ao site. */
const TOKEN_MINUTOS = 20;
/** Desafios por hora, por IP. */
const LIMITE_START_POR_IP_HORA = 20;
/** Consultas de status por desafio (o site faz polling de 3 em 3 segundos). */
const LIMITE_STATUS_POR_DESAFIO = 120;

const PREFIXO = "MJ";
/** Sem caracteres ambíguos: nada de O, 0, I, 1, L. */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// ------------------------------------------------------------------- código

export function gerarCodigoBruto(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let saida = "";
  for (const b of bytes) saida += ALFABETO[b % ALFABETO.length];
  return `${PREFIXO}-${saida}`;
}

/** Maiúsculas, só letras e números — o paciente pode digitar do jeito dele. */
export function normalizarCodigo(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Procura, no texto recebido, um código no formato do desafio.
 * Retorna todos os candidatos normalizados encontrados.
 */
export function extrairCandidatosCodigo(texto: string): string[] {
  const normalizado = normalizarCodigo(texto);
  const alvo = new RegExp(`${PREFIXO}[${ALFABETO}]{4}`, "g");
  return [...new Set(normalizado.match(alvo) ?? [])];
}

// ----------------------------------------------------------------- telefone

/**
 * Normalização tolerante do telefone.
 *
 * A Meta entrega o número em E.164 sem "+" (ex.: `5521984642531`). A base tem
 * telefone gravado de tudo quanto é jeito: com e sem DDI, com e sem o nono
 * dígito, com máscara. O casamento é feito pelas DUAS formas possíveis do
 * mesmo número (com e sem o nono dígito), contra as colunas já normalizadas
 * `telefone_norm` / `telefone2_norm` (que guardam só dígitos, sem DDI).
 *
 * Fora do Brasil (DDI diferente de 55) devolve lista vazia: sem regra de nono
 * dígito não dá para casar com segurança, e casar errado é pior que não casar.
 */
export function variantesTelefone(bruto: string): string[] {
  let d = String(bruto ?? "").replace(/\D/g, "");
  if (!d) return [];
  // Tira o DDI 55 só quando sobra um número nacional plausível.
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  // Ainda sobrando dígitos (DDI estrangeiro, prefixo de operadora): não casa.
  if (d.length > 11) return [];
  if (d.length < 10) return [];

  const ddd = d.slice(0, 2);
  const numero = d.slice(2);
  const variantes = new Set<string>();
  if (numero.length === 9) {
    variantes.add(ddd + numero);
    // 9XXXXXXXX -> XXXXXXXX (cadastro antigo, sem o nono dígito)
    if (numero.startsWith("9")) variantes.add(ddd + numero.slice(1));
  } else if (numero.length === 8) {
    variantes.add(ddd + numero);
    variantes.add(`${ddd}9${numero}`);
  } else {
    return [];
  }
  return [...variantes];
}

/**
 * Localiza o paciente ATIVO da clínica pelo número que enviou a mensagem.
 * Só devolve quando existe exatamente um. Zero ou mais de um → null.
 */
export async function localizarPacienteUnicoPorTelefone(
  db: SupabaseClient<Database>,
  clinicaId: string,
  fromNumber: string,
): Promise<string | null> {
  const variantes = variantesTelefone(fromNumber);
  if (variantes.length === 0) return null;
  const lista = variantes.map((v) => `"${v}"`).join(",");

  const { data, error } = await db
    .from("pacientes")
    .select("id")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .or(`telefone_norm.in.(${lista}),telefone2_norm.in.(${lista})`)
    .limit(3);
  if (error) return null;
  const ids = [...new Set((data ?? []).map((p: { id: string }) => p.id))];
  return ids.length === 1 ? ids[0]! : null;
}

// ------------------------------------------------------------- rate limit

function inicioDaHora(): string {
  const a = new Date();
  return new Date(
    Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate(), a.getUTCHours()),
  ).toISOString();
}

async function consumirLimite(
  db: SupabaseClient<Database>,
  apiKeyId: string,
  janela: string,
  janelaInicio: string,
  limite: number,
  mensagem: string,
): Promise<void> {
  const { data, error } = await db.rpc("integracao_rate_limit_consumir", {
    _api_key_id: apiKeyId,
    _janela: janela,
    _janela_inicio: janelaInicio,
    _limite: limite,
  } as never);
  if (error) return; // contador indisponível não derruba a API
  if ((data as { permitido?: boolean } | null)?.permitido === false) {
    throw new ApiError({ status: 429, code: "rate_limit_exceeded", message: mensagem });
  }
}

// ------------------------------------------------------- POST /verify/start

export async function handleVerifyStart(
  db: SupabaseClient<Database>,
  ctx: ApiKeyContexto,
  bodyTexto: string,
  ip: string | null,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "patients:verify");

  // Corpo vazio, `{}` ou `{ "origem": "site" }`. Nada de CPF aqui.
  let bruto: unknown = {};
  if (bodyTexto.trim()) {
    try {
      bruto = JSON.parse(bodyTexto);
    } catch {
      throw new ApiError({ status: 400, code: "invalid_json", message: "Corpo JSON inválido." });
    }
  }
  const parsed = z
    .object({ origem: z.string().max(60).optional() })
    .strict()
    .safeParse(bruto ?? {});
  if (!parsed.success) {
    throw new ApiError({
      status: 422,
      code: "invalid_body",
      message: "Corpo da requisição inválido.",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  if (ip) {
    const hash = (await sha256Hex(ip)).slice(0, 24);
    await consumirLimite(
      db,
      ctx.api_key_id,
      `verify_start_ip:${hash}`,
      inicioDaHora(),
      LIMITE_START_POR_IP_HORA,
      `Limite de ${LIMITE_START_POR_IP_HORA} verificações por hora atingido. Tente novamente mais tarde.`,
    );
  }

  // Faxina barata: desafios vencidos há mais de 24h somem.
  void db.rpc("integracao_verificacoes_limpar" as never, {} as never);

  const { data: cfg } = await db
    .from("whatsapp_configs")
    .select("display_phone_number")
    .eq("clinica_id", ctx.clinica_id)
    .maybeSingle();
  const numero = String(cfg?.display_phone_number ?? "").replace(/\D/g, "");
  if (!numero) {
    throw new ApiError({
      status: 503,
      code: "whatsapp_unavailable",
      message: "A verificação por WhatsApp não está disponível para esta clínica.",
    });
  }

  const expiraEm = new Date(Date.now() + DESAFIO_MINUTOS * 60_000).toISOString();

  // O código precisa ser único entre os desafios AGUARDANDO (índice parcial).
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const codigo = gerarCodigoBruto();
    const codigoNormalizado = normalizarCodigo(codigo);
    const { data, error } = await db
      .from("integracao_verificacoes")
      .insert({
        clinica_id: ctx.clinica_id,
        api_key_id: ctx.api_key_id,
        codigo,
        codigo_normalizado: codigoNormalizado,
        status: "aguardando",
        expira_em: expiraEm,
        ip,
      } as never)
      .select("id")
      .maybeSingle();
    if (error) {
      if ((error as { code?: string }).code === "23505") continue; // código repetido
      throw new ApiError({
        status: 500,
        code: "verification_start_failed",
        message: "Não foi possível iniciar a verificação agora.",
      });
    }
    const texto = `Quero agendar pelo site - codigo ${codigo}`;
    return {
      status: 202,
      body: {
        data: {
          desafio_id: (data as { id: string }).id,
          codigo,
          whatsapp_numero: numero,
          texto_sugerido: texto,
          wa_url: `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`,
          expira_em: expiraEm,
        },
      },
    };
  }

  throw new ApiError({
    status: 503,
    code: "verification_start_failed",
    message: "Não foi possível iniciar a verificação agora. Tente novamente.",
  });
}

// ------------------------------------------------------- GET /verify/status

const CAMPOS_PACIENTE_PUBLICOS = "nome,telefone,email,sexo,data_nascimento";

export async function handleVerifyStatus(
  db: SupabaseClient<Database>,
  ctx: ApiKeyContexto,
  url: URL,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "patients:verify");

  const q = z
    .object({ desafio_id: z.string().uuid() })
    .safeParse(Object.fromEntries(url.searchParams));
  // Identificador inválido recebe a MESMA resposta de expirado: a rota não
  // serve para sondar quais desafios existem.
  const expirado = { status: 200, body: { data: { status: "expirado" } } };
  if (!q.success) return expirado;

  await consumirLimite(
    db,
    ctx.api_key_id,
    `verify_status:${q.data.desafio_id.slice(0, 18)}`,
    new Date(0).toISOString(),
    LIMITE_STATUS_POR_DESAFIO,
    "Limite de consultas desta verificação atingido.",
  );

  const { data: desafio } = await db
    .from("integracao_verificacoes")
    .select("id,status,paciente_id,expira_em,token_hash,token_expira_em,consumido_em")
    .eq("id", q.data.desafio_id)
    .eq("clinica_id", ctx.clinica_id)
    .maybeSingle();
  if (!desafio) return expirado;

  const d = desafio as {
    id: string;
    status: string;
    paciente_id: string | null;
    expira_em: string;
    token_hash: string | null;
    token_expira_em: string | null;
    consumido_em: string | null;
  };

  // Vencimento é avaliado na leitura (não depende de rotina agendada).
  if (d.status === "aguardando" && Date.parse(d.expira_em) <= Date.now()) {
    await db
      .from("integracao_verificacoes")
      .update({ status: "expirado" } as never)
      .eq("id", d.id)
      .eq("status", "aguardando");
    return expirado;
  }

  if (d.status !== "verificado") {
    return { status: 200, body: { data: { status: d.status, expira_em: d.expira_em } } };
  }

  // O token é emitido AQUI, na primeira leitura de status depois do
  // reconhecimento, e o valor puro sai uma única vez nesta resposta. O banco
  // guarda apenas o hash — quem tiver acesso ao banco não consegue usá-lo.
  // (Emitir no webhook exigiria guardar o valor puro em memória, e webhook e
  // polling não rodam necessariamente no mesmo processo.)
  let token: string | null = null;
  if (!d.consumido_em && !d.token_hash) {
    token = gerarTokenPuro();
    const { data: emitido } = await db
      .from("integracao_verificacoes")
      .update({
        token_hash: await sha256Hex(token),
        token_expira_em: new Date(Date.now() + TOKEN_MINUTOS * 60_000).toISOString(),
      } as never)
      .eq("id", d.id)
      .eq("status", "verificado")
      .is("token_hash", null)
      .select("token_expira_em")
      .maybeSingle();
    if (!emitido) token = null;
    else d.token_expira_em = (emitido as { token_expira_em: string }).token_expira_em;
  }

  const { data: pac } = d.paciente_id
    ? await db
        .from("pacientes")
        .select(CAMPOS_PACIENTE_PUBLICOS)
        .eq("id", d.paciente_id)
        .eq("clinica_id", ctx.clinica_id)
        .maybeSingle()
    : { data: null };

  return {
    status: 200,
    body: {
      data: {
        status: "verificado",
        ...(token ? { verificacao_token: token } : {}),
        expira_em: d.token_expira_em ?? d.expira_em,
        // SOMENTE estes campos. Nada de endereço, convênio, prontuário,
        // histórico, agendamentos anteriores ou id interno.
        ...(pac
          ? {
              paciente: {
                nome: (pac as Record<string, unknown>)["nome"] ?? null,
                telefone: (pac as Record<string, unknown>)["telefone"] ?? null,
                email: (pac as Record<string, unknown>)["email"] ?? null,
                sexo: (pac as Record<string, unknown>)["sexo"] ?? null,
                data_nascimento: (pac as Record<string, unknown>)["data_nascimento"] ?? null,
              },
            }
          : {}),
      },
    },
  };
}

function gerarTokenPuro(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


// ------------------------------------------------- consumo do token no POST

/**
 * Valida e CONSUMA o token (uso único), devolvendo o paciente da clínica.
 * Qualquer problema vira o mesmo erro genérico: o site não descobre por quê.
 */
export async function consumirTokenVerificacao(
  db: SupabaseClient<Database>,
  ctx: ApiKeyContexto,
  token: string,
): Promise<{ paciente_id: string; nome: string }> {
  const falhou = new ApiError({
    status: 422,
    code: "verification_failed",
    message: "Verificação inválida ou expirada. Refaça a identificação pelo WhatsApp.",
  });

  const hash = await sha256Hex(token);
  const { data } = await db
    .from("integracao_verificacoes")
    .select("id,paciente_id,token_expira_em,consumido_em,status")
    .eq("clinica_id", ctx.clinica_id)
    .eq("token_hash", hash)
    .maybeSingle();
  const d = data as {
    id: string;
    paciente_id: string | null;
    token_expira_em: string | null;
    consumido_em: string | null;
    status: string;
  } | null;
  if (!d || d.status !== "verificado" || !d.paciente_id) throw falhou;
  if (d.consumido_em) throw falhou;
  if (!d.token_expira_em || Date.parse(d.token_expira_em) <= Date.now()) throw falhou;

  // Uso único de verdade: só vale quem conseguiu marcar `consumido_em`.
  const { data: consumido } = await db
    .from("integracao_verificacoes")
    .update({ consumido_em: new Date().toISOString() } as never)
    .eq("id", d.id)
    .is("consumido_em", null)
    .select("id")
    .maybeSingle();
  if (!consumido) throw falhou;

  const { data: pac } = await db
    .from("pacientes")
    .select("id,nome")
    .eq("id", d.paciente_id)
    .eq("clinica_id", ctx.clinica_id)
    .maybeSingle();
  if (!pac) throw falhou;
  return { paciente_id: (pac as { id: string }).id, nome: (pac as { nome: string }).nome };
}

// ------------------------------------------ reconhecimento na mensagem recebida

export type ResultadoInterceptacao = {
  /** true quando a mensagem era um código de desafio e já foi tratada. */
  tratada: boolean;
  /** Resposta curta a enviar ao paciente (a janela de 24h foi aberta por ele). */
  resposta?: string;
};

export const RESPOSTA_VERIFICACAO =
  "Recebemos! Volte para a página do site para concluir seu agendamento.";

/**
 * Chamado no caminho de ENTRADA do WhatsApp, logo depois de gravar a mensagem.
 *
 * Quando o texto traz um código de desafio válido da clínica, a mensagem é
 * consumida aqui: não vira conversa, não aciona a Nina e não cai na caixa da
 * recepção. Qualquer outra mensagem passa batido (`tratada: false`) e o
 * atendimento segue exatamente como antes.
 */
export async function interceptarCodigoVerificacao(params: {
  db: SupabaseClient<Database>;
  clinicaId: string;
  texto: string;
  fromNumber: string;
  waMessageId: string | null;
  mensagemId: string | null;
}): Promise<ResultadoInterceptacao> {
  const { db, clinicaId, texto, fromNumber } = params;
  if (!texto || !fromNumber) return { tratada: false };

  const candidatos = extrairCandidatosCodigo(texto);
  if (candidatos.length === 0) return { tratada: false };

  const { data } = await db
    .from("integracao_verificacoes")
    .select("id,codigo_normalizado,expira_em")
    .eq("clinica_id", clinicaId)
    .eq("status", "aguardando")
    .in("codigo_normalizado", candidatos)
    .gt("expira_em", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const desafio = (data ?? [])[0] as { id: string } | undefined;
  if (!desafio) return { tratada: false };

  // A mensagem é do fluxo de verificação: marcada como já tratada (lida e sem
  // conversa) para não virar ruído na caixa da recepção, aconteça o que
  // acontecer no reconhecimento abaixo.
  if (params.mensagemId) {
    await db
      .from("whatsapp_mensagens")
      .update({ read_at: new Date().toISOString(), status: "verificacao_site" } as never)
      .eq("id", params.mensagemId);
  }

  const pacienteId = await localizarPacienteUnicoPorTelefone(db, clinicaId, fromNumber);

  if (!pacienteId) {
    // Zero ou mais de um cadastro. O motivo NUNCA é registrado nem devolvido.
    await db
      .from("integracao_verificacoes")
      .update({
        status: "nao_localizado",
        wa_message_id: params.waMessageId,
      } as never)
      .eq("id", desafio.id)
      .eq("status", "aguardando");
    return { tratada: true, resposta: RESPOSTA_VERIFICACAO };
  }

  await db
    .from("integracao_verificacoes")
    .update({
      status: "verificado",
      paciente_id: pacienteId,
      wa_message_id: params.waMessageId,
    } as never)
    .eq("id", desafio.id)
    .eq("status", "aguardando");

  return { tratada: true, resposta: RESPOSTA_VERIFICACAO };
}
