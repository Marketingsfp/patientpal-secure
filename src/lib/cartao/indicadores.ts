/**
 * Indicadores do Cartão Benefícios — as contas, separadas da tela.
 *
 * Estas funções são a MESMA régua que a faixa de indicadores do módulo de
 * Cartão já usa (`src/components/contratos/contratos-cards.tsx`). Elas foram
 * extraídas para cá quando o Painel Executivo passou a mostrar o bloco de
 * Gestão do Cartão: com a conta duplicada, uma das duas telas ia divergir da
 * outra no primeiro ajuste de regra, e a gestão veria dois números diferentes
 * para a mesma pergunta.
 *
 * Tudo aqui é função pura — recebe as linhas já lidas do banco e devolve os
 * totais. Quem busca as linhas (e cuida do corte de 1.000 linhas do PostgREST)
 * é `src/hooks/use-dashboard-blocos.ts`.
 *
 * Regras que NÃO estão aqui de propósito:
 * - Taxa de adesão: é cobrada uma única vez, na emissão do cartão, e não entra
 *   na mensalidade. Por isso os totais usam `valor` / `valor_pago` e nunca
 *   somam `taxa_adesao`.
 * - Cashback, score, saldo saúde: não existem no banco desta clínica.
 */

import { classificarParcela, DIAS_TOLERANCIA_MENSALIDADE } from "@/lib/cb-regras";

export { DIAS_TOLERANCIA_MENSALIDADE };

/** Situações de contrato que contam como fora de uso. */
const STATUS_INATIVOS = ["cancelado", "inativo", "encerrado"];

/** Linha de `contratos_assinatura` usada pelos indicadores. */
export interface ContratoIndicadorRow {
  status: string | null;
  valor_mensal: number | null;
  data_inicio: string | null;
}

/** Linha de `contrato_mensalidades` usada pelos indicadores. */
export interface MensalidadeIndicadorRow {
  status: string | null;
  valor: number | null;
  valor_pago: number | null;
  vencimento: string;
}

export interface ResumoContratos {
  /** Contratos com situação "ativo" na clínica inteira. */
  ativos: number;
  /** Soma das mensalidades dos contratos ativos — a receita prevista do mês. */
  receitaPrevista: number;
  /** Cancelados, inativos ou encerrados. Não entram na receita prevista. */
  inativos: number;
  /** Contratos cujo INÍCIO de vigência cai no mês corrente. */
  novos: number;
  /** Soma das mensalidades desses contratos novos. */
  novosValor: number;
  /** Receita prevista dividida pelos contratos ativos. 0 quando não há ativo. */
  ticketMedio: number;
}

export interface ResumoMensalidades {
  /** Parcelas do mês já quitadas. */
  pagas: number;
  pagasValor: number;
  /**
   * Parcelas do mês em aberto que NÃO bloqueiam o cartão: as que ainda não
   * venceram e as vencidas há até 5 dias, ainda dentro da tolerância.
   */
  aVencer: number;
  aVencerValor: number;
  /** Parcelas do mês vencidas há mais de 5 dias — a régua que bloqueia o balcão. */
  atrasadas: number;
  atrasadasValor: number;
  /** Pagas + a vencer + atrasadas. Canceladas ficam de fora dos dois lados. */
  faturado: number;
  faturadoValor: number;
  /**
   * Quanto do faturado do mês está atrasado, em porcentagem do VALOR.
   * É a inadimplência real: o dinheiro que venceu, não entrou e já passou da
   * tolerância, sobre tudo o que o mês tinha para receber. Zero quando o mês
   * ainda não tem nenhuma parcela.
   */
  inadimplenciaPct: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Primeiro e último dia do mês de `hojeIso`, como texto puro (AAAA-MM-DD).
 *
 * As datas nunca passam por `new Date("2026-08-10")`: esse construtor lê a
 * string como UTC e, no Brasil, devolve o dia 9. Comparar texto com texto
 * evita o erro de um dia que já custou caro em outras telas.
 */
export function limitesDoMes(hojeIso: string): { ini: string; fim: string; hojeIso: string } {
  const [ano, mes] = hojeIso.split("-").map(Number);
  const ini = `${ano}-${pad(mes)}-01`;
  // Dia 0 do mês seguinte = último dia deste mês.
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { ini, fim: `${ano}-${pad(mes)}-${pad(ultimoDia)}`, hojeIso };
}

/**
 * Totais de contratos da clínica inteira.
 *
 * @param linhas todas as linhas de `contratos_assinatura` da clínica.
 * @param iniDoMes primeiro dia do mês corrente (AAAA-MM-DD).
 */
export function resumirContratos(
  linhas: readonly ContratoIndicadorRow[],
  iniDoMes: string,
): ResumoContratos {
  const r: ResumoContratos = {
    ativos: 0,
    receitaPrevista: 0,
    inativos: 0,
    novos: 0,
    novosValor: 0,
    ticketMedio: 0,
  };
  for (const c of linhas) {
    const status = (c.status ?? "").toLowerCase();
    const valor = num(c.valor_mensal);
    if (status === "ativo") {
      r.ativos += 1;
      r.receitaPrevista += valor;
    } else if (STATUS_INATIVOS.includes(status)) {
      r.inativos += 1;
    }
    if ((c.data_inicio ?? "").slice(0, 10) >= iniDoMes) {
      r.novos += 1;
      r.novosValor += valor;
    }
  }
  r.ticketMedio = r.ativos > 0 ? r.receitaPrevista / r.ativos : 0;
  return r;
}

/**
 * Totais das mensalidades com vencimento no mês corrente.
 *
 * A classificação de cada parcela sai de `classificarParcela`, em
 * `src/lib/cb-regras.ts` — a mesma função que decide se o cartão do paciente
 * está bloqueado no balcão. É o que garante que o card de inadimplência e a
 * ficha do paciente nunca discordem sobre a mesma pessoa.
 *
 * @param linhas parcelas com vencimento entre o 1º e o último dia do mês.
 * @param hojeIso data de hoje no fuso da clínica (AAAA-MM-DD).
 */
export function resumirMensalidades(
  linhas: readonly MensalidadeIndicadorRow[],
  hojeIso: string,
): ResumoMensalidades {
  const r: ResumoMensalidades = {
    pagas: 0,
    pagasValor: 0,
    aVencer: 0,
    aVencerValor: 0,
    atrasadas: 0,
    atrasadasValor: 0,
    faturado: 0,
    faturadoValor: 0,
    inadimplenciaPct: 0,
  };
  for (const l of linhas) {
    switch (classificarParcela(l.status, l.vencimento, hojeIso)) {
      case "paga":
        r.pagas += 1;
        // Quem pagou com multa e juros pagou mais que o valor da parcela; o
        // indicador mostra o que entrou, então usa `valor_pago` quando existe.
        r.pagasValor += num(l.valor_pago ?? l.valor);
        break;
      case "a_vencer":
        r.aVencer += 1;
        r.aVencerValor += num(l.valor);
        break;
      case "inadimplente":
        r.atrasadas += 1;
        r.atrasadasValor += num(l.valor);
        break;
      case "cancelada":
        // Parcela cancelada não é receita nem dívida — fica fora dos dois lados
        // da conta, senão a inadimplência sairia diluída por dinheiro que a
        // clínica nunca teve para receber.
        break;
    }
  }
  r.faturado = r.pagas + r.aVencer + r.atrasadas;
  r.faturadoValor = r.pagasValor + r.aVencerValor + r.atrasadasValor;
  r.inadimplenciaPct = r.faturadoValor > 0 ? (r.atrasadasValor / r.faturadoValor) * 100 : 0;
  return r;
}
