/**
 * Schema de validação e sanitização do cadastro de pacientes.
 *
 * Regras já existentes na tela foram preservadas (nome, CPF, data de
 * nascimento plausível, e-mail). O que foi acrescentado: sanitização de
 * caracteres invisíveis/de controle e limite máximo de tamanho em todos
 * os campos de texto.
 */
import { z } from "zod";
import { LIMITES, limparLinha, limparTexto, somenteDigitos } from "@/lib/seguranca/sanitizar";
import { validarCPF } from "@/lib/validators";

const linha = (max: number) =>
  z
    .string()
    .transform(limparLinha)
    .pipe(z.string().max(max, `Máximo de ${max} caracteres`));

const opcional = (max: number) => linha(max).transform((v) => (v === "" ? null : v));

const cpfOpcional = z
  .string()
  .transform(somenteDigitos)
  .refine((v) => v === "" || validarCPF(v).valido, "CPF inválido")
  .transform((v) => (v === "" ? null : v));

const telefoneOpcional = z
  .string()
  .transform(somenteDigitos)
  .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Telefone inválido")
  .transform((v) => (v === "" ? null : v));

const SEXOS = ["masculino", "feminino", "outro", "nao_informar"] as const;

export const pacienteSchema = z.object({
  nome: linha(LIMITES.nome).pipe(z.string().min(2, "Informe o nome do paciente")),
  cpf: cpfOpcional,
  telefone: z
    .string()
    .transform(somenteDigitos)
    .pipe(z.string().min(10, "Informe um telefone válido").max(13, "Telefone inválido")),
  telefone2: telefoneOpcional,
  email: z
    .string()
    .transform((v) => limparLinha(v).toLowerCase())
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail inválido")
    .refine((v) => v.length <= LIMITES.email, `Máximo de ${LIMITES.email} caracteres`)
    .transform((v) => (v === "" ? null : v)),
  data_nascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de nascimento")
    .refine((v) => {
      const d = new Date(`${v}T00:00:00`);
      if (Number.isNaN(d.getTime())) return false;
      const hoje = new Date();
      if (d > hoje) return false;
      if (d.getFullYear() < 1900) return false;
      return hoje.getFullYear() - d.getFullYear() <= 120;
    }, "Data de nascimento inválida"),
  sexo: z
    .string()
    .transform((v) => (SEXOS.includes(v as (typeof SEXOS)[number]) ? v : "nao_informar")),
  ativo: z.boolean(),
  cep: z
    .string()
    .transform(somenteDigitos)
    .refine((v) => v === "" || v.length === 8, "CEP deve ter 8 dígitos")
    .transform((v) => (v === "" ? null : v)),
  logradouro: opcional(LIMITES.linha),
  numero: opcional(LIMITES.codigo),
  complemento: opcional(LIMITES.linha),
  bairro: opcional(LIMITES.nome),
  cidade: opcional(LIMITES.nome),
  estado: opcional(2),
  responsavel_nome: opcional(LIMITES.nome),
  responsavel_cpf: cpfOpcional,
  responsavel_telefone: telefoneOpcional,
  responsavel_parentesco: opcional(LIMITES.nome),
  numero_pasta: opcional(LIMITES.codigo),
  codigo_prontuario: opcional(LIMITES.codigo),
  observacoes: z
    .string()
    .transform(limparTexto)
    .pipe(z.string().max(LIMITES.observacao, `Máximo de ${LIMITES.observacao} caracteres`))
    .transform((v) => (v === "" ? null : v))
    .optional(),
});

export type PacienteValidado = z.infer<typeof pacienteSchema>;

/** Extrai a primeira mensagem de erro legível de um resultado do Zod. */
export function primeiroErro(err: z.ZodError): string {
  const issue = err.issues[0];
  return issue?.message ?? "Dados inválidos.";
}
