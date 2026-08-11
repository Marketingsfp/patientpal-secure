/**
 * Blocos Zod reutilizáveis para validar entrada de formulários e de
 * server functions antes de gravar no banco.
 *
 * Todo campo já vem sanitizado (`limparTexto`/`limparLinha`) e com
 * limite máximo de tamanho aplicado.
 */
import { z } from "zod";
import { LIMITES, limparLinha, limparTexto, somenteDigitos, urlSegura } from "./sanitizar";
import { validarCPF } from "@/lib/validators";

/** Texto de uma linha (nome, título). Sanitizado e limitado. */
export const zLinha = (max: number = LIMITES.nome) =>
  z.string().transform(limparLinha).pipe(z.string().max(max, `Máximo de ${max} caracteres`));

/** Texto de uma linha obrigatório. */
export const zLinhaObrigatoria = (max: number = LIMITES.nome, min = 1) =>
  z
    .string()
    .transform(limparLinha)
    .pipe(z.string().min(min, "Campo obrigatório").max(max, `Máximo de ${max} caracteres`));

/** Texto livre multi-linha (observações, evoluções). */
export const zTexto = (max: number = LIMITES.observacao) =>
  z.string().transform(limparTexto).pipe(z.string().max(max, `Máximo de ${max} caracteres`));

/** Campo opcional: string vazia vira null. */
export const zOpcional = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .union([schema, z.literal(""), z.null(), z.undefined()])
    .transform((v): z.infer<T> | null => (v === "" || v == null ? null : (v as z.infer<T>)));

export const zNome = zLinhaObrigatoria(LIMITES.nome, 2);

export const zEmail = z
  .string()
  .transform((v) => limparLinha(v).toLowerCase())
  .pipe(z.string().email("E-mail inválido").max(LIMITES.email));

export const zTelefone = z
  .string()
  .transform(somenteDigitos)
  .pipe(z.string().min(10, "Telefone incompleto").max(13, "Telefone inválido"));

export const zCpf = z
  .string()
  .transform(somenteDigitos)
  .refine((v) => validarCPF(v).valido, "CPF inválido");

export const zCep = z
  .string()
  .transform(somenteDigitos)
  .pipe(z.string().length(8, "CEP deve ter 8 dígitos"));

export const zUuid = z.string().uuid("Identificador inválido");

/** Valor monetário: aceita number ou string com vírgula. */
export const zDinheiro = (max = 10_000_000) =>
  z
    .union([z.number(), z.string()])
    .transform((v) =>
      typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", ".")),
    )
    .pipe(z.number().finite("Valor inválido").min(0, "Valor não pode ser negativo").max(max));

/** Data no formato ISO (YYYY-MM-DD). */
export const zDataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

/** URL segura (bloqueia javascript:, data:, etc.). */
export const zUrl = z
  .string()
  .transform(urlSegura)
  .pipe(z.string({ invalid_type_error: "Endereço inválido" }).max(LIMITES.linha));

export { LIMITES };