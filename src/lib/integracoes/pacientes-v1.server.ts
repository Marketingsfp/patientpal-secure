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
  nome: z.string().trim().min(2).max(200),
  data_nascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Data de nascimento inválida."),
  telefone: z.string().trim().min(8).max(30),
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

  const { data, error } = await db.rpc("integracao_resolver_paciente", {
    _clinica_id: ctx.clinica_id,
    _cpf_digits: cpf,
    _nome: entrada.nome,
    _data_nascimento: entrada.data_nascimento,
    _telefone: entrada.telefone,
    _email: entrada.email ?? null,
    _sexo: entrada.sexo ?? "nao_informar",
  } as never);
  if (error) {
    throw new ApiError({
      status: 500,
      code: "patient_resolution_failed",
      message: "Não foi possível concluir o agendamento agora.",
    });
  }

  const r = (data ?? {}) as { paciente_id?: string; criado?: boolean; mismatch?: boolean };
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
  const novoTel = somenteDigitos(entrada.telefone);
  const telAtual = somenteDigitos(pac.telefone ?? "");
  const telefone_divergente =
    !r.criado && novoTel && telAtual && novoTel !== telAtual ? entrada.telefone.trim() : null;

  return {
    paciente_id: pac.id,
    nome: pac.nome,
    criado: Boolean(r.criado),
    telefone_divergente,
  };
}
