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
 * A regra é a MESMA da coluna Modalidade do Rateio da Receita (que é também a
 * que escolhe a coluna da grade de repasse), para o Cubo BI, o Excel da Agenda
 * e o Rateio darem o mesmo número para o mesmo médico:
 *   1) `convenio_modalidade` gravada no lançamento;
 *   2) senão, contrato ativo do paciente no Cartão Benefícios;
 *   3) senão, o texto da descrição do lançamento (lançamentos antigos).
 * Ver `resolverModalidade` e `formaDoAtendimento`.
 *
 * A forma de pagamento é uma informação separada, de propósito: 165 daquelas
 * 268 consultas do cartão foram pagas em DINHEIRO. Juntar as duas coisas num
 * "Consulta Dinheiro" contaria paciente do cartão como particular.
 */
import { resolverModalidade, type MapaConvenioPaciente } from "@/lib/convenio/modalidade";
import {
  classificarForma,
  LABEL_FORMA,
  type FormaCanonica,
} from "@/lib/financeiro/formas-pagamento";
import { formaDoAtendimento } from "@/lib/repasse-calc";

export type ModalidadeAtendimento = "particular" | "cartao" | "sem_pagamento";

export const LABEL_MODALIDADE: Record<ModalidadeAtendimento, string> = {
  particular: "Particular",
  cartao: "Cartão Benefícios",
  sem_pagamento: "Sem pagamento",
};

/** Colunas de `fin_lancamentos` que a classificação usa. */
export interface PagamentoDoAtendimento {
  forma_pagamento: string | null;
  convenio_modalidade: string | null;
  /** Retaguarda da modalidade em lançamento antigo (ver `formaDoAtendimento`). */
  descricao?: string | null;
  /** Paciente gravado no lançamento; quase sempre vazio — cai no do atendimento. */
  paciente_id?: string | null;
}

export interface ResumoPagamentoAtendimento {
  modalidade: ModalidadeAtendimento;
  /** Rótulo pronto para tela/Excel: "Dinheiro", "PIX", "Misto", "Sem pagamento"… */
  forma: string;
}

/** Contrato ativo de cada paciente e o paciente do atendimento, para a regra 2. */
export interface ContextoModalidade {
  mapa: MapaConvenioPaciente | null;
  /** `agendamentos.paciente_id`, usado quando o lançamento não tem paciente. */
  pacienteId?: string | null;
}

/** true → o lançamento foi cobrado pelo Cartão Benefícios (mesma regra do Rateio). */
export function lancamentoEhCartao(
  l: PagamentoDoAtendimento,
  ctx: ContextoModalidade | null,
): boolean {
  const modalidade = resolverModalidade({
    modalidadeLancamento: l.convenio_modalidade ?? null,
    pacienteId: l.paciente_id ?? ctx?.pacienteId ?? null,
    mapa: ctx?.mapa ?? null,
  });
  return formaDoAtendimento(l.descricao ?? null, modalidade) !== "particular";
}

/**
 * Resume os lançamentos de receita CONFIRMADOS de um atendimento.
 *
 * - nenhum lançamento → "Sem pagamento" nas duas colunas;
 * - algum lançamento do cartão → Cartão Benefícios;
 * - senão → Particular.
 *
 * A forma vira "Misto" quando o atendimento foi pago em mais de uma forma
 * (dois lançamentos, ou o próprio lançamento "misto").
 */
export function resumirPagamentos(
  lancamentos: readonly PagamentoDoAtendimento[],
  ctx: ContextoModalidade | null = null,
): ResumoPagamentoAtendimento {
  if (lancamentos.length === 0) {
    return { modalidade: "sem_pagamento", forma: LABEL_MODALIDADE.sem_pagamento };
  }
  const modalidade: ModalidadeAtendimento = lancamentos.some((l) => lancamentoEhCartao(l, ctx))
    ? "cartao"
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
