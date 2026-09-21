import { readFileSync, writeFileSync } from "node:fs";
import { CONTINUIDADE_RESPOSTAS_ANTERIOR, CONTINUIDADE_RESPOSTAS_CONTEXTUAIS } from "../../src/lib/nina/prompt/respostas-contextuais";

export const MIGRATION_RESPOSTAS_CONTEXTUAIS = "supabase/migrations/20260921233000_nina_respostas_contextuais.sql";
export function gerarMigrationRespostasContextuais() {
  const modelo = readFileSync("supabase/migrations/20260921230000_nina_escolha_medico.sql", "utf8");
  const partes = modelo.split("$trocas$");
  partes[1] = JSON.stringify([[CONTINUIDADE_RESPOSTAS_ANTERIOR, CONTINUIDADE_RESPOSTAS_CONTEXTUAIS]]);
  return partes.join("$trocas$")
    .replace("-- Escolha de médico: repetir a lista uma vez sem perder a consulta identificada.", "-- Resposta curta confirma somente a referência da última pergunta entregue.")
    .replace("21/09/2026: corrigir escolha do médico uma vez e encaminhar com motivo específico se persistir.", "21/09/2026: reconhecer confirmações informais pelo contexto sem repetir a identificação do médico.")
    .replace("Instrução mudou; reconciliar a escolha do médico antes de publicar.", "Instrução mudou; reconciliar respostas contextuais antes de publicar.");
}
if (import.meta.main) writeFileSync(MIGRATION_RESPOSTAS_CONTEXTUAIS, gerarMigrationRespostasContextuais(), "utf8");
