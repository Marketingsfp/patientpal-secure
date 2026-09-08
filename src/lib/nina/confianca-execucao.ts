/**
 * FASE 4 — Observabilidade comum de confiança entre Produção, Homologação e
 * Test Runner.
 *
 * Camada pura (sem banco, sem rede). Recebe os snapshots de confiança que o
 * Confidence Decision Engine já persistiu para uma conversa e devolve um
 * resumo leve, que o Test Runner guarda junto do resultado do cenário.
 *
 * REGRA: nada é recalculado aqui. Se não houve avaliação, o resumo fica vazio
 * e a interface mostra "Não avaliada" — nunca um score inventado.
 */

export type AmbienteQA = "producao" | "homologacao" | "teste_automatizado";

export type SnapshotConfiancaItem = {
  score: number | null;
  nivel: string | null;
  trace_id?: string | null;
  message_id?: string | null;
  policy_version?: string | null;
};

export type ResumoConfiancaExecucao = {
  amostras: number;
  media: number | null;
  min: number | null;
  max: number | null;
  niveis: Record<string, number>;
  nivelMinimo: string | null;
  traceIds: string[];
};

const ORDEM_NIVEL: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function normalizarNivel(n: string | null | undefined): string | null {
  if (!n) return null;
  const v = String(n).trim().toUpperCase();
  return v ? v : null;
}

/** Resumo agregado dos snapshots reais de uma execução/conversa. */
export function resumirConfiancaExecucao(
  snapshots: SnapshotConfiancaItem[],
): ResumoConfiancaExecucao {
  const scores: number[] = [];
  const niveis: Record<string, number> = {};
  const traces = new Set<string>();
  let nivelMinimo: string | null = null;

  for (const s of snapshots ?? []) {
    if (typeof s?.score === "number" && Number.isFinite(s.score)) scores.push(s.score);
    const nivel = normalizarNivel(s?.nivel);
    if (nivel) {
      niveis[nivel] = (niveis[nivel] ?? 0) + 1;
      const atual = nivelMinimo ? (ORDEM_NIVEL[nivelMinimo] ?? 99) : 99;
      const cand = ORDEM_NIVEL[nivel] ?? 99;
      if (cand < atual) nivelMinimo = nivel;
    }
    const t = s?.trace_id?.trim();
    if (t) traces.add(t);
  }

  const amostras = scores.length;
  const media =
    amostras > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / amostras) * 100) / 100 : null;

  return {
    amostras,
    media,
    min: amostras > 0 ? Math.min(...scores) : null,
    max: amostras > 0 ? Math.max(...scores) : null,
    niveis,
    nivelMinimo,
    traceIds: [...traces],
  };
}

/**
 * Cruza o resultado determinístico do cenário com a confiança declarada.
 * É o dado bruto das análises futuras ("PASS por nível de confiança" e
 * "erro confirmado com confiança alta"). Não emite juízo, só classifica.
 */
export function cruzarResultadoConfianca(
  resultado: string | null | undefined,
  resumo: ResumoConfiancaExecucao,
): {
  resultado: string | null;
  nivelPredominante: string | null;
  superconfianca: boolean;
  avaliada: boolean;
} {
  const res = resultado ? String(resultado).toUpperCase() : null;
  let nivelPredominante: string | null = null;
  let maior = -1;
  for (const [nivel, qtd] of Object.entries(resumo.niveis)) {
    if (qtd > maior) {
      maior = qtd;
      nivelPredominante = nivel;
    }
  }
  const falhou = res === "FAIL" || res === "REPROVADO";
  return {
    resultado: res,
    nivelPredominante,
    superconfianca: falhou && (resumo.niveis["HIGH"] ?? 0) > 0,
    avaliada: resumo.amostras > 0,
  };
}

/** Ambiente da execução da Nina — nunca inferido no cliente. */
export function ambienteDaExecucao(e: {
  teste: boolean;
  simulacaoAtiva?: boolean;
}): AmbienteQA {
  if (!e.teste) return "producao";
  return e.simulacaoAtiva ? "teste_automatizado" : "homologacao";
}
