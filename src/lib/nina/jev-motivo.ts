/**
 * Jev — Fase 8 (Etapa D): categoria fixa do motivo da transferência.
 * Puro (sem rede). O Jev só ESCOLHE a categoria; a frase do motivo continua
 * sendo da Maria. A categoria vai como prefixo legível "[Rótulo] " no motivo,
 * para a Central filtrar e ordenar sem mudar o banco.
 * Possível regra de negócio — validar com a equipe da clínica.
 */
import type { PerguntaJev, RespostaJev } from "./jev";

export const CATEGORIAS_MOTIVO = {
  urgencia_clinica: "Urgência clínica",
  insatisfacao: "Insatisfação",
  pedido_atendente: "Pediu atendente",
  agendamento: "Agendamento",
  cancelamento_remarcacao: "Cancelamento/remarcação",
  financeiro: "Financeiro",
  resultado_documento: "Resultado/documento",
  cadastro: "Cadastro/identificação",
  nao_compreendido: "Não compreendido",
  outra_unidade: "Outra unidade",
  outro: "Outro",
} as const;

export type CategoriaMotivo = keyof typeof CATEGORIAS_MOTIVO;

/** Ordem na lista de prioridades: urgência primeiro, depois insatisfação. */
export function pesoCategoriaMotivo(c: CategoriaMotivo | null | undefined): number {
  if (c === "urgencia_clinica") return 0;
  if (c === "insatisfacao") return 1;
  return 2;
}

export const LIMITE_MOTIVO = 0.6;

/** Códigos que já carregam a categoria (não precisam do Jev). */
const POR_CODIGO: Array<[RegExp, CategoriaMotivo]> = [
  [/^(?:CANCELAMENTO_SOLICITADO|REMARCACAO_SOLICITADA)\b/, "cancelamento_remarcacao"],
  [/^ATENDIMENTO_NAO_INFORMADO\b/, "outro"],
  [/^JEV_URGENCIA_CLINICA\b/, "urgencia_clinica"],
  [/^JEV_IRRITACAO\b/, "insatisfacao"],
  [/^JEV_PEDIDO_ATENDENTE\b/, "pedido_atendente"],
  [/^JEV_DUVIDA_REPETIDA\b/, "nao_compreendido"],
  [/profissional[_\s]+(?:e\s+)?sfp\b/i, "outra_unidade"],
];

const ROTULO_PARA_CATEGORIA = new Map<string, CategoriaMotivo>(
  Object.entries(CATEGORIAS_MOTIVO).map(([k, v]) => [v, k as CategoriaMotivo]),
);

/** Categoria do motivo gravado (prefixo "[Rótulo]" ou código conhecido). */
export function categoriaDoMotivo(motivo: string | null | undefined): CategoriaMotivo | null {
  const m = (motivo ?? "").trim();
  if (!m) return null;
  const pref = /^\[([^\]]{1,40})\]/.exec(m);
  if (pref) return ROTULO_PARA_CATEGORIA.get(pref[1]) ?? null;
  for (const [re, c] of POR_CODIGO) if (re.test(m)) return c;
  return null;
}

export function precisaClassificar(motivo: string): boolean {
  return categoriaDoMotivo(motivo) === null;
}

export function perguntaMotivo(): Record<string, PerguntaJev> {
  return {
    categoria: {
      type: "choice",
      instructions:
        "A assistente vai transferir o paciente para a recepção. Considerando `motivo`, `resumo` e `mensagem_atual`, qual é a categoria principal do motivo da transferência?",
      criteria: {
        urgencia_clinica: "Possível urgência clínica: dor forte, falta de ar, sangramento, desmaio, piora rápida.",
        insatisfacao: "Reclamação ou insatisfação com o atendimento ou com a clínica.",
        pedido_atendente: "O paciente pediu para falar com uma pessoa, sem outro assunto claro.",
        agendamento: "Marcar consulta/exame: sem vaga, profissional ou serviço não encontrado, dúvida de agenda.",
        cancelamento_remarcacao: "Cancelar ou remarcar um agendamento existente.",
        financeiro: "Valores, pagamento, PIX, boleto, cobrança, convênio ou cartão benefício.",
        resultado_documento: "Resultado de exame, laudo, receita, atestado ou outro documento.",
        cadastro: "Identificação do paciente ou cadastro ambíguo/não encontrado.",
        nao_compreendido: "A assistente não conseguiu entender o pedido.",
        outro: "Nenhuma das anteriores.",
      },
    },
  };
}

/** Categoria aceita só com certeza suficiente; senão "sem decisão". */
export function decidirCategoria(
  resposta: RespostaJev | undefined,
  limite: number = LIMITE_MOTIVO,
): CategoriaMotivo | null {
  const c = resposta?.choice;
  if (!c || !(c in CATEGORIAS_MOTIVO) || c === "outra_unidade") return null;
  const prob = resposta?.probabilities?.[c] ?? resposta?.confidence;
  if (typeof prob !== "number" || prob < limite) return null;
  return c as CategoriaMotivo;
}

export function motivoComCategoria(motivo: string, categoria: CategoriaMotivo | null): string {
  if (!categoria || !precisaClassificar(motivo)) return motivo;
  return `[${CATEGORIAS_MOTIVO[categoria]}] ${motivo}`.slice(0, 500);
}
