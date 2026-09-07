/**
 * FONTE ÚNICA DA NINA — catálogo estruturado PUBLICADO.
 *
 * Server-only. Existe para que nenhuma ferramenta do atendimento volte a ler
 * tabela operacional/legada (procedimentos, medicos, especialidades) como
 * fonte de resposta ao paciente. Rascunho e arquivado não existem aqui.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Mensagem única de "não tenho informação oficial" → encaminhar para humano. */
export const SEM_CATALOGO_INSTRUCAO =
  "Não existe registro PUBLICADO no catálogo oficial para isso. É PROIBIDO responder por conhecimento próprio, por tabela antiga ou por estimativa. Diga ao paciente, de forma natural, que vai encaminhar para a equipe e chame a ferramenta solicitar_atendente_humano.";

/** Especialidades realmente publicadas no catálogo de profissionais. */
export async function especialidadesPublicadas(clinicaId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("nina_cat_profissionais")
    .select("especialidades")
    .eq("clinica_id", clinicaId)
    .eq("status", "PUBLICADO")
    .limit(200);
  if (error) throw new Error(error.message);
  const nomes = new Set<string>();
  for (const linha of (data ?? []) as Array<{ especialidades: unknown }>) {
    const lista = Array.isArray(linha.especialidades)
      ? (linha.especialidades as Array<Record<string, unknown>>)
      : [];
    for (const e of lista) {
      const nome = String(e?.["nome"] ?? "").trim();
      if (nome) nomes.add(nome);
    }
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
