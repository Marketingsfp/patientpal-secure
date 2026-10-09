import { z } from "zod";

/** Limite de entrada, em caracteres, compartilhado pelo rascunho e publicação.
 * A referência completa ocupa cerca de 77 mil caracteres. O limite acomoda
 * suas regras e identidade sem truncar conteúdo ou reescrever versões antigas.
 */
export const LIMITE_CARACTERES_INSTRUCOES = 100_000;
export const conteudoInstrucoesSchema = z.string().min(1).max(LIMITE_CARACTERES_INSTRUCOES);
