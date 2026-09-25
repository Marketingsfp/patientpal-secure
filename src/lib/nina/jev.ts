/**
 * Jev (TypeSafe System One) na Nina — tipos e regras puras (sem rede).
 * Plano aprovado em 25/09/2026: 4 fases, válidas SOMENTE em homologação.
 */
export type FaseJev =
  | "fase1_intencao"
  | "fase2_encaminhamento"
  | "fase3_especialidade"
  | "fase4_cadastro"
  | "fase5_avaliacao";

export const FLAG_JEV: Record<FaseJev, string> = {
  fase1_intencao: "nina_jev_fase1",
  fase2_encaminhamento: "nina_jev_fase2",
  fase3_especialidade: "nina_jev_fase3",
  fase4_cadastro: "nina_jev_fase4",
  fase5_avaliacao: "nina_jev_fase5",
};

export type PerguntaJev =
  | { type: "choice"; instructions: unknown; criteria: Record<string, unknown> }
  | { type: "noul"; instructions: unknown; criteria?: { true: unknown; false: unknown } }
  | { type: "score"; instructions: unknown; criteria: unknown[] };

export type RespostaJev = {
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  noul?: number;
  score?: number;
};

/** "sem decisão": a Nina segue o fluxo atual. Nunca inventa certeza. */
export type ResultadoJev =
  | { ok: true; respostas: Record<string, RespostaJev>; latencyMs: number }
  | { ok: false; motivo: string; status?: number; latencyMs: number };

/** Valida que cada pergunta voltou com o campo do seu tipo. */
export function validarRespostas(
  perguntas: Record<string, PerguntaJev>,
  bruto: unknown,
): Record<string, RespostaJev> | null {
  const answers = (bruto as { answers?: Record<string, RespostaJev> } | null)?.answers;
  if (!answers || typeof answers !== "object") return null;
  for (const [id, p] of Object.entries(perguntas)) {
    const r = answers[id];
    if (!r) return null;
    if (p.type === "choice" && (typeof r.choice !== "string" || !(r.choice in p.criteria))) return null;
    if (p.type === "noul" && typeof r.noul !== "number") return null;
    if (p.type === "score" && typeof r.score !== "number") return null;
  }
  return answers;
}

/** Jev só vale em homologação e com a flag da fase explicitamente ligada. */
export function jevPermitido(teste: boolean, flagAtiva: boolean): boolean {
  return teste === true && flagAtiva === true;
}
