import { readFileSync, writeFileSync } from "node:fs";
import { REGRA_ESCLARECIMENTO_GERAL, REGRA_ESCLARECIMENTO_DUAS } from "../../src/lib/nina/prompt/limite-esclarecimento";

export const MIGRATION_ESCOLHA_MEDICO = "supabase/migrations/20260921230000_nina_escolha_medico.sql";
export function gerarMigrationEscolhaMedico() {
  // Mesmo protocolo de versionamento, preservação histórica e bloqueio de conflito.
  const modelo = readFileSync("supabase/migrations/20260921220000_nina_ordem_dados_confirmacao.sql", "utf8");
  const partes = modelo.split("$trocas$");
  partes[1] = JSON.stringify([[REGRA_ESCLARECIMENTO_GERAL, REGRA_ESCLARECIMENTO_DUAS]]);
  return partes.join("$trocas$")
    .replace("-- Ordem autorizada: escolha da vaga -> dados -> confirmação final -> reserva.", "-- Escolha de médico: repetir a lista uma vez sem perder a consulta identificada.")
    .replace("21/09/2026: coleta dos dados após escolher a vaga e antes da confirmação final.", "21/09/2026: corrigir escolha do médico uma vez e encaminhar com motivo específico se persistir.")
    .replace("Instrução mudou; reconciliar a ordem do agendamento antes de publicar.", "Instrução mudou; reconciliar a escolha do médico antes de publicar.");
}
if (import.meta.main) writeFileSync(MIGRATION_ESCOLHA_MEDICO, gerarMigrationEscolhaMedico(), "utf8");
