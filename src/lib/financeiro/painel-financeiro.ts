/**
 * Cards do Financeiro → Dashboard.
 *
 * Por que existe
 * --------------
 * O Dashboard e o relatório Rateio da Receita mostravam o mesmo dia com números
 * diferentes (10/09/2026: 297 atendimentos contra 306, R$ 44.566,45 de
 * receitas contra R$ 40.043,17), e o card "Despesas" somava o repasse médico
 * pago junto com água, IPTU e salário — três quartos do valor era repasse. A
 * diretoria pediu que o Dashboard falasse a mesma língua do Rateio e separasse
 * o custo do médico da despesa da clínica.
 *
 * A régua de cada card
 * --------------------
 *  - Receita bruta, Repasse e Atendimentos: o MESMO cálculo do Rateio da
 *    Receita (`@/lib/financeiro/rateio-receita`). Competência = dia do
 *    atendimento; repasse = grade do médico. Os dois números batem com a aba
 *    Relatórios por construção, porque é a mesma função.
 *  - Outras receitas: o que o Rateio deixa de fora por não ter prestador —
 *    mensalidade do Cartão, adesão, recebimento avulso. É dinheiro da clínica
 *    (em setembro de 2026, R$ 37 mil só de mensalidade em dez dias) e por isso
 *    entra no saldo. Desde 11/09/2026 o card de Receita bruta mostra a soma
 *    das duas (`receitaTotal`), a pedido do dono: tinha card próprio, e a
 *    receita do dia ficava partida em dois lugares. A receita só dos
 *    atendimentos (`receitaBruta`) continua separada porque é a do Rateio e a
 *    base do ticket médio.
 *  - Despesas operacionais: despesa confirmada no período, SEM os pagamentos
 *    de repasse. Esses pagamentos ficam de fora porque o custo do médico já
 *    está no card de Repasse (pelo valor devido do período); somar os dois
 *    contaria o mesmo dinheiro duas vezes.
 *  - Complemento médico: pagamento extra a médico lançado como despesa, que a
 *    grade não calcula. Não é despesa operacional, mas também não está no
 *    Rateio — por isso aparece à parte e entra nas Despesas totais.
 *  - Card de Repasse: o custo total com prestadores (grade + terceiros +
 *    complemento médico), pedido do dono em 11/09/2026 — o mesmo número que
 *    entra nas Despesas totais, para os três cards fecharem entre si.
 *
 * Saldo = Receita bruta + Outras receitas − Repasse − Terceiros
 *         − Complemento médico − Despesas operacionais.
 */
import type { RateioLinha } from "@/lib/financeiro/rateio-receita";
import { receitaPorForma, type FatiaDaReceita } from "@/lib/financeiro/receita-por-forma";
import { classificarForma } from "@/lib/financeiro/formas-pagamento";
import { SEM_CATEGORIA } from "@/lib/financeiro/filtro-categoria";

const round2 = (v: number) => +v.toFixed(2);

/** Caixa alta e sem acento, para comparar nomes escritos de jeitos diferentes. */
const normalizar = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .trim();

/** A que parte do resultado uma despesa pertence. */
export type GrupoDespesa = "repasse_pago" | "complemento_medico" | "operacional";

/**
 * Classifica uma despesa confirmada.
 *
 * `repasse_pago` é o dinheiro entregue ao médico pela tela de repasse
 * (categorias REPASSE MEDICO e REPASSE TERCEIRO). A descrição também conta:
 * em 08/09/2026 onze pagamentos de repasse foram gravados sem categoria, e só
 * a descrição "REPASSE MEDICO — NOME (N ATEND.)" os identifica.
 *
 * Pagamento a médico lançado em COMISSIONAMENTO ou PRESTACAO DE SERVICO
 * continua operacional: o sistema não tem como saber, pelo lançamento, que o
 * favorecido é médico. O caminho é o financeiro usar a categoria certa.
 */
export function grupoDaDespesa(
  categoriaNome: string | null | undefined,
  descricao: string | null | undefined,
): GrupoDespesa {
  const cat = normalizar(categoriaNome);
  if (cat.includes("REPASSE")) return "repasse_pago";
  if (normalizar(descricao).startsWith("REPASSE MEDICO")) return "repasse_pago";
  if (cat === "COMPLEMENTO MEDICO") return "complemento_medico";
  return "operacional";
}

/** Lançamento de despesa ou de receita avulsa, como o painel lê do banco. */
export interface LancamentoPainel {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  /** Nome da categoria em caixa alta; `SEM_CATEGORIA` quando não tem. */
  categoria_nome: string;
  forma_pagamento: string | null;
}

/** Despesa já com o grupo resolvido. */
export interface DespesaPainel extends LancamentoPainel {
  grupo: GrupoDespesa;
}

export function classificarDespesas(despesas: LancamentoPainel[]): DespesaPainel[] {
  return despesas.map((d) => ({ ...d, grupo: grupoDaDespesa(d.categoria_nome, d.descricao) }));
}

/** Contagem de atendimentos por tipo, na mesma base do Rateio. */
export interface ProducaoPainel {
  total: number;
  consultasCartao: number;
  /** Consulta particular e de convênio. */
  consultasParticulares: number;
  /** Quantas das consultas particulares são de convênio. */
  consultasConvenio: number;
  exames: number;
  /** Procedimento, "outro" e serviço fora do cadastro. */
  outros: number;
}

export type CategoriaAtendimento = "cartao" | "particular" | "exame" | "outro";

/**
 * Tipo do atendimento para os cards de contagem.
 *
 * Sai do cadastro do serviço (`tipo_servico`) e da condição de cobrança
 * (`condicao`), já resolvidos pelo Rateio. O card antigo adivinhava pela
 * descrição do lançamento, e é daí que vinha a diferença de 297 contra 306.
 */
export function categoriaDoAtendimento(
  l: Pick<RateioLinha, "tipo_servico" | "condicao">,
): CategoriaAtendimento {
  const tipo = normalizar(l.tipo_servico);
  if (tipo === "CONSULTA")
    return normalizar(l.condicao).startsWith("CARTAO") ? "cartao" : "particular";
  if (tipo === "EXAME") return "exame";
  return "outro";
}

export function producaoDoRateio(
  linhas: Array<Pick<RateioLinha, "tipo_servico" | "condicao">>,
): ProducaoPainel {
  const p: ProducaoPainel = {
    total: linhas.length,
    consultasCartao: 0,
    consultasParticulares: 0,
    consultasConvenio: 0,
    exames: 0,
    outros: 0,
  };
  for (const l of linhas) {
    const c = categoriaDoAtendimento(l);
    if (c === "cartao") p.consultasCartao++;
    else if (c === "particular") {
      p.consultasParticulares++;
      if (normalizar(l.condicao) === "CONVENIO") p.consultasConvenio++;
    } else if (c === "exame") p.exames++;
    else p.outros++;
  }
  return p;
}

/** Todos os números dos cards de resultado. */
export interface ResumoPainel {
  /** Receita dos atendimentos — a mesma do Rateio. */
  receitaBruta: number;
  /** Quebra da receita dos atendimentos por forma de pagamento (mesma do Rateio). */
  formas: FatiaDaReceita[];
  outrasReceitas: number;
  /** Atendimentos + outras receitas: o número grande do card de Receita bruta. */
  receitaTotal: number;
  /** Quebra de `receitaTotal` por forma de pagamento; soma igual a ela. */
  formasReceitaTotal: FatiaDaReceita[];
  /** Repasse devido aos médicos pelos atendimentos do período (grade). */
  repasse: number;
  /** Parte do dono do equipamento, quando existe. */
  terceiro: number;
  complementoMedico: number;
  /**
   * Repasse (grade) + terceiros + complemento médico: o número grande do card
   * de Repasse. Até 11/09/2026 o card mostrava só a grade, e o terceiro e o
   * complemento ficavam escondidos na linha de baixo.
   */
  custoPrestadores: number;
  despesasOperacionais: number;
  /** Custo com prestadores + operacionais. */
  despesasTotais: number;
  /** Líquido do Rateio (receita bruta − repasse − terceiros). */
  liquidoAtendimentos: number;
  saldo: number;
  /** Repasse efetivamente pago no período — informativo, não entra no saldo. */
  repassePagoNoPeriodo: number;
  producao: ProducaoPainel;
  ticketMedio: number;
}

export function resumoPainel(params: {
  rateio: RateioLinha[];
  despesas: DespesaPainel[];
  outrasReceitas: LancamentoPainel[];
}): ResumoPainel {
  let receitaBruta = 0;
  let repasse = 0;
  let terceiro = 0;
  for (const l of params.rateio) {
    receitaBruta += l.receita;
    repasse += l.repasse;
    terceiro += l.terceiro;
  }
  let despesasOperacionais = 0;
  let complementoMedico = 0;
  let repassePagoNoPeriodo = 0;
  for (const d of params.despesas) {
    if (d.grupo === "operacional") despesasOperacionais += d.valor;
    else if (d.grupo === "complemento_medico") complementoMedico += d.valor;
    else repassePagoNoPeriodo += d.valor;
  }
  const outrasReceitas = params.outrasReceitas.reduce((s, r) => s + r.valor, 0);

  receitaBruta = round2(receitaBruta);
  repasse = round2(repasse);
  terceiro = round2(terceiro);
  despesasOperacionais = round2(despesasOperacionais);
  complementoMedico = round2(complementoMedico);
  const custoPrestadores = round2(repasse + terceiro + complementoMedico);
  const despesasTotais = round2(custoPrestadores + despesasOperacionais);
  const producao = producaoDoRateio(params.rateio);
  // O lançamento avulso tem uma forma só; entra na mesma soma por balde que
  // os atendimentos, para as fatias fecharem com o total do card.
  const outrasComFormas = params.outrasReceitas.map((r) => ({
    formas: [{ forma: classificarForma(r.forma_pagamento), valor: r.valor }],
  }));
  return {
    receitaBruta,
    formas: receitaPorForma(params.rateio),
    outrasReceitas: round2(outrasReceitas),
    receitaTotal: round2(receitaBruta + outrasReceitas),
    formasReceitaTotal: receitaPorForma([...params.rateio, ...outrasComFormas]),
    repasse,
    terceiro,
    complementoMedico,
    custoPrestadores,
    despesasOperacionais,
    despesasTotais,
    liquidoAtendimentos: round2(receitaBruta - repasse - terceiro),
    saldo: round2(receitaBruta + outrasReceitas - despesasTotais),
    repassePagoNoPeriodo: round2(repassePagoNoPeriodo),
    producao,
    ticketMedio: producao.total > 0 ? round2(receitaBruta / producao.total) : 0,
  };
}

/** Uma linha agrupada (por categoria, por médico). */
export interface GrupoValor {
  rotulo: string;
  qtd: number;
  valor: number;
}

/** Soma por categoria, da maior para a menor — é como o financeiro lê a conta. */
export function somarPorCategoria(itens: LancamentoPainel[]): GrupoValor[] {
  const acc = new Map<string, GrupoValor>();
  for (const i of itens) {
    const rotulo = i.categoria_nome || SEM_CATEGORIA;
    const g = acc.get(rotulo) ?? { rotulo, qtd: 0, valor: 0 };
    g.qtd += 1;
    g.valor = round2(g.valor + i.valor);
    acc.set(rotulo, g);
  }
  return Array.from(acc.values()).sort((a, b) => b.valor - a.valor);
}

/** Repasse por médico, do maior para o menor, com a parte de terceiros somada. */
export interface RepassePorMedico {
  medico: string;
  especialidade: string;
  qtd: number;
  receita: number;
  repasse: number;
  terceiro: number;
}

export function repassePorMedico(linhas: RateioLinha[]): RepassePorMedico[] {
  const acc = new Map<string, RepassePorMedico>();
  for (const l of linhas) {
    const chave = l.medico_id ?? "sem-profissional";
    const g = acc.get(chave) ?? {
      medico: l.medico_nome,
      especialidade: l.especialidade_nome,
      qtd: 0,
      receita: 0,
      repasse: 0,
      terceiro: 0,
    };
    g.qtd += 1;
    g.receita = round2(g.receita + l.receita);
    g.repasse = round2(g.repasse + l.repasse);
    g.terceiro = round2(g.terceiro + l.terceiro);
    acc.set(chave, g);
  }
  return Array.from(acc.values())
    .filter((g) => g.repasse > 0 || g.terceiro > 0)
    .sort((a, b) => b.repasse + b.terceiro - (a.repasse + a.terceiro));
}
