/**
 * FASE 5 — Revisão de amostra com rótulos explícitos.
 *
 * Camada pura. Separa três coisas que vinham sendo tratadas como a mesma:
 *  - reporte inicial (alguém apontou algo);
 *  - análise por IA / parecer do revisor Sol;
 *  - confirmação humana (a única que fecha o caso).
 *
 * Ausência de reporte NÃO é prova de resposta correta: fica "não revisada".
 */

export const VERSAO_REVISAO_AMOSTRA = "revisao-amostra-5";

export type RotuloQualidade =
  | "ADEQUADA"
  | "INADEQUADA"
  | "EVIDENCIA_INSUFICIENTE"
  | "NAO_REVISADA";

export type RotuloEncaminhamento = "NECESSARIO" | "DESNECESSARIO" | "INDETERMINADO";

export type Procedencia = "reporte_inicial" | "analise_ia" | "confirmacao_humana";

export type RevisaoItem = {
  qualidade: RotuloQualidade;
  /** Obrigatório quando a resposta é inadequada. */
  motivo: string | null;
  encaminhamento: RotuloEncaminhamento;
  procedencia: Procedencia;
  revisor: string | null;
  revisadoEm: string | null;
};

export type ItemAmostra = {
  id: string;
  conversaId: string;
  turnoId: string;
  ambiente: "producao" | "homologacao" | "teste_automatizado";
  tipoAtendimento: string;
  versaoPolitica: string;
  nivel: "HIGH" | "MEDIUM" | "LOW" | null;
  nota: number | null;
  /** O candidato foi bloqueado (LOW encaminhado) ou liberado. */
  destino: "LIBERADA" | "BLOQUEADA" | "SIMULADA";
  /** Estado da operação de fila, quando houve. */
  filaConfirmada: boolean | null;
  avisoEnviado: boolean | null;
  /** Existe evento ainda em processamento para este item. */
  emProcessamento: boolean;
  revisao: RevisaoItem | null;
};

export class RevisaoInvalida extends Error {}

/** Uma revisão só é aceita completa: inadequada exige motivo. */
export function validarRevisao(r: RevisaoItem): RevisaoItem {
  if (r.qualidade === "INADEQUADA" && !r.motivo?.trim()) {
    throw new RevisaoInvalida("motivo_obrigatorio_para_resposta_inadequada");
  }
  return r;
}

/**
 * Só confirmação humana fecha o caso. Reporte inicial e parecer de IA entram
 * como sinal para revisar, nunca como veredito.
 */
export function vereditoConclusivo(r: RevisaoItem | null): RotuloQualidade {
  if (!r) return "NAO_REVISADA";
  if (r.procedencia !== "confirmacao_humana") return "NAO_REVISADA";
  return r.qualidade;
}

export function encaminhamentoConclusivo(r: RevisaoItem | null): RotuloEncaminhamento {
  if (!r || r.procedencia !== "confirmacao_humana") return "INDETERMINADO";
  return r.encaminhamento;
}

// ------------------------------------------------------------------ amostra

export type FiltroAmostra = {
  ambiente?: ItemAmostra["ambiente"];
  tipoAtendimento?: string;
  versaoPolitica?: string;
};

export type Amostra = {
  itens: ItemAmostra[];
  /** Contagens por recorte, sempre com o denominador identificado. */
  porTipo: Record<string, number>;
  porVersaoPolitica: Record<string, number>;
  bloqueados: number;
  liberados: number;
  simulados: number;
  comparavel: boolean;
  observacao: string;
};

/**
 * Monta a amostra a revisar. Inclui obrigatoriamente candidatos LOW
 * bloqueados E respostas liberadas — revisar só o que deu errado enviesa a
 * medição.
 */
export function montarAmostra(itens: ItemAmostra[], filtro: FiltroAmostra = {}): Amostra {
  const sel = itens.filter(
    (i) =>
      (!filtro.ambiente || i.ambiente === filtro.ambiente) &&
      (!filtro.tipoAtendimento || i.tipoAtendimento === filtro.tipoAtendimento) &&
      (!filtro.versaoPolitica || i.versaoPolitica === filtro.versaoPolitica),
  );
  const conta = (chave: (i: ItemAmostra) => string) => {
    const m: Record<string, number> = {};
    for (const i of sel) m[chave(i)] = (m[chave(i)] ?? 0) + 1;
    return m;
  };
  const ambientes = new Set(sel.map((i) => i.ambiente));
  const versoes = new Set(sel.map((i) => i.versaoPolitica));
  const bloqueados = sel.filter((i) => i.destino === "BLOQUEADA").length;
  const liberados = sel.filter((i) => i.destino === "LIBERADA").length;
  const comparavel = ambientes.size <= 1 && versoes.size <= 1;
  return {
    itens: sel,
    porTipo: conta((i) => i.tipoAtendimento),
    porVersaoPolitica: conta((i) => i.versaoPolitica),
    bloqueados,
    liberados,
    simulados: sel.filter((i) => i.destino === "SIMULADA").length,
    comparavel,
    observacao: comparavel
      ? "Recorte homogêneo: mesmo ambiente e mesma versão da política."
      : "Recorte mistura ambientes e/ou versões da política. Comparar com cautela.",
  };
}
