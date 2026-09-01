// Recebimento de solicitações do site institucional público.
//
// Diferente de `/api/public/integrations/v1/*`, aqui NÃO existe chave de API:
// quem chama é o navegador de um visitante anônimo no site da clínica. Por
// isso o endpoint é deliberadamente estreito:
//
//  - clínica fixa no servidor (o caller não escolhe `clinica_id`);
//  - nenhuma leitura da base é devolvida (não é oráculo de CPF/agenda);
//  - limite de envios por IP e por CPF;
//  - a solicitação NÃO ocupa slot de agenda: nasce marcada como
//    `solicitacao_pendente = true`, com `origem_integracao = 'site_publico'`,
//    para a recepção confirmar médico/horário reais.
//
// Exceção consciente ao contrato de `criar-agendamento.core.server.ts`: aquele
// núcleo exige slot DISPONÍVEL e médico com agenda aberta, coisas que uma
// solicitação de site não tem. Por isso a gravação passa pela função de banco
// `criar_solicitacao_site`, que só cria a linha pendente. A confirmação (que
// vira agendamento de verdade) continua sendo feita pela Agenda, no núcleo.

import { z } from "zod";
import { isCPFValido, somenteDigitos } from "@/lib/cpf";

/** POLICLÍNICA MENINO JESUS — clínica em produção do site institucional. */
export const INTAKE_CLINICA_ID = "7570ddde-8c1c-4b55-ba72-cf12b2a6c940";

const MAX_BODY_BYTES = 32 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
} as const;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

const telefone = z.string().trim().min(8).max(30);

const baseSchema = z.object({
  nome: z.string().trim().min(2).max(200),
  telefone,
  email: z.string().trim().email().max(200).nullish(),
  mensagem: z.string().trim().max(2000).nullish(),
  origem_pagina: z.string().trim().max(200).nullish(),
});

const agendamentoSchema = baseSchema.extend({
  type: z.literal("agendamento"),
  cpf: z.string().min(11).max(20),
  data_nascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Data de nascimento inválida."),
  sexo: z.enum(["masculino", "feminino", "outro", "nao_informar"]).nullish(),
  especialidade: z.string().trim().max(150).nullish(),
  procedimento: z.string().trim().max(300).nullish(),
  /** Preferência do paciente. Não reserva horário: a recepção confirma. */
  data_preferida: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.")
    .nullish(),
  hora_preferida: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Use o formato HH:MM.")
    .nullish(),
  periodo_preferido: z.enum(["manha", "tarde", "qualquer"]).nullish(),
});

const contatoSchema = baseSchema.extend({
  type: z.literal("contato"),
  assunto: z.string().trim().max(200).nullish(),
});

export const intakeSchema = z.discriminatedUnion("type", [agendamentoSchema, contatoSchema]);

function ipDoRequest(request: Request): string {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ??
    "desconhecido"
  );
}

async function hash(valor: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
}

/**
 * Horário-alvo da solicitação, em UTC, a partir da preferência do visitante.
 * Sem preferência utilizável, cai para 09:00 do próximo dia — a recepção
 * ajusta na confirmação; o que importa é a linha existir e aparecer na fila.
 */
function janelaPreferida(data?: string | null, hora?: string | null, periodo?: string | null) {
  const hoje = new Date();
  const base = data ?? new Date(hoje.getTime() + 86400000).toISOString().slice(0, 10);
  const hhmm = hora ?? (periodo === "tarde" ? "14:00" : "09:00");
  // America/Sao_Paulo = UTC-3 (sem horário de verão desde 2019).
  const inicio = new Date(`${base}T${hhmm}:00-03:00`);
  if (Number.isNaN(inicio.getTime())) return null;
  return { inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 30 * 60000).toISOString() };
}

export async function handleIntake(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json(405, { error: { code: "method_not_allowed" } });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json(413, { error: { code: "payload_too_large", message: "Envio muito grande." } });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw || "{}");
  } catch {
    return json(400, { error: { code: "invalid_json", message: "Corpo inválido." } });
  }

  const parsed = intakeSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return json(422, {
      error: {
        code: "invalid_payload",
        message: "Confira os dados enviados.",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }
  const body = parsed.data;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin;

  // ---- limite de abuso: por IP (curto e diário) ----
  const ipHash = await hash(ipDoRequest(request));
  const limites: Array<[string, string, number, number]> = [
    [`ip:${ipHash}`, "minuto", 5, 60],
    [`ip:${ipHash}`, "dia", 30, 86400],
  ];
  for (const [chave, janela, limite, segundos] of limites) {
    const { data: ok, error } = await db.rpc("intake_consumir_rate_limit", {
      _chave: chave,
      _janela: janela,
      _limite: limite,
      _segundos: segundos,
    } as never);
    if (error) break; // controle indisponível não pode derrubar o formulário
    if (ok === false) {
      return json(429, {
        error: {
          code: "rate_limited",
          message: "Muitas solicitações. Tente novamente em alguns minutos.",
        },
      });
    }
  }

  const idExterno = `site-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const contatoBase = {
    clinica_id: INTAKE_CLINICA_ID,
    nome: body.nome,
    telefone: body.telefone,
    email: body.email ?? null,
    origem: "site_publico",
    status: "novo",
  };

  // ------------------------------------------------------------- contato
  if (body.type === "contato") {
    const { error } = await db.from("mkt_leads").insert({
      ...contatoBase,
      mensagem: body.mensagem ?? null,
      dados: {
        tipo: "contato",
        assunto: body.assunto ?? null,
        origem_pagina: body.origem_pagina ?? null,
        id_externo: idExterno,
      },
    } as never);
    if (error) {
      return json(500, { error: { code: "intake_failed", message: "Não foi possível registrar." } });
    }
    return json(201, { data: { recebido: true, protocolo: idExterno, tipo: "contato" } });
  }

  // --------------------------------------------------------- agendamento
  const cpf = somenteDigitos(body.cpf);
  if (!isCPFValido(cpf)) {
    return json(422, { error: { code: "invalid_cpf", message: "CPF inválido." } });
  }

  const cpfHash = await hash(`${INTAKE_CLINICA_ID}:${cpf}`);
  const { data: okCpf } = await db.rpc("intake_consumir_rate_limit", {
    _chave: `cpf:${cpfHash}`,
    _janela: "dia",
    _limite: 5,
    _segundos: 86400,
  } as never);
  if (okCpf === false) {
    return json(429, {
      error: {
        code: "rate_limited",
        message: "Já recebemos várias solicitações para este CPF hoje. Fale com a recepção.",
      },
    });
  }

  const { data: resolvido, error: eResolver } = await db.rpc("integracao_resolver_paciente", {
    _clinica_id: INTAKE_CLINICA_ID,
    _cpf_digits: cpf,
    _nome: body.nome,
    _data_nascimento: body.data_nascimento,
    _telefone: body.telefone,
    _email: body.email ?? null,
    _sexo: body.sexo ?? "nao_informar",
  } as never);
  const r = (resolvido ?? {}) as { paciente_id?: string; criado?: boolean; mismatch?: boolean };
  if (eResolver || r.mismatch || !r.paciente_id) {
    return json(422, {
      error: {
        code: "patient_data_mismatch",
        message:
          "Os dados informados não conferem. Confira CPF, nome e data de nascimento, ou fale com a recepção.",
      },
    });
  }

  // Origem visível também no cadastro do paciente, quando nasceu aqui.
  if (r.criado) {
    await db
      .from("pacientes")
      .update({ origem: "site_publico" } as never)
      .eq("id", r.paciente_id)
      .eq("clinica_id", INTAKE_CLINICA_ID);
  }

  const janela = janelaPreferida(body.data_preferida, body.hora_preferida, body.periodo_preferido);
  if (!janela) {
    return json(422, { error: { code: "invalid_datetime", message: "Data/hora inválida." } });
  }

  const linhas = [
    "SOLICITAÇÃO VINDA DO SITE (pendente de confirmação).",
    `Paciente ${r.criado ? "CADASTRADO AGORA pelo site" : "já existente no cadastro"}.`,
    `Contato informado no site: ${body.telefone}${body.email ? ` / ${body.email}` : ""}`,
    body.especialidade ? `Especialidade pedida: ${body.especialidade}` : null,
    body.data_preferida || body.hora_preferida || body.periodo_preferido
      ? `Preferência: ${body.data_preferida ?? "sem data"} ${body.hora_preferida ?? body.periodo_preferido ?? ""}`.trim()
      : "Sem preferência de horário informada.",
    body.mensagem ? `Mensagem: ${body.mensagem}` : null,
    `Protocolo: ${idExterno}`,
  ].filter(Boolean);

  const { data: agId, error: eAg } = await db.rpc("criar_solicitacao_site", {
    _clinica_id: INTAKE_CLINICA_ID,
    _paciente_id: r.paciente_id,
    _paciente_nome: body.nome,
    _inicio: janela.inicio,
    _fim: janela.fim,
    _procedimento: body.procedimento ?? body.especialidade ?? "Consulta (solicitação do site)",
    _especialidade_id: null,
    _medico_id: null,
    _observacoes: linhas.join("\n"),
    _id_externo: idExterno,
  } as never);
  if (eAg || !agId) {
    return json(500, {
      error: { code: "intake_failed", message: "Não foi possível registrar a solicitação." },
    });
  }

  // Espelho no funil de marketing, para quem acompanha origem de leads.
  await db.from("mkt_leads").insert({
    ...contatoBase,
    paciente_id: r.paciente_id,
    mensagem: body.mensagem ?? null,
    dados: {
      tipo: "agendamento",
      agendamento_id: agId,
      paciente_criado_agora: Boolean(r.criado),
      especialidade: body.especialidade ?? null,
      origem_pagina: body.origem_pagina ?? null,
      id_externo: idExterno,
    },
  } as never);

  return json(201, {
    data: { recebido: true, protocolo: idExterno, tipo: "agendamento", status: "pendente" },
  });
}
