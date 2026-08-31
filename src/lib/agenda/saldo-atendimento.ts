import { supabase } from "@/integrations/supabase/client";

/**
 * Pagamento parcial (entrada/sinal) com saldo devedor em um atendimento.
 *
 * Regra de negócio (Odontologia e tratamentos, válida para as 3 clínicas):
 *  - O procedimento custa, por exemplo, R$ 100,00. O paciente paga R$ 50,00
 *    hoje e volta na semana seguinte para quitar os R$ 50,00 restantes.
 *  - Cada recebimento é um lançamento próprio e entra na sessão de caixa do
 *    dia em que foi registrado. Os R$ 50,00 de hoje são a ÚNICA quantia no
 *    caixa de hoje; os R$ 50,00 da semana que vem entram no caixa daquele dia.
 *    Isso não é feito aqui — é o comportamento normal de
 *    `fn_registrar_lancamento_e_caixa` no banco.
 *  - O que este módulo acrescenta é a MEMÓRIA do total combinado, gravada em
 *    `agendamentos.valor_cobranca`. Sem ela o sistema não tinha como saber que
 *    R$ 50,00 pagos de um total de R$ 100,00 deixam saldo.
 *
 * O quanto já foi pago NUNCA é guardado numa coluna: é sempre a soma dos
 * lançamentos de receita confirmados do atendimento. Assim, um estorno faz o
 * saldo reaparecer sozinho, sem gatilho de sincronia para ficar defasado.
 */

/** Meio centavo — abaixo disso é sobra de arredondamento, não saldo. */
const EPS = 0.004;

const r2 = (n: number) => Math.round(n * 100) / 100;

export type SaldoAtendimento = {
  /** Total combinado da cobrança. */
  total: number;
  /** Soma dos recebimentos já confirmados. */
  pago: number;
  /** Quanto ainda falta receber (nunca negativo). */
  restante: number;
  /** true quando já houve recebimento e ainda falta saldo. */
  parcial: boolean;
  /** true quando o total combinado já foi inteiramente recebido. */
  quitado: boolean;
};

/**
 * Situação financeira de um atendimento a partir do total combinado e do que
 * já foi recebido. Função pura.
 *
 * Retorna null quando o atendimento não tem total combinado
 * (`valor_cobranca` NULL) — é o caso da esmagadora maioria dos atendimentos,
 * que seguem a regra antiga: existe lançamento, está pago.
 */
export function calcularSaldoAtendimento(
  valorCobranca: number | null | undefined,
  valorPago: number | null | undefined,
): SaldoAtendimento | null {
  const total = Number(valorCobranca ?? 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  const pago = Math.max(0, Number(valorPago ?? 0) || 0);
  const restante = r2(Math.max(0, total - pago));
  return {
    total: r2(total),
    pago: r2(pago),
    restante,
    parcial: pago > EPS && restante > EPS,
    quitado: restante <= EPS,
  };
}

/**
 * O atendimento ainda aceita mais um recebimento?
 *
 * Regra usada pela trava anti-cobrança-dupla do diálogo de lançamento. Antes
 * do pagamento parcial bastava perguntar "já existe lançamento?"; hoje isso é
 * insuficiente, porque a QUITAÇÃO de um saldo devedor é, por definição, um
 * segundo lançamento no mesmo atendimento. Era esse o motivo de um atendimento
 * de R$ 400,00 com R$ 200,00 pagos ficar preso em "Falta R$ 200,00" para
 * sempre: o segundo recebimento era recusado e nunca virava lançamento.
 *
 * - Sem nenhum recebimento ainda → sempre aceita.
 * - Com recebimento e SEM total combinado (`valorCobranca` NULL) → não aceita:
 *   é o atendimento comum, em que existir lançamento significa estar pago.
 * - Com recebimento e COM total combinado → aceita enquanto a soma recebida
 *   não alcançar o total.
 */
export function aceitaNovoRecebimento(
  valorCobranca: number | null | undefined,
  somaJaRecebida: number,
): boolean {
  const recebido = Number(somaJaRecebida ?? 0) || 0;
  if (recebido <= EPS) return true;
  const total = Number(valorCobranca ?? 0);
  if (!Number.isFinite(total) || total <= 0) return false;
  return total - recebido > EPS;
}

/** "Falta R$ 50,00" — rótulo curto para badge na agenda. */
export function rotuloSaldo(saldo: SaldoAtendimento): string {
  return `Falta ${saldo.restante.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })}`;
}

/**
 * Grava o total combinado no atendimento quando o recebimento é PARCIAL.
 *
 * Chamada depois que o lançamento já foi gravado com sucesso. Recebe o valor
 * cheio sugerido pela tabela de preços/convênio (`valorTotal`) e o valor que o
 * paciente efetivamente entregou agora (`valorRecebidoAgora`).
 *
 * Só grava quando de fato sobra saldo. Um pagamento integral continua sem
 * `valor_cobranca`, mantendo o comportamento antigo intacto para o volume
 * normal de atendimentos.
 *
 * Nunca lança: uma falha aqui não pode desfazer um pagamento que já entrou no
 * caixa. O erro é devolvido para quem chamou decidir como avisar.
 */
export async function registrarTotalCombinado(
  agendamentoId: string,
  valorTotal: number,
  valorRecebidoAgora: number,
  jaPagoAntes = 0,
): Promise<{ ok: boolean; erro?: unknown }> {
  const total = Number(valorTotal ?? 0);
  const pagoAcumulado = Number(jaPagoAntes ?? 0) + Number(valorRecebidoAgora ?? 0);
  if (!Number.isFinite(total) || total <= 0) return { ok: true };
  // Quitou tudo nesta cobrança: não precisa de controle de saldo.
  if (total - pagoAcumulado <= EPS) return { ok: true };
  try {
    const { error } = await supabase
      .from("agendamentos")
      .update({ valor_cobranca: r2(total) } as never)
      .eq("id", agendamentoId);
    if (error) return { ok: false, erro: error };
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro };
  }
}

/**
 * Linha da tela Financeiro > A Receber, devolvida pela função
 * `listar_saldos_em_aberto` do banco.
 */
export type SaldoEmAberto = {
  agendamento_id: string;
  paciente_id: string | null;
  paciente_nome: string;
  procedimento: string | null;
  inicio: string;
  medico_nome: string | null;
  valor_cobranca: number;
  valor_pago: number;
  saldo: number;
  ultimo_pagamento: string | null;
};

/** Atendimentos da clínica com saldo devedor em aberto, do mais recente ao mais antigo. */
export async function listarSaldosEmAberto(
  clinicaId: string,
  busca?: string,
): Promise<SaldoEmAberto[]> {
  // `as never` no nome: a função é criada pela migração
  // 20260825120000_pagamento_parcial_saldo_devedor.sql e só entra nos tipos
  // gerados do Supabase quando eles forem regerados depois de aplicá-la.
  const { data, error } = await supabase.rpc(
    "listar_saldos_em_aberto" as never,
    {
      _clinica_id: clinicaId,
      _busca: busca?.trim() ? busca.trim() : null,
      _limite: 300,
    } as never,
  );
  if (error) throw error;
  return ((data ?? []) as SaldoEmAberto[]).map((r) => ({
    ...r,
    valor_cobranca: Number(r.valor_cobranca ?? 0),
    valor_pago: Number(r.valor_pago ?? 0),
    saldo: Number(r.saldo ?? 0),
  }));
}
