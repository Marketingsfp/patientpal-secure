/**
 * Modalidade e forma de pagamento de um atendimento, para os relatórios.
 *
 * O financeiro precisa separar, por médico, a "Consulta Particular" da
 * "Consulta Cartão" (Cartão Benefícios). Essa informação NÃO pode vir da
 * marcação da agenda (`agendamentos.tipo_atendimento`): o preço do cartão é
 * aplicado sozinho quando o paciente tem contrato em dia, mesmo com a ficha
 * marcada como "Particular". Conferido na produção, agosto/2026: 120 das 268
 * consultas cobradas pelo cartão estavam marcadas como "Particular".
 *
 * A fonte confiável é o lançamento de receita confirmado do atendimento
 * (`fin_lancamentos`): a cobrança pelo cartão grava
 * `convenio_modalidade = 'cartao_consulta'`. Na mesma conferência não havia
 * nenhum atendimento com lançamentos de modalidades diferentes.
 *
 * A forma de pagamento é uma informação separada, de propósito: 165 daquelas
 * 268 consultas do cartão foram pagas em DINHEIRO. Juntar as duas coisas num
 * "Consulta Dinheiro" contaria paciente do cartão como particular.
 */
import {
  classificarForma,
  LABEL_FORMA,
  type FormaCanonica,
} from "@/lib/financeiro/formas-pagamento";

export type ModalidadeAtendimento = "particular" | "cartao" | "convenio" | "sem_pagamento";

export const LABEL_MODALIDADE: Record<ModalidadeAtendimento, string> = {
  particular: "Particular",
  cartao: "Cartão Benefícios",
  convenio: "Convênio",
  sem_pagamento: "Sem pagamento",
};

/** Valor de `fin_lancamentos.convenio_modalidade` gravado pela cobrança do cartão. */
export const MODALIDADE_CARTAO_CONSULTA = "cartao_consulta";

/** Colunas de `fin_lancamentos` que a classificação usa. */
export interface PagamentoDoAtendimento {
  forma_pagamento: string | null;
  convenio_modalidade: string | null;
}

export interface ResumoPagamentoAtendimento {
  modalidade: ModalidadeAtendimento;
  /** Rótulo pronto para tela/Excel: "Dinheiro", "PIX", "Misto", "Sem pagamento"… */
  forma: string;
}

/**
 * Resume os lançamentos de receita CONFIRMADOS de um atendimento.
 *
 * - nenhum lançamento → "Sem pagamento" nas duas colunas;
 * - algum lançamento do cartão → Cartão Benefícios (o cartão vence, porque é
 *   ele que define a tabela de preço do atendimento);
 * - outra modalidade de convênio preenchida → Convênio;
 * - senão → Particular.
 *
 * A forma vira "Misto" quando o atendimento foi pago em mais de uma forma
 * (dois lançamentos, ou o próprio lançamento "misto").
 */
export function resumirPagamentos(
  lancamentos: readonly PagamentoDoAtendimento[],
): ResumoPagamentoAtendimento {
  if (lancamentos.length === 0) {
    return { modalidade: "sem_pagamento", forma: LABEL_MODALIDADE.sem_pagamento };
  }
  const modalidades = lancamentos.map((l) => (l.convenio_modalidade ?? "").trim().toLowerCase());
  const modalidade: ModalidadeAtendimento = modalidades.includes(MODALIDADE_CARTAO_CONSULTA)
    ? "cartao"
    : modalidades.some((m) => m.length > 0)
      ? "convenio"
      : "particular";

  const baldes = new Set<FormaCanonica>(
    lancamentos.map((l) => classificarForma(l.forma_pagamento)),
  );
  const forma =
    baldes.size > 1 || baldes.has("misto") ? "Misto" : LABEL_FORMA[baldes.values().next().value!];
  return { modalidade, forma };
}

/** Agrupa os lançamentos por atendimento, ignorando os sem `agendamento_id`. */
export function agruparPagamentosPorAtendimento<
  T extends PagamentoDoAtendimento & { agendamento_id: string | null },
>(lancamentos: readonly T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const l of lancamentos) {
    if (!l.agendamento_id) continue;
    const lista = mapa.get(l.agendamento_id);
    if (lista) lista.push(l);
    else mapa.set(l.agendamento_id, [l]);
  }
  return mapa;
}
