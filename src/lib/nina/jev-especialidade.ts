/**
 * Jev — Fase 3: quando a busca normal do catálogo não encontra nada, o Jev
 * escolhe a especialidade/serviço PUBLICADO que o paciente quis dizer, ou
 * "nenhuma". Puro (sem rede), testável. Só homologação (flag nina_jev_fase3).
 */
import type { PerguntaJev, RespostaJev } from "./jev";

export const CONFIANCA_MINIMA_ESPECIALIDADE = 0.8;
export const NENHUMA = "nenhuma";
const LIMITE_OPCOES = 400;

/** Junta nomes de especialidades e serviços publicados, sem repetir. */
export function opcoesCatalogo(
  servicos: { nome?: unknown }[],
  profissionais: { especialidades?: unknown }[],
): string[] {
  const nomes = new Map<string, string>();
  const add = (n: unknown) => {
    const t = String(n ?? "").trim();
    if (t && !nomes.has(t.toUpperCase())) nomes.set(t.toUpperCase(), t);
  };
  for (const p of profissionais)
    if (Array.isArray(p.especialidades)) for (const e of p.especialidades) add((e as { nome?: unknown })?.nome ?? e);
  for (const s of servicos) add(s.nome);
  return [...nomes.values()].slice(0, LIMITE_OPCOES);
}

export function perguntaEspecialidade(opcoes: string[]): Record<string, PerguntaJev> {
  const criteria: Record<string, unknown> = {};
  for (const o of opcoes) criteria[o] = `O paciente procura "${o}".`;
  criteria[NENHUMA] = "Nenhuma opção da lista corresponde ao que o paciente procura.";
  return {
    especialidade: {
      type: "choice",
      instructions:
        "Qual especialidade, exame ou serviço publicado da clínica corresponde ao que o paciente procura em `pedido` (considere `mensagem_atual`)? Leigos usam nomes populares (ex.: dentista = odontologia, médico do pulmão = pneumologia).",
      criteria,
    },
  };
}

/** Nome escolhido, ou null (nenhuma, confiança baixa, fora da lista). */
export function especialidadeAplicavel(r: RespostaJev | undefined, opcoes: string[]): string | null {
  if (!r?.choice || r.choice === NENHUMA) return null;
  if (typeof r.confidence !== "number" || r.confidence < CONFIANCA_MINIMA_ESPECIALIDADE) return null;
  return opcoes.includes(r.choice) ? r.choice : null;
}
