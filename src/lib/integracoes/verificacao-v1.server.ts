// Verificação do paciente pelo WhatsApp (API de integração v1.2).
//
// Desenho: quem manda a mensagem é o PACIENTE. A clínica não dispara nada —
// não há template aprovado na Meta e fora da janela de 24h a mensagem seria
// recusada. O site pede um desafio, mostra o link do WhatsApp já com o texto
// pronto, o paciente aperta enviar, o webhook reconhece o código e identifica
// quem é pelo número de origem. Isso prova a posse do aparelho melhor que um
// código enviado e tira o CPF do fluxo: nenhuma rota pública responde se um
// CPF tem cadastro.
//
// Casamento do telefone: pela medição real da base (252.722 pacientes ativos)
// 34% dos cadastros NÃO têm DDD gravado (28% com 8 dígitos, 6% com 9). Casar
// por "DDD + número" descartaria um terço da base, então a comparação é pelos
// ÚLTIMOS 8 DÍGITOS, a única parte sempre presente. Como número de família é
// comum (mãe e filhos no mesmo celular), 2 a 6 cadastros viram uma escolha
// feita pela própria pessoa; 7 ou mais é cadastro sujo e não é listado.

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ApiError, exigirEscopo, sha256Hex, type ApiKeyContexto } from "./api.server";

// Sem O, 0, I, 1 e L: caracteres que a pessoa erra ao digitar/ler.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const PREFIXO = "MJ-";
const DESAFIO_MINUTOS = 15;
const TOKEN_MINUTOS = 10;
const LIMITE_IP_HORA = 20;
/** Acima disso o número é cadastro sujo (ex.: telefone da própria clínica). */
export const MAX_OPCOES = 6;

export const RESPOSTA_VERIFICACAO =
  "Recebemos! Volte para a página do site para concluir seu agendamento.";

type Db = SupabaseClient<Database>;

// ------------------------------------------------------------------- código

function sortear(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

export function gerarCodigo(): string {
  return `${PREFIXO}${sortear(4)}`;
}

/** Só letras/dígitos, em maiúsculas — tolera espaço, hífen e pontuação. */
export function normalizarCodigo(valor: string): string {
  return String(valor ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Acha o código dentro de um texto livre enviado pelo paciente. */
export function extrairCodigo(texto: string): string | null {
  const limpo = normalizarCodigo(texto);
  const m = limpo.match(new RegExp(`MJ[${ALFABETO}]{4}`));
  return m ? m[0] : null;
}

// ----------------------------------------------------------------- telefone

/**
 * Últimos 8 dígitos do telefone — a regra de casamento do sistema.
 * Descarta máscara, DDI 55 e nono dígito por consequência: o que sobra é o
 * miolo do número, presente em todos os formatos gravados na base.
 */
export function ultimos8(valor: string | null | undefined): string | null {
  const d = String(valor ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  return d.slice(-8);
}

/** "Maria Silva Santos" -> "Maria S." — o bastante para se reconhecer. */
export function nomeExibicao(nome: string): string {
  const partes = String(nome ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "Paciente";
  const primeiro = partes[0]!;
  const ultimo = partes.length > 1 ? partes[partes.length - 1]! : "";
  return ultimo ? `${primeiro} ${ultimo[0]!.toUpperCase()}.` : primeiro;
}

type Opcao = { opcao_id: string; paciente_id: string; nome_exibicao: string };

function novoId(): string {
  return crypto.randomUUID();
}

function gerarTokenPuro(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ------------------------------------------------------------- POST /start

const startSchema = z
  .object({ origem: z.string().max(60).optional() })
  .partial()
  .optional()
  .default({});

export async function handleVerifyStart(
  db: Db,
  ctx: ApiKeyContexto,
  bodyTexto: string,
  ip: string | null,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "patients:verify");

  let bruto: unknown = {};
  try {
    bruto = JSON.parse(bodyTexto || "{}");
  } catch {
    throw new ApiError({ status: 400, code: "invalid_json", message: "Corpo JSON inválido." });
  }
  if (!startSchema.safeParse(bruto).success) {
    throw new ApiError({ status: 422, code: "invalid_body", message: "Corpo inválido." });
  }

  // Limite por IP, além do limite geral da chave: o desafio é barato de pedir
  // e caro de acumular.
  if (ip) {
    const desde = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count } = await db
      .from("integracao_verificacoes")
      .select("id", { count: "exact", head: true })
      .eq("clinica_id", ctx.clinica_id)
      .eq("ip", ip)
      .gte("created_at", desde);
    if ((count ?? 0) >= LIMITE_IP_HORA) {
      throw new ApiError({
        status: 429,
        code: "rate_limit_exceeded",
        message: "Muitas verificações a partir deste dispositivo. Tente novamente em uma hora.",
      });
    }
  }

  const { data: cfg } = await db
    .from("whatsapp_configs")
    .select("display_phone_number")
    .eq("clinica_id", ctx.clinica_id)
    .maybeSingle();
  const numeroClinica = String(cfg?.display_phone_number ?? "").replace(/\D/g, "");
  if (!numeroClinica) {
    throw new ApiError({
      status: 503,
      code: "whatsapp_unavailable",
      message: "Verificação por WhatsApp indisponível para esta clínica.",
    });
  }

  const expiraEm = new Date(Date.now() + DESAFIO_MINUTOS * 60_000).toISOString();

  // Colisão de código só existe entre desafios AGUARDANDO (índice parcial).
  let criado: { id: string; codigo: string } | null = null;
  for (let i = 0; i < 5 && !criado; i++) {
    const codigo = gerarCodigo();
    const { data, error } = await db
      .from("integracao_verificacoes")
      .insert({
        clinica_id: ctx.clinica_id,
        api_key_id: ctx.api_key_id,
        codigo,
        codigo_normalizado: normalizarCodigo(codigo),
        status: "aguardando",
        expira_em: expiraEm,
        ip,
      } as never)
      .select("id,codigo")
      .maybeSingle();
    if (!error && data) criado = data as { id: string; codigo: string };
  }
  if (!criado) {
    throw new ApiError({
      status: 503,
      code: "verification_unavailable",
      message: "Não foi possível gerar o código agora. Tente novamente.",
    });
  }

  const texto = `Olá! Meu código de verificação é ${criado.codigo}`;
  return {
    status: 202,
    body: {
      data: {
        desafio_id: criado.id,
        codigo: criado.codigo,
        whatsapp_numero: numeroClinica,
        texto_sugerido: texto,
        wa_url: `https://wa.me/${numeroClinica}?text=${encodeURIComponent(texto)}`,
        expira_em: expiraEm,
      },
    },
  };
}

// -------------------------------------------------------------- GET /status

type LinhaDesafio = Database["public"]["Tables"]["integracao_verificacoes"]["Row"];

async function carregarDesafio(db: Db, ctx: ApiKeyContexto, id: string): Promise<LinhaDesafio> {
  const { data } = await db
    .from("integracao_verificacoes")
    .select("*")
    .eq("id", id)
    .eq("clinica_id", ctx.clinica_id)
    .maybeSingle();
  if (!data) {
    throw new ApiError({
      status: 404,
      code: "verification_not_found",
      message: "Desafio de verificação não encontrado.",
    });
  }
  return data as LinhaDesafio;
}

export async function handleVerifyStatus(
  db: Db,
  ctx: ApiKeyContexto,
  url: URL,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "patients:verify");

  const id = url.searchParams.get("desafio_id") ?? "";
  if (!z.string().uuid().safeParse(id).success) {
    throw new ApiError({
      status: 422,
      code: "invalid_query",
      message: "Informe 'desafio_id' válido.",
    });
  }
  const d = await carregarDesafio(db, ctx, id);

  if (d.status === "aguardando" && Date.parse(d.expira_em) < Date.now()) {
    return { status: 200, body: { data: { status: "expirado" } } };
  }

  if (d.status === "aguardando") {
    return { status: 200, body: { data: { status: "aguardando", expira_em: d.expira_em } } };
  }

  if (d.status === "escolher_paciente") {
    const opcoes = ((d.opcoes as Opcao[] | null) ?? []).map((o) => ({
      opcao_id: o.opcao_id,
      nome_exibicao: o.nome_exibicao,
    }));
    return { status: 200, body: { data: { status: "escolher_paciente", opcoes } } };
  }

  if (d.status !== "verificado" || !d.paciente_id) {
    // `nao_localizado` e `expirado` respondem igual: nada sobre o motivo.
    return { status: 200, body: { data: { status: d.status } } };
  }

  // O token é emitido AQUI, na primeira leitura de status depois do
  // reconhecimento, e o valor puro sai uma única vez. O banco guarda só o
  // hash. (Emitir no webhook exigiria manter o valor puro em memória, e
  // webhook e polling não rodam necessariamente no mesmo processo.)
  let token: string | null = null;
  let tokenExpira = d.token_expira_em;
  if (!d.consumido_em && !d.token_hash) {
    const candidato = gerarTokenPuro();
    const expira = new Date(Date.now() + TOKEN_MINUTOS * 60_000).toISOString();
    const { data: emitido } = await db
      .from("integracao_verificacoes")
      .update({ token_hash: await sha256Hex(candidato), token_expira_em: expira } as never)
      .eq("id", d.id)
      .eq("status", "verificado")
      .is("token_hash", null)
      .select("token_expira_em")
      .maybeSingle();
    if (emitido) {
      token = candidato;
      tokenExpira = (emitido as { token_expira_em: string }).token_expira_em;
    }
  }

  const { data: p } = await db
    .from("pacientes")
    .select("id,nome,telefone,email,sexo,data_nascimento")
    .eq("id", d.paciente_id)
    .eq("clinica_id", ctx.clinica_id)
    .maybeSingle();

  return {
    status: 200,
    body: {
      data: {
        status: "verificado",
        ...(token ? { verificacao_token: token, token_expira_em: tokenExpira } : {}),
        paciente: p
          ? {
              nome: p.nome,
              telefone: p.telefone,
              email: p.email,
              sexo: p.sexo,
              data_nascimento: p.data_nascimento,
            }
          : null,
      },
    },
  };
}

// ------------------------------------------------------------- POST /select

const selectSchema = z.object({
  desafio_id: z.string().uuid(),
  opcao_id: z.string().uuid(),
});

export async function handleVerifySelect(
  db: Db,
  ctx: ApiKeyContexto,
  bodyTexto: string,
): Promise<{ status: number; body: unknown }> {
  exigirEscopo(ctx, "patients:verify");

  let bruto: unknown;
  try {
    bruto = JSON.parse(bodyTexto || "{}");
  } catch {
    throw new ApiError({ status: 400, code: "invalid_json", message: "Corpo JSON inválido." });
  }
  const parsed = selectSchema.safeParse(bruto);
  if (!parsed.success) {
    throw new ApiError({
      status: 422,
      code: "invalid_body",
      message: "Informe 'desafio_id' e 'opcao_id'.",
    });
  }

  const d = await carregarDesafio(db, ctx, parsed.data.desafio_id);
  const opcoes = (d.opcoes as Opcao[] | null) ?? [];
  const escolhida =
    d.status === "escolher_paciente"
      ? opcoes.find((o) => o.opcao_id === parsed.data.opcao_id)
      : undefined;

  // Uma escolha por desafio: quem errou recomeça. Assim ninguém "varre" a
  // lista trocando de pessoa até acertar um cadastro que não é seu.
  if (!escolhida) {
    throw new ApiError({
      status: 422,
      code: "verification_failed",
      message: "Não foi possível concluir a verificação.",
    });
  }

  const { data: atualizado } = await db
    .from("integracao_verificacoes")
    .update({ status: "verificado", paciente_id: escolhida.paciente_id, opcoes: null } as never)
    .eq("id", d.id)
    .eq("status", "escolher_paciente")
    .select("id")
    .maybeSingle();
  if (!atualizado) {
    throw new ApiError({
      status: 422,
      code: "verification_failed",
      message: "Não foi possível concluir a verificação.",
    });
  }

  return { status: 200, body: { data: { status: "verificado" } } };
}

// ----------------------------------------------------- token no agendamento

/** Troca o token de uso único pelo paciente verificado. */
export async function consumirTokenVerificacao(
  db: Db,
  ctx: ApiKeyContexto,
  token: string,
): Promise<{ paciente_id: string; nome: string }> {
  const hash = await sha256Hex(String(token ?? ""));
  const { data } = await db
    .from("integracao_verificacoes")
    .select("id,paciente_id,token_expira_em,consumido_em")
    .eq("clinica_id", ctx.clinica_id)
    .eq("status", "verificado")
    .eq("token_hash", hash)
    .maybeSingle();

  const invalido = new ApiError({
    status: 422,
    code: "verification_token_invalid",
    message: "Token de verificação inválido, expirado ou já usado.",
  });
  if (!data || !data.paciente_id || data.consumido_em) throw invalido;
  if (!data.token_expira_em || Date.parse(data.token_expira_em) < Date.now()) throw invalido;

  const { data: usado } = await db
    .from("integracao_verificacoes")
    .update({ consumido_em: new Date().toISOString() } as never)
    .eq("id", data.id)
    .is("consumido_em", null)
    .select("id")
    .maybeSingle();
  if (!usado) throw invalido;

  const { data: p } = await db
    .from("pacientes")
    .select("id,nome")
    .eq("id", data.paciente_id)
    .eq("clinica_id", ctx.clinica_id)
    .maybeSingle();
  if (!p) throw invalido;
  return { paciente_id: p.id, nome: p.nome };
}

// --------------------------------------------------- reconhecimento (webhook)

export type ResultadoIntercepcao = { tratada: boolean; resposta?: string };

/**
 * Chamado pelo webhook logo depois de gravar a mensagem recebida e ANTES de
 * timeout, reabertura, conversa e Nina. Quando a mensagem carrega um código de
 * desafio, ela é do site — não vira atendimento.
 */
export async function interceptarCodigoVerificacao(params: {
  db: Db;
  clinicaId: string;
  texto: string;
  fromNumber: string;
  mensagemId?: string | null;
  waMessageId?: string | null;
}): Promise<ResultadoIntercepcao> {
  const { db, clinicaId } = params;
  const codigo = extrairCodigo(params.texto ?? "");
  if (!codigo) return { tratada: false };

  const { data: desafio } = await db
    .from("integracao_verificacoes")
    .select("id,expira_em")
    .eq("clinica_id", clinicaId)
    .eq("codigo_normalizado", codigo)
    .eq("status", "aguardando")
    .maybeSingle();
  if (!desafio) return { tratada: false };
  if (Date.parse(desafio.expira_em) < Date.now()) {
    await db
      .from("integracao_verificacoes")
      .update({ status: "expirado" } as never)
      .eq("id", desafio.id)
      .eq("status", "aguardando");
    return { tratada: false };
  }

  const alvo = ultimos8(params.fromNumber);
  let opcoes: Opcao[] = [];

  if (alvo) {
    // Número da própria clínica gravado em cadastro é lixo conhecido: nunca
    // identifica ninguém.
    const { data: cfg } = await db
      .from("whatsapp_configs")
      .select("display_phone_number")
      .eq("clinica_id", clinicaId)
      .maybeSingle();
    const daClinica = ultimos8(cfg?.display_phone_number ?? null);

    if (alvo !== daClinica) {
      // Pede 7 para saber se passou do teto sem listar o excedente.
      const { data: achados } = await db.rpc(
        "integracao_verificacao_pacientes_por_telefone" as never,
        { _clinica_id: clinicaId, _ultimos8: alvo, _limite: MAX_OPCOES + 1 } as never,
      );
      const linhas = (achados ?? []) as Array<{ id: string; nome: string }>;
      if (linhas.length <= MAX_OPCOES) {
        opcoes = linhas.map((l) => ({
          opcao_id: novoId(),
          paciente_id: l.id,
          nome_exibicao: nomeExibicao(l.nome),
        }));
      }
      // 7 ou mais: cai como `nao_localizado`, sem expor sete nomes a quem tem
      // aquele aparelho.
    }
  }

  const patch =
    opcoes.length === 1
      ? { status: "verificado", paciente_id: opcoes[0]!.paciente_id }
      : opcoes.length > 1
        ? { status: "escolher_paciente", opcoes }
        : { status: "nao_localizado" };

  await db
    .from("integracao_verificacoes")
    .update({ ...patch, wa_message_id: params.waMessageId ?? null } as never)
    .eq("id", desafio.id)
    .eq("status", "aguardando");

  // A mensagem é do site: marcada como tratada, sem conversa, para não virar
  // ruído na caixa da recepção.
  if (params.mensagemId) {
    await db
      .from("whatsapp_mensagens")
      .update({ read_at: new Date().toISOString(), status: "verificacao_site" } as never)
      .eq("id", params.mensagemId);
  }

  return { tratada: true, resposta: RESPOSTA_VERIFICACAO };
}
