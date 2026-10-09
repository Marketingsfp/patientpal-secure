/**
 * FONTE SELECIONADA DA NINA — catálogo estruturado PUBLICADO.
 *
 * Server-only. Todas as ferramentas usam o adaptador da fonte escolhida pela
 * clínica. Rascunho e arquivado não existem aqui; não há fallback entre fontes.
 */
import { catalogoDoTurno } from "./catalogo-turno.server";

/** Mensagem única de "não tenho informação oficial" → encaminhar para humano. */
export const SEM_CATALOGO_INSTRUCAO =
  "Não existe registro PUBLICADO no catálogo oficial para isso. É PROIBIDO responder por conhecimento próprio, por tabela antiga ou por estimativa. Diga ao paciente, de forma natural, que vai encaminhar para a equipe e chame a ferramenta solicitar_atendente_humano.";

/** Especialidades realmente publicadas no catálogo de profissionais. */
export async function especialidadesPublicadas(clinicaId: string): Promise<string[]> {
  const { profissionais: data } = await catalogoDoTurno(clinicaId);
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
