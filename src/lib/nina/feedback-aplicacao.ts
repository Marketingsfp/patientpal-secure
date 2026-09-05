/**
 * FASE 4 — Aplicação controlada das correções aprovadas (catálogo puro).
 *
 * Regra principal: a correção acontece na camada responsável pelo erro.
 * Nada é corrigido "alterando a Base" por padrão.
 *
 * LIMITAÇÃO CONHECIDA DA INFRAESTRUTURA (não contornar criando base paralela):
 * a fonte oficial da Base de Conhecimentos é a planilha enviada (arquivo em
 * storage). Os registros do banco são derivados desse arquivo e são apagados e
 * recriados a cada reprocessamento. Portanto NÃO existe edição direta de um
 * registro oficial pelo sistema: a correção de planilha é feita corrigindo o
 * arquivo e reenviando uma nova versão pela própria Base de Conhecimentos.
 */

export type CamadaCorrecao = "planilha" | "busca" | "modelo" | "ferramenta" | "fluxo";

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
  /** true = a aplicação passa por corrigir e reenviar a planilha oficial. */
  exigeReenvioPlanilha: boolean;
  /** true = faz sentido reprocessar chunks/embeddings/índices da base ativa. */
  permiteReindexar: boolean;
  /** Avisos obrigatórios exibidos antes de confirmar. */
  avisos: string[];
}

const PLANOS: Record<string, PlanoCorrecao> = {
  knowledge_error: {
    tipo: "kb_update",
    camada: "planilha",
    titulo: "Corrigir a informação oficial na planilha",
    instrucao:
      "A informação oficial está errada. Corrija a linha correspondente na planilha e reenvie a nova versão pela Base de Conhecimentos. A planilha continua sendo a única fonte de verdade.",
    exigeReenvioPlanilha: true,
    permiteReindexar: true,
    avisos: [
      "O sistema não edita a planilha por dentro: a correção é feita no arquivo oficial e reenviada.",
      "Nenhuma base paralela é criada.",
    ],
  },
  knowledge_missing: {
    tipo: "kb_create",
    camada: "planilha",
    titulo: "Incluir a informação que falta na planilha",
    instrucao:
      "A informação deveria existir e não está na Base. Inclua a linha na planilha oficial e reenvie a nova versão pela Base de Conhecimentos.",
    exigeReenvioPlanilha: true,
    permiteReindexar: true,
    avisos: [
      "Só inclua informação confirmada pela clínica.",
      "O sistema não cria conteúdo oficial fora da planilha.",
    ],
  },
  retrieval_error: {
    tipo: "retrieval_fix",
    camada: "busca",
    titulo: "Corrigir a busca (indexação, chunks, embeddings, ranking)",
    instrucao:
      "A planilha está correta. Não altere a planilha. Reprocesse a versão ativa para refazer chunks, embeddings e índices e revise termos, metadados e ranking da busca.",
    exigeReenvioPlanilha: false,
    permiteReindexar: true,
    avisos: ["A planilha correta NÃO deve ser alterada neste caso."],
  },
  reasoning_error: {
    tipo: "reasoning_fix",
    camada: "modelo",
    titulo: "Melhoria técnica de prompt, regra ou roteamento",
    instrucao:
      "O dado correto chegou ao modelo e foi interpretado errado. Registre a melhoria de prompt, regra, saída estruturada ou Reasoning Router. A alteração é feita por pessoa responsável, nunca pela própria Nina.",
    exigeReenvioPlanilha: false,
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
    exigeReenvioPlanilha: false,
    permiteReindexar: false,
    avisos: ["A Base de Conhecimentos não é alterada neste caso."],
  },
  hallucination: {
    tipo: "grounding_fix",
    camada: "modelo",
    titulo: "Reforçar a proteção contra informação inventada",
    instrucao:
      "Prioridade crítica. A afirmação inventada NÃO deve ser adicionada à Base. Corrija a proteção de grounding, o prompt e a busca para que a Nina só afirme o que tem respaldo.",
    exigeReenvioPlanilha: false,
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
    exigeReenvioPlanilha: false,
    permiteReindexar: false,
    avisos: ["A Base de Conhecimentos não é alterada neste caso."],
  },
};

export function planoParaCausa(causa: string | null | undefined): PlanoCorrecao | null {
  if (!causa) return null;
  return PLANOS[causa] ?? null;
}

export const ROTULO_CAMADA: Record<CamadaCorrecao, string> = {
  planilha: "Planilha oficial",
  busca: "Busca da Base",
  modelo: "Prompt / modelo",
  ferramenta: "Integração / ferramenta",
  fluxo: "Fluxo de atendimento",
};

export const ROTULO_ACAO: Record<TipoAcaoCorrecao, string> = {
  kb_update: "Atualizar planilha",
  kb_create: "Incluir na planilha",
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
