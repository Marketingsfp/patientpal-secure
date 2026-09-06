/**
 * FASE 5 — Decisões humanas na Revisão de aprendizados.
 *
 * Regras desta camada (sem exceção):
 *  - a análise por IA é sugestão; quem decide é a pessoa revisora;
 *  - nada aqui altera catálogo, prompt, ferramentas, modelo ou atendimento;
 *  - "confirmar o problema", "aprovar a proposta de correção" e "aplicar a
 *    alteração" são três coisas diferentes e continuam separadas.
 */

export const TIPOS_DECISAO = [
  {
    valor: "problema_confirmado",
    rotulo: "Problema confirmado",
    descricao: "A pessoa revisora confirma que a resposta da Nina estava errada.",
  },
  {
    valor: "falso_positivo",
    rotulo: "Falso positivo",
    descricao: "O reporte não procede: a resposta da Nina estava adequada.",
  },
  {
    valor: "classificacao_ajustada",
    rotulo: "Classificação ajustada",
    descricao: "A causa do erro foi diagnosticada ou revista por uma pessoa.",
  },
  {
    valor: "sugestao_editada",
    rotulo: "Sugestão editada",
    descricao: "O texto da correção sugerida foi alterado por uma pessoa.",
  },
  {
    valor: "rascunho_ia_usado",
    rotulo: "Rascunho da IA usado",
    descricao: "A sugestão da análise foi copiada para o rascunho, por ação explícita.",
  },
  { valor: "em_revisao", rotulo: "Colocado em revisão", descricao: "Situação alterada." },
  {
    valor: "aprovado",
    rotulo: "Correção aprovada",
    descricao:
      "Autoriza a correção a seguir para o processo de aplicação. Não altera o catálogo por si só.",
  },
  { valor: "rejeitado", rotulo: "Correção rejeitada", descricao: "A proposta foi recusada." },
  { valor: "reaberto", rotulo: "Reaberto", descricao: "Voltou para pendente de revisão." },
] as const;

export type TipoDecisao = (typeof TIPOS_DECISAO)[number]["valor"];

export const VALORES_DECISAO = TIPOS_DECISAO.map((d) => d.valor) as unknown as [
  TipoDecisao,
  ...TipoDecisao[],
];

export function rotuloDecisao(v: string | null | undefined): string {
  if (!v) return "—";
  return TIPOS_DECISAO.find((d) => d.valor === v)?.rotulo ?? v;
}

/** O que o botão "Aprovar" faz de fato — texto único, usado na tela. */
export const EXPLICACAO_APROVAR =
  "Aprovar significa autorizar a correção a seguir para o processo de aplicação. " +
  "Não altera o catálogo, o prompt, as ferramentas nem o atendimento; a aplicação é um passo separado.";

export const AVISO_ANALISE_NAO_APROVA =
  "A análise por IA é uma sugestão de diagnóstico. Ela não confirma o erro, não aprova e não aplica nada.";

/** Erro de concorrência: outra pessoa mexeu no mesmo reporte. */
export const MSG_CONFLITO =
  "Outra pessoa alterou este reporte enquanto você revisava. Recarregue a lista e refaça a decisão.";

export type ResumoEvidenciasAnalise = {
  entradas?: number;
  etapas?: number;
  lacunas?: string[];
} | null;

/**
 * A análise ficou defasada? Comparação por conjunto de evidências, nunca por
 * data solta — e NUNCA dispara nova chamada paga automaticamente.
 */
export function analiseUsouOutroConjunto(
  resumo: ResumoEvidenciasAnalise,
  atual: { entradas: number; etapas: number } | null,
): boolean {
  if (!resumo || !atual) return false;
  const entradas = resumo.entradas ?? 0;
  const etapas = resumo.etapas ?? 0;
  return atual.entradas !== entradas || atual.etapas !== etapas;
}

/** Só sugere mexer no catálogo quando a causa aponta para o catálogo. */
const CAUSAS_DE_CATALOGO = new Set(["knowledge_error", "knowledge_missing"]);

export function camadaDaCausa(causa: string | null | undefined): {
  alvo: "catalogo" | "tecnico" | "indefinido";
  texto: string;
} {
  if (!causa) {
    return { alvo: "indefinido", texto: "Diagnostique a causa antes de encaminhar a correção." };
  }
  if (CAUSAS_DE_CATALOGO.has(causa)) {
    return {
      alvo: "catalogo",
      texto: "A correção é no registro do catálogo, pelo fluxo de edição e publicação já existente.",
    };
  }
  return {
    alvo: "tecnico",
    texto:
      "O catálogo já estava correto. A correção é técnica (busca, contexto, geração, ferramenta, fluxo, validação ou envio) e segue pelo fluxo técnico existente — sem mudança automática de código.",
  };
}
