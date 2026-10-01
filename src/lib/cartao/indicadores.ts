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
  /**
   * Contratos PAGANTES: situação "ativo" e mensalidade maior que zero.
   *
   * O contrato ativo de R$ 0 fica de fora (ver `semMensalidade`). Na Menino
   * Jesus eram 243 em 10/09/2026, todos criados pelo vínculo automático
   * titular-dependente de 13/06/2026 — são dependentes, não contratos que
   * pagam. Contá-los inflava o card de 1.624 para 1.867 e puxava o ticket
   * médio de R$ 126 para R$ 110.
   */
  ativos: number;
  /** Contratos ativos com mensalidade zero ou vazia — dependentes vinculados. */
  semMensalidade: number;
  /** Soma das mensalidades dos contratos ativos — a receita prevista do mês. */
  receitaPrevista: number;
  /** Cancelados, inativos ou encerrados. Não entram na receita prevista. */
  inativos: number;
  /** Contratos cujo INÍCIO de vigência cai no mês corrente. */
  novos: number;
  /** Soma das mensalidades desses contratos novos. */
  novosValor: number;
  /** Receita prevista dividida pelos contratos pagantes. 0 quando não há nenhum. */
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
    semMensalidade: 0,
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
      if (valor > 0) {
        r.ativos += 1;
        r.receitaPrevista += valor;
      } else {
        r.semMensalidade += 1;
      }
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

/** Situação de um contrato pagante no mês, para a faixa de indicadores da tela de contratos. */
export type SituacaoContratoMes = "pago" | "a_vencer" | "inadimplente" | "sem_cobranca";

/** Linha de `contratos_assinatura` usada na situação do mês. */
export interface ContratoMesRow {
  id: string;
  status: string | null;
  valor_mensal: number | null;
}

/** Linha de `contrato_mensalidades` com vencimento no mês. */
export interface ParcelaMesRow {
  contrato_id: string;
  status: string | null;
  vencimento: string;
  numero_parcela: number | null;
}

export interface ResumoContratosMes {
  /** Contratos ativos com mensalidade maior que zero — os mesmos de `ResumoContratos.ativos`. */
  ativos: number;
  receitaPrevista: number;
  /** Contratos ativos de R$ 0 (dependentes vinculados) — mostrados à parte. */
  dependentes: number;
  pagos: number;
  pagosValor: number;
  aVencer: number;
  aVencerValor: number;
  inadimplentes: number;
  inadimplentesValor: number;
  semCobranca: number;
  semCobrancaValor: number;
  /** Situação de cada contrato pagante, para o filtro ao clicar no indicador. */
  situacao: Map<string, SituacaoContratoMes>;
}

/**
 * Cada contrato ativo pagante cai em UMA situação no mês — a soma de pagos,
 * a vencer, inadimplentes e sem cobrança fecha com os ativos, em quantidade
 * e em valor.
 *
 * Antes a faixa contava PARCELAS: taxa de adesão paga aparecia em "Pagos",
 * parcela de contrato cancelado ou renovado também, e contrato com duas
 * parcelas no mês contava duas vezes. Em 01/10/2026 a Menino Jesus tinha 1.848
 * ativos e só 1.434 parcelas nos cards de baixo, sem explicação na tela.
 *
 * Regras:
 * - Só entram parcelas de mensalidade (`numero_parcela > 0`) e não canceladas.
 * - Com mais de uma parcela no mês, vale a pior: inadimplente > a vencer > pago.
 * - Sem nenhuma parcela válida no mês → "sem cobrança" (parcela nunca gerada,
 *   parcela do mês cancelada com o contrato ainda ativo, contrato que já
 *   terminou de pagar etc.). Fica à mostra para a equipe auditar.
 * - O valor de cada contrato é a mensalidade contratada, não o que foi pago:
 *   é o que faz os quatro cards somarem a receita prevista.
 */
export function resumirContratosDoMes(
  contratos: readonly ContratoMesRow[],
  parcelasDoMes: readonly ParcelaMesRow[],
  hojeIso: string,
): ResumoContratosMes {
  const peso: Record<SituacaoContratoMes, number> = {
    sem_cobranca: 0,
    pago: 1,
    a_vencer: 2,
    inadimplente: 3,
  };
  const piorParcela = new Map<string, SituacaoContratoMes>();
  for (const p of parcelasDoMes) {
    if (num(p.numero_parcela) <= 0) continue;
    const c = classificarParcela(p.status, p.vencimento, hojeIso);
    if (c === "cancelada") continue;
    const s: SituacaoContratoMes = c === "paga" ? "pago" : c;
    const atual = piorParcela.get(p.contrato_id);
    if (!atual || peso[s] > peso[atual]) piorParcela.set(p.contrato_id, s);
  }

  const r: ResumoContratosMes = {
    ativos: 0,
    receitaPrevista: 0,
    dependentes: 0,
    pagos: 0,
    pagosValor: 0,
    aVencer: 0,
    aVencerValor: 0,
    inadimplentes: 0,
    inadimplentesValor: 0,
    semCobranca: 0,
    semCobrancaValor: 0,
    situacao: new Map(),
  };
  for (const c of contratos) {
    if ((c.status ?? "").toLowerCase() !== "ativo") continue;
    const valor = num(c.valor_mensal);
    if (valor <= 0) {
      r.dependentes += 1;
      continue;
    }
    r.ativos += 1;
    r.receitaPrevista += valor;
    const s = piorParcela.get(c.id) ?? "sem_cobranca";
    r.situacao.set(c.id, s);
    if (s === "pago") {
      r.pagos += 1;
      r.pagosValor += valor;
    } else if (s === "a_vencer") {
      r.aVencer += 1;
      r.aVencerValor += valor;
    } else if (s === "inadimplente") {
      r.inadimplentes += 1;
      r.inadimplentesValor += valor;
    } else {
      r.semCobranca += 1;
      r.semCobrancaValor += valor;
    }
  }
  return r;
}
