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
 *  - Receita bruta: o DINHEIRO QUE ENTROU no caixa no período — a mesma régua
 *    do Movimento de Caixa, linha a linha (`RateioLinha.valor_pago` e
 *    `formas_pagas`). Até 23/09/2026 este card somava `RateioLinha.receita`,
 *    que a grade de repasse recalcula, e repartia as formas em PROPORÇÃO
 *    dessa receita: no período de 01 a 23/09/2026 isso dava R$ 797.298,11
 *    contra R$ 798.583,75 do Movimento de Caixa, com R$ 1.945,54 a menos no
 *    crédito e R$ 649,90 a mais no dinheiro. Fica de fora o atendimento
 *    lançado à mão sem lançamento no caixa (ver `RateioLinha.no_caixa`): é
 *    atendimento de verdade, com repasse devido, mas o dinheiro dele não
 *    passou pela gaveta e o cupom não o conhece.
 *  - Repasse e Atendimentos: o MESMO cálculo do Rateio da Receita
 *    (`@/lib/financeiro/rateio-receita`), pela grade do médico. Esses dois
 *    batem com a aba Relatórios por construção, porque é a mesma função.
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
import { classificarForma, type ParteMisto } from "@/lib/financeiro/formas-pagamento";
import { SEM_CATEGORIA } from "@/lib/financeiro/filtro-categoria";
import {
  fecharSaldoPorMeio,
  somarNoMeio,
  zeroSaldoPorMeio,
  type SaldoPorMeio,
} from "@/lib/financeiro/meio-pagamento";

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
  /**
   * A receita já repartida por forma — as partes reais de um pagamento misto.
   * Quando falta (despesa), vale a forma única de `forma_pagamento`.
   */
  formas?: ParteMisto[];
}

/**
 * As formas de pagamento de um lançamento, com o misto decomposto.
 *
 * Até 17/09/2026 a mensalidade paga "R$ 100,00 em dinheiro + R$ 75,00 no
 * crédito" entrava inteira no Dinheiro do Dashboard, porque só a primeira
 * parte era lida. O total batia com o Movimento de Caixa, mas as formas não
 * (01/09/2026: Dinheiro +R$ 170,00, PIX −R$ 95,00, Crédito −R$ 75,00). Agora
 * todas as partes entram, como no Movimento de Caixa.
 */
export function formasDoLancamento(
  l: Pick<LancamentoPainel, "formas" | "forma_pagamento" | "valor">,
): ParteMisto[] {
  return l.formas?.length
    ? l.formas
    : [{ forma: classificarForma(l.forma_pagamento), valor: l.valor }];
}

/** Despesa já com o grupo resolvido. */
export interface DespesaPainel extends LancamentoPainel {
  grupo: GrupoDespesa;
}

export function classificarDespesas(despesas: LancamentoPainel[]): DespesaPainel[] {
  return despesas.map((d) => ({ ...d, grupo: grupoDaDespesa(d.categoria_nome, d.descricao) }));
}

/**
 * Contagem de atendimentos.
 *
 * Desde 12/09/2026 cada PAGAMENTO recebido conta como um atendimento, a
 * pedido da direção: consulta, exame, procedimento, adesão, mensalidade e
 * recebimento avulso. O que não tem serviço de prestador entra em `outros`.
 */
export interface ProducaoPainel {
  total: number;
  consultasCartao: number;
  /** Consulta particular e de convênio. */
  consultasParticulares: number;
  /** Quantas das consultas particulares são de convênio. */
  consultasConvenio: number;
  exames: number;
  /** Procedimento, "outro", serviço fora do cadastro e recebimento avulso. */
  outros: number;
  /** Parcelas de mensalidade do Cartão recebidas no período. */
  mensalidades: number;
  /** Taxas de adesão (e inclusão de dependente) recebidas no período. */
  adesoes: number;
  /**
   * Atendimento feito sem cobrança: revisão de cortesia e gratuidade do
   * Cartão. Conta como atendimento e vale R$ 0,00; fica em card próprio para
   * não inflar consultas e exames.
   */
  cortesias: number;
}

/** Como o recebimento sem agendamento entra nos cards de contagem. */
export type CategoriaOutraReceita = "mensalidade" | "adesao" | "avulso";

/**
 * A adesão e a mensalidade não têm serviço cadastrado: o que as identifica é o
 * texto do lançamento gerado pelo contrato ("… — CONTRATO", "MENSALIDADE",
 * "ADESÃO", "TAXA DE INCLUSÃO DE DEPENDENTE"). O resto é recebimento avulso.
 */
export function categoriaDaOutraReceita(
  l: Pick<LancamentoPainel, "descricao" | "categoria_nome">,
): CategoriaOutraReceita {
  const t = normalizar(`${l.descricao ?? ""} ${l.categoria_nome ?? ""}`);
  if (t.includes("ADESAO") || t.includes("INCLUSAO DE DEPENDENTE")) return "adesao";
  if (t.includes("MENSALIDADE") || t.includes("CONTRATO")) return "mensalidade";
  return "avulso";
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

/**
 * Atendimento feito sem cobrança (cortesia da casa ou gratuidade do Cartão).
 * A linha de laudo também vale R$ 0,00, mas é repasse sobre um exame já
 * contado — não é cortesia.
 */
export const ehCortesia = (l: Pick<RateioLinha, "receita" | "laudo">): boolean =>
  !l.laudo && Number(l.receita ?? 0) <= 0;

export function producaoDoRateio(
  todas: Array<Pick<RateioLinha, "tipo_servico" | "condicao" | "receita" | "laudo">>,
): ProducaoPainel {
  // Cada pagamento recebido é um atendimento; o laudo não é pagamento.
  const linhas = todas.filter((l) => !l.laudo);
  const p: ProducaoPainel = {
    total: linhas.length,
    consultasCartao: 0,
    consultasParticulares: 0,
    consultasConvenio: 0,
    exames: 0,
    outros: 0,
    mensalidades: 0,
    adesoes: 0,
    cortesias: 0,
  };
  for (const l of linhas) {
    if (ehCortesia(l)) {
      p.cortesias++;
      continue;
    }
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
   * Repasse (grade) + terceiros + complemento médico — o DEVIDO pelos
   * atendimentos do período. Continua aparecendo lado a lado com o pago, mas
   * desde 12/09/2026 não é mais ele que forma a despesa e o saldo: quem manda
   * na despesa é o caixa (veja `custoPrestadoresPago`).
   */
  custoPrestadores: number;
  /** Repasse pago no caixa + complemento médico pago — a régua da gaveta. */
  custoPrestadoresPago: number;
  despesasOperacionais: number;
  /** Custo com prestadores PAGO no caixa + despesas operacionais. */
  despesasTotais: number;
  /** Líquido do Rateio (receita bruta − repasse − terceiros). */
  liquidoAtendimentos: number;
  saldo: number;
  /**
   * O mesmo saldo separado pelo lugar onde o dinheiro está: GAVETA (espécie),
   * BANCO (PIX, cartões, boleto, transferência) e OUTROS (convênio, sem
   * informação). Mesma separação do Movimento de Caixa.
   */
  saldoMeios: SaldoPorMeio;
  /** Repasse efetivamente pago no período — é ele que entra na despesa. */
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
    // Régua do caixa: o dinheiro que entrou, e só das linhas que têm
    // lançamento de caixa por trás. Ver o comentário de "Receita bruta" no
    // topo deste arquivo — até 23/09/2026 aqui somava `l.receita`, que é
    // recalculada pela grade de repasse, e o Dashboard fechava R$ 1.285,64
    // abaixo do Movimento de Caixa no mesmo período.
    if (l.no_caixa) receitaBruta += l.valor_pago;
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
  repassePagoNoPeriodo = round2(repassePagoNoPeriodo);
  const custoPrestadores = round2(repasse + terceiro + complementoMedico);
  // Despesa e saldo seguem a régua do caixa (decisão de 12/09/2026): entra o
  // que realmente saiu — repasse pago e complemento pago —, não o devido.
  const custoPrestadoresPago = round2(repassePagoNoPeriodo + complementoMedico);
  const despesasTotais = round2(custoPrestadoresPago + despesasOperacionais);
  // Cada pagamento recebido conta como um atendimento: os do Rateio pelo tipo
  // do serviço; mensalidade e adesão em cards próprios, e o recebimento avulso
  // em "outros". Os cards de contagem somam exatamente o total.
  const producaoAtend = producaoDoRateio(params.rateio);
  let mensalidades = 0;
  let adesoes = 0;
  let avulsos = 0;
  for (const o of params.outrasReceitas) {
    const c = categoriaDaOutraReceita(o);
    if (c === "mensalidade") mensalidades++;
    else if (c === "adesao") adesoes++;
    else avulsos++;
  }
  const producao: ProducaoPainel = {
    ...producaoAtend,
    total: producaoAtend.total + params.outrasReceitas.length,
    outros: producaoAtend.outros + avulsos,
    mensalidades,
    adesoes,
  };


  // O atendimento entra pelas partes REAIS do pagamento (`formas_pagas`), não
  // pelo rateio proporcional de `formas`: é o que faz a quebra por forma do
  // Dashboard bater com a do Movimento de Caixa e com a maquininha.
  const atendComFormas = params.rateio
    .filter((l) => l.no_caixa)
    .map((l) => ({ formas: l.formas_pagas }));
  // O lançamento avulso entra na mesma soma por balde que os atendimentos,
  // com o misto já decomposto, para as fatias fecharem com o Movimento de Caixa.
  const outrasComFormas = params.outrasReceitas.map((r) => ({ formas: formasDoLancamento(r) }));
  // Saldo por meio: as entradas vêm já repartidas por forma (inclusive nos
  // pagamentos mistos) e as saídas pela forma do lançamento de despesa — as
  // mesmas despesas que formam `despesasTotais`.
  const saldoMeios = zeroSaldoPorMeio();
  for (const l of atendComFormas)
    for (const f of l.formas ?? []) somarNoMeio(saldoMeios, f.forma, f.valor, "receita");
  for (const o of outrasComFormas)
    for (const f of o.formas) somarNoMeio(saldoMeios, f.forma, f.valor, "receita");
  for (const d of params.despesas)
    somarNoMeio(saldoMeios, classificarForma(d.forma_pagamento), d.valor, "despesa");
  fecharSaldoPorMeio(saldoMeios);

  return {
    receitaBruta,
    formas: receitaPorForma(atendComFormas),
    outrasReceitas: round2(outrasReceitas),
    receitaTotal: round2(receitaBruta + outrasReceitas),
    formasReceitaTotal: receitaPorForma([...atendComFormas, ...outrasComFormas]),
    repasse,
    terceiro,
    complementoMedico,
    custoPrestadores,
    custoPrestadoresPago,
    despesasOperacionais,
    despesasTotais,
    liquidoAtendimentos: round2(receitaBruta - repasse - terceiro),
    saldo: round2(receitaBruta + outrasReceitas - despesasTotais),
    saldoMeios,
    repassePagoNoPeriodo,
    producao,
    // Ticket médio da entrada de caixa: receita total ÷ pagamentos recebidos.
    ticketMedio:
      producao.total > 0 ? round2(round2(receitaBruta + outrasReceitas) / producao.total) : 0,

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
