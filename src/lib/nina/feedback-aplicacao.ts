/**
 * FASE 4 — Aplicação controlada das correções aprovadas (catálogo puro).
 *
 * Regra principal: a correção acontece na camada responsável pelo erro.
 * Nada é corrigido "alterando a Base" por padrão.
 *
 * FASE 7: a fonte oficial é o CATÁLOGO ESTRUTURADO. A correção de conteúdo
 * oficial é feita editando o registro na Base de Conhecimentos da Nina e
 * publicando a nova versão — nunca por base paralela e nunca pela própria Nina.
 */

/** "planilha" permanece só para ler registros históricos anteriores à Fase 7. */
export type CamadaCorrecao = "catalogo" | "planilha" | "busca" | "modelo" | "ferramenta" | "fluxo";

export type TipoAcaoCorrecao =
  | "kb_update"
  | "kb_create"
  | "retrieval_fix"
  | "reasoning_fix"
  | "tool_fix"
  | "grounding_fix"
  | "workflow_fix";

export interface PlanoCorrecao {
  tipo: TipoAcaoCorrecao;
  camada: CamadaCorrecao;
  titulo: string;
  /** O que precisa ser feito, em linguagem simples. */
  instrucao: string;
  /** true = a aplicação passa por editar e publicar o registro do catálogo. */
  exigeEdicaoCatalogo: boolean;
  /** Mantido para compatibilidade: nenhum plano reprocessa base externa. */
  permiteReindexar: boolean;
  /** Avisos obrigatórios exibidos antes de confirmar. */
  avisos: string[];
}

const PLANOS: Record<string, PlanoCorrecao> = {
  knowledge_error: {
    tipo: "kb_update",
    camada: "catalogo",
    titulo: "Corrigir a informação oficial no catálogo",
    instrucao:
      "A informação oficial está errada. Corrija o registro correspondente na Base de Conhecimentos da Nina e publique a nova versão. O catálogo publicado é a única fonte de verdade.",
    exigeEdicaoCatalogo: true,
    permiteReindexar: false,
    avisos: [
      "A correção é feita no próprio registro do catálogo e só passa a valer quando publicada.",
      "Nenhuma base paralela é criada.",
    ],
  },
  knowledge_missing: {
    tipo: "kb_create",
    camada: "catalogo",
    titulo: "Incluir a informação que falta no catálogo",
    instrucao:
      "A informação deveria existir e não está na Base. Cadastre o registro na Base de Conhecimentos da Nina (manualmente ou com IA), revise e publique.",
    exigeEdicaoCatalogo: true,
    permiteReindexar: false,
    avisos: [
      "Só inclua informação confirmada pela clínica.",
      "O sistema não cria conteúdo oficial fora do catálogo.",
    ],
  },
  retrieval_error: {
    tipo: "retrieval_fix",
    camada: "busca",
    titulo: "Corrigir a busca (indexação, chunks, embeddings, ranking)",
    instrucao:
      "O catálogo está correto. Não altere o conteúdo publicado. Revise termos, nomes, metadados e ranking usados na busca.",
    exigeEdicaoCatalogo: false,
    permiteReindexar: false,
    avisos: ["O registro correto do catálogo NÃO deve ser alterado neste caso."],
  },
  reasoning_error: {
    tipo: "reasoning_fix",
    camada: "modelo",
    titulo: "Melhoria técnica de prompt, regra ou roteamento",
    instrucao:
      "O dado correto chegou ao modelo e foi interpretado errado. Registre a melhoria de prompt, regra, saída estruturada ou Reasoning Router. A alteração é feita por pessoa responsável, nunca pela própria Nina.",
    exigeEdicaoCatalogo: false,
    permiteReindexar: false,
    avisos: [
      "A Nina não altera o próprio prompt automaticamente.",
      "A Base de Conhecimentos não é alterada neste caso.",
    ],
  },
  tool_error: {
    tipo: "tool_fix",
    camada: "ferramenta",
    titulo: "Corrigir a integração ou ferramenta envolvida",
    instrucao:
      "Encaminhe para a correção da Agenda, CRM ou integração envolvida. A Base de Conhecimentos não é alterada.",
    exigeEdicaoCatalogo: false,
    permiteReindexar: false,
    avisos: ["A Base de Conhecimentos não é alterada neste caso."],
  },
  hallucination: {
    tipo: "grounding_fix",
    camada: "modelo",
    titulo: "Reforçar a proteção contra informação inventada",
    instrucao:
      "Prioridade crítica. A afirmação inventada NÃO deve ser adicionada à Base. Corrija a proteção de grounding, o prompt e a busca para que a Nina só afirme o que tem respaldo.",
    exigeEdicaoCatalogo: false,
    permiteReindexar: false,
    avisos: [
      "Nunca adicionar à Base uma informação que a Nina inventou.",
      "Prioridade crítica: tratar antes das demais.",
    ],
  },
  workflow_error: {
    tipo: "workflow_fix",
    camada: "fluxo",
    titulo: "Corrigir o fluxo do atendimento",
    instrucao:
      "Ajuste a regra de fluxo (por exemplo handoff ausente ou indevido). A Base de Conhecimentos não é alterada.",
    exigeEdicaoCatalogo: false,
    permiteReindexar: false,
    avisos: ["A Base de Conhecimentos não é alterada neste caso."],
  },
};

export function planoParaCausa(causa: string | null | undefined): PlanoCorrecao | null {
  if (!causa) return null;
  return PLANOS[causa] ?? null;
}

export const ROTULO_CAMADA: Record<CamadaCorrecao, string> = {
  catalogo: "Catálogo oficial",
  planilha: "Registro antigo (planilha)",
  busca: "Busca da Base",
  modelo: "Prompt / modelo",
  ferramenta: "Integração / ferramenta",
  fluxo: "Fluxo de atendimento",
};

export const ROTULO_ACAO: Record<TipoAcaoCorrecao, string> = {
  kb_update: "Atualizar catálogo",
  kb_create: "Incluir no catálogo",
  retrieval_fix: "Corrigir busca",
  reasoning_fix: "Melhorar prompt/regra",
  tool_fix: "Corrigir ferramenta",
  grounding_fix: "Reforçar grounding",
  workflow_fix: "Corrigir fluxo",
};

/** Comparação tolerante usada para verificar se a Base já traz a correção. */
export function baseJaContem(
  resumoBase: string | null | undefined,
  correcao: string | null | undefined,
): boolean {
  const norm = (v: unknown) =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const a = norm(resumoBase);
  const b = norm(correcao);
  if (!a || !b) return false;
  if (a.includes(b)) return true;
  // números costumam ser o dado decisivo (valores, por exemplo)
  const numeros = b.match(/\d+/g);
  if (numeros && numeros.length) {
    const aNum: string[] = a.match(/\d+/g) ?? [];
    return numeros.every((n) => aNum.includes(n));
  }
  return false;
}
