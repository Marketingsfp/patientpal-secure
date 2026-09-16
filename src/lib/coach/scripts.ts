import type { ScriptItem } from "@/lib/coach/config-clinica";

/**
 * Formata os scripts da clínica para enviar à IA nos treinos e na prova.
 * Os scripts ficam salvos por clínica (`coach_config_clinica`), não mais
 * no navegador de cada pessoa.
 */
export function formatScripts(items: ScriptItem[]): string {
  return (items ?? [])
    .filter((s) => s.conteudo.trim())
    .map((s, i) => `Script ${i + 1} — ${s.titulo || "Sem título"}:\n${s.conteudo.trim()}`)
    .join("\n\n");
}
