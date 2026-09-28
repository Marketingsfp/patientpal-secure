// Resolução de paciente da API de integração v1.1.
//
// Por que isso mora DENTRO do POST /appointments e não em um GET /patients:
// um endpoint público que responde "esse CPF existe?" é um oráculo de
// enumeração sobre a base real de pacientes. Aqui o CPF só é usado para
// resolver o agendamento em curso, e nenhuma resposta da API revela se o
// cadastro já existia — isso fica apenas no log interno.

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isCPFValido, somenteDigitos } from "@/lib/cpf";
import { ApiError, consumirRateLimitPacientes, type ApiKeyContexto } from "./api.server";

export const pacienteSchema = z.object({
  cpf: z.string().min(11).max(20),
  // v1.4: nome e telefone só são obrigatórios para CRIAR cadastro. Sem eles,
  // a API só reaproveita cadastro existente (CPF + nascimento).
  nome: z.string().trim().min(2).max(200).nullish(),
  data_nascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Data de nascimento inválida."),
  telefone: z.string().trim().min(8).max(30).nullish(),
  email: z.string().email().max(200).nullish(),
  sexo: z.enum(["masculino", "feminino", "outro", "nao_informar"]).nullish(),
});

export type PacienteEntrada = z.infer<typeof pacienteSchema>;

export type PacienteResolvido = {
  paciente_id: string;
  nome: string;
  /** Só para log interno — NUNCA vai para a resposta HTTP. */
  criado: boolean;
  /** Telefone informado difere do cadastro; vira observação do agendamento. */
  telefone_divergente: string | null;
};

/**
 * Encontra (ou cadastra) o paciente na clínica da chave.
 *
 * A trava contra corrida e o INSERT ficam na função de banco
 * `integracao_resolver_paciente`, que roda tudo sob
 * `pg_advisory_xact_lock(hashtext(clinica_id || cpf))` numa única transação.
 */
export async function resolverPaciente(
  db: SupabaseClient<Database>,
  ctx: ApiKeyContexto,
  entrada: PacienteEntrada,
): Promise<PacienteResolvido> {
  const cpf = somenteDigitos(entrada.cpf);
  if (!isCPFValido(cpf)) {
    throw new ApiError({
      status: 422,
      code: "invalid_cpf",
      message: "CPF inválido.",
    });
  }

  await consumirRateLimitPacientes(db, ctx);

  const somenteExistente = !entrada.nome || !entrada.telefone;
  const { data, error } = await db.rpc("integracao_resolver_paciente", {
    _clinica_id: ctx.clinica_id,
    _cpf_digits: cpf,
    _nome: entrada.nome ?? null,
    _data_nascimento: entrada.data_nascimento,
    _telefone: entrada.telefone ?? null,
    _email: entrada.email ?? null,
    _sexo: entrada.sexo ?? "nao_informar",
    _somente_existente: somenteExistente,
  } as never);
  if (error) {
    throw new ApiError({
      status: 500,
      code: "patient_resolution_failed",
      message: "Não foi possível concluir o agendamento agora.",
    });
  }

  const r = (data ?? {}) as {
    paciente_id?: string;
    criado?: boolean;
    mismatch?: boolean;
    nao_encontrado?: boolean;
  };
  if (r.nao_encontrado) {
    throw new ApiError({
      status: 422,
      code: "patient_details_required",
      message:
        "Para criar o cadastro do paciente, informe também 'nome' e 'telefone' no objeto 'paciente'.",
    });
  }
  if (r.mismatch || !r.paciente_id) {
    // Mensagem deliberadamente genérica: não confirma nem nega que o CPF
    // exista na base.
    throw new ApiError({
      status: 422,
      code: "patient_data_mismatch",
      message:
        "Os dados informados não conferem. Confira CPF, nome e data de nascimento, ou procure a recepção da clínica.",
    });
  }

  const { data: pac } = await db
    .from("pacientes")
    .select("id,nome,telefone,clinica_id")
    .eq("id", r.paciente_id)
    .eq("clinica_id", ctx.clinica_id)
    .maybeSingle();
  if (!pac) {
    throw new ApiError({
      status: 422,
      code: "patient_data_mismatch",
      message: "Os dados informados não conferem.",
    });
  }

  // Cadastro existente é a fonte de verdade (a recepção manda). Telefone
  // diferente vira observação do agendamento, nunca UPDATE no cadastro.
  const novoTel = somenteDigitos(entrada.telefone ?? "");
  const telAtual = somenteDigitos(pac.telefone ?? "");
  const telefone_divergente =
    !r.criado && novoTel && telAtual && novoTel !== telAtual ? (entrada.telefone ?? "").trim() : null;

  return {
    paciente_id: pac.id,
    nome: pac.nome,
    criado: Boolean(r.criado),
    telefone_divergente,
  };
}

// ------------------------------------------------------------ v1.4 lookup
//
// MUDANÇA DE POLÍTICA CONSCIENTE (v1.4): a v1.1 recusava qualquer busca de
// paciente para não virar oráculo de enumeração de CPF. O cliente decidiu
// assumir esse risco com mitigações: exige DOIS dados que precisam bater
// (CPF + nascimento), devolve só dado mascarado, "não bateu" e "não existe"
// são indistinguíveis (corpo e tempo), escopo próprio e limite apertado.

export const lookupSchema = z.object({
  cpf: z.string().min(11).max(20),
  data_nascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Data de nascimento inválida."),
});

export type LookupResposta = {
  encontrado: boolean;
  nome_exibicao: string | null;
  telefone_mascarado: string | null;
};

const PARTICULAS = new Set(["DA", "DE", "DO", "DAS", "DOS", "E", "D"]);

/** "MARIA DA SILVA SANTOS" → "MARIA S." (primeiro nome + inicial do 1º sobrenome). */
export function nomeExibicao(nome: string): string {
  const partes = nome.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const primeiro = partes[0] ?? "";
  const sobrenome = partes.slice(1).find((p) => !PARTICULAS.has(p.replace(/['.]/g, "")));
  return sobrenome ? `${primeiro} ${sobrenome[0]}.` : primeiro;
}

/** "21999998970" → "(21) ****-8970". Sem DDD reconhecível → "****-8970". */
export function telefoneMascarado(tel: string): string {
  let d = somenteDigitos(tel);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  const ultimos = d.slice(-4);
  return d.length >= 10 ? `(${d.slice(0, 2)}) ****-${ultimos}` : `****-${ultimos}`;
}

export async function consultarPaciente(
  db: SupabaseClient<Database>,
  ctx: ApiKeyContexto,
  entrada: z.infer<typeof lookupSchema>,
): Promise<LookupResposta> {
  const cpf = somenteDigitos(entrada.cpf);
  if (!isCPFValido(cpf)) {
    throw new ApiError({ status: 422, code: "invalid_cpf", message: "CPF inválido." });
  }
  // A mesma consulta roda nos dois casos; a máscara também é sempre calculada
  // (sobre um valor neutro quando não achou), para o tempo não denunciar nada.
  const { data, error } = await db.rpc("integracao_lookup_paciente", {
    _clinica_id: ctx.clinica_id,
    _cpf_digits: cpf,
    _data_nascimento: entrada.data_nascimento,
  } as never);
  if (error) {
    throw new ApiError({
      status: 500,
      code: "patient_lookup_failed",
      message: "Não foi possível consultar agora.",
    });
  }
  const r = (data ?? {}) as { encontrado?: boolean; nome?: string | null; telefone?: string | null };
  const achou = r.encontrado === true && Boolean(r.nome);
  const nome = nomeExibicao(achou ? (r.nome as string) : "PACIENTE NAO ENCONTRADO");
  const tel = r.telefone ? telefoneMascarado(achou ? r.telefone : "00000000000") : null;
  return achou
    ? { encontrado: true, nome_exibicao: nome, telefone_mascarado: tel }
    : { encontrado: false, nome_exibicao: null, telefone_mascarado: null };
}
