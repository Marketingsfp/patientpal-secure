/**
 * Projeção de fechamento do mês — módulo puro (sem banco, sem React).
 *
 * A ideia é simples e conservadora: o que já entrou no caixa até hoje vira um
 * ritmo por DIA COM MOVIMENTO (não por dia do calendário, senão domingo e
 * feriado puxam a média para baixo), e esse ritmo é repetido nos dias que
 * ainda faltam para o fim do mês.
 *
 * O ritmo sai só dos dias JÁ FECHADOS (até ontem). O dia de hoje ainda está
 * acontecendo: o que entrou nele aparece no "realizado", mas não entra na
 * média — senão toda manhã pareceria um dia fraco e puxaria a projeção para
 * baixo. Hoje conta como um dos dias que ainda faltam.
 *
 * Os dias que faltam saem do CALENDÁRIO: segunda a sábado, sem os feriados
 * nacionais em que a Agenda não abre. Cada um rende o que aquele dia da
 * semana costuma fazer (quarta não é sábado), a mesma conta da tabela de
 * atendimentos por dia da semana — card, gráfico e tabela dizem o mesmo.
 *
 * Nada aqui inventa dado: se o mês ainda não tem movimento, a projeção é igual
 * ao realizado e a confiança é "baixa".
 */

import {
  diasQueFaltam,
  esperadoNoDia,
  ritmoPorDiaDaSemana,
  type DiaReceita,
} from "./projecao-meta-semana";

export interface DiaCaixa {
  /** AAAA-MM-DD */
  data: string;
  receita: number;
  despesa: number;
  atendimentos: number;
}

export interface EntradaProjecao {
  /** Primeiro dia do mês (AAAA-MM-DD). */
  inicio: string;
  /** Último dia do mês (AAAA-MM-DD). */
  fim: string;
  /** Último dia já realizado (normalmente hoje) — AAAA-MM-DD. */
  hoje: string;
  dias: DiaCaixa[];
  /** Meta de receita do mês, se a clínica definiu uma. */
  meta?: number;
  /**
   * Receita e pagamentos por dia das últimas semanas (até ontem) — dá o peso
   * de cada dia da semana. Sem ele, todo dia que falta vale a média do mês.
   */
  historico?: DiaReceita[];
}

export interface Realizado {
  /** Receita, despesa, saldo e atendimentos contam também o que já entrou hoje. */
  receita: number;
  despesa: number;
  saldo: number;
  atendimentos: number;
  /** Ticket e dias com movimento só olham os dias fechados (até ontem). */
  ticket: number;
  diasComMovimento: number;
  /** Receita só dos dias fechados (até ontem) — base do que falta para a meta. */
  receitaFechada: number;
}

export interface Projetado {
  receita: number;
  despesa: number;
  saldo: number;
  atendimentos: number;
}

export type Confianca = "alta" | "media" | "baixa";

export interface PontoAtencao {
  id: string;
  titulo: string;
  detalhe: string;
  gravidade: "alta" | "media" | "info";
}

export interface MetaProjecao {
  meta: number;
  falta: number;
  /** Quanto precisa entrar por dia útil restante para bater a meta. */
  porDiaRestante: number;
  /** Quantos atendimentos por dia restante, no ticket médio atual. */
  atendimentosPorDia: number;
  alcancavel: boolean;
}

export interface ResultadoProjecao {
  realizado: Realizado;
  projetado: Projetado;
  /** Dias do mês já fechados (até ontem). */
  diasCorridos: number;
  /** Dias de atendimento que faltam: seg–sáb, sem feriado, hoje inclusive. */
  diasRestantes: number;
  /** Feriados nacionais em dia de semana no que falta do mês (AAAA-MM-DD). */
  feriados: string[];
  /** Quanto os dias que faltam rendem, cada um no ritmo do seu dia da semana. */
  rendeNoRitmo: number;
  /** Receita prevista de cada dia que falta — a curva do gráfico. */
  previsaoPorDia: { data: string; receita: number }[];
  mediaDiaria: number;
  mediaAtendimentosDia: number;
  confianca: Confianca;
  pontos: PontoAtencao[];
  meta: MetaProjecao | null;
}

const cent = (v: number) => Math.round(v * 100) / 100;

const diaDoMes = (iso: string) => Number(iso.slice(8, 10)) || 0;

const diaDaSemanaIso = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Projeção do fechamento do mês + o que precisa melhorar.
 */
export function projetarMes(e: EntradaProjecao): ResultadoProjecao {
  const dentro = e.dias.filter((d) => d.data >= e.inicio && d.data <= e.hoje);
  const fechados = dentro.filter((d) => d.data < e.hoje);

  const soma = (lista: DiaCaixa[], campo: "receita" | "despesa" | "atendimentos") =>
    lista.reduce((s, d) => s + d[campo], 0);

  const receita = cent(soma(dentro, "receita"));
  const despesa = cent(soma(dentro, "despesa"));
  const atendimentos = soma(dentro, "atendimentos");

  const receitaFechada = cent(soma(fechados, "receita"));
  const despesaFechada = cent(soma(fechados, "despesa"));
  const atendimentosFechados = soma(fechados, "atendimentos");
  const comMovimento = fechados.filter((d) => d.receita > 0 || d.atendimentos > 0);

  const realizado: Realizado = {
    receita,
    despesa,
    saldo: cent(receita - despesa),
    atendimentos,
    ticket: atendimentosFechados > 0 ? cent(receitaFechada / atendimentosFechados) : 0,
    diasComMovimento: comMovimento.length,
    receitaFechada,
  };

  const totalDias = diaDoMes(e.fim);
  const diasCorridos = Math.min(Math.max(diaDoMes(e.hoje) - 1, 0), totalDias);
  const faltam = diasQueFaltam(e.hoje, e.fim);
  const diasRestantes = faltam.total;

  const mediaDiaria = comMovimento.length > 0 ? cent(receitaFechada / comMovimento.length) : 0;
  const mediaDespesaDia = comMovimento.length > 0 ? cent(despesaFechada / comMovimento.length) : 0;
  const mediaAtendimentosDia =
    comMovimento.length > 0 ? Math.round(atendimentosFechados / comMovimento.length) : 0;

  // Cada dia que falta rende o que o seu dia da semana costuma fazer; sem
  // histórico daquele dia, a média dos dias fechados do mês.
  const ritmo = ritmoPorDiaDaSemana(e.historico ?? [], e.hoje);
  const reserva = {
    receita: mediaDiaria,
    pagamentos: comMovimento.length > 0 ? atendimentosFechados / comMovimento.length : 0,
  };
  const previsaoPorDia: { data: string; receita: number }[] = [];
  let rende = 0;
  let rendeAtendimentos = 0;
  for (const data of faltam.datas) {
    const esperado = esperadoNoDia(diaDaSemanaIso(data), ritmo, reserva);
    previsaoPorDia.push({ data, receita: cent(esperado.receita) });
    rende += esperado.receita;
    rendeAtendimentos += esperado.pagamentos;
  }
  const rendeNoRitmo = cent(rende);

  // Fechado até ontem + o que os dias que faltam rendem (hoje inclusive). Se
  // hoje já passou do ritmo, a projeção nunca fica abaixo do que entrou.
  const projReceita = cent(Math.max(receitaFechada + rendeNoRitmo, receita));
  const projDespesa = cent(Math.max(despesaFechada + mediaDespesaDia * diasRestantes, despesa));
  const projetado: Projetado = {
    receita: projReceita,
    despesa: projDespesa,
    saldo: cent(projReceita - projDespesa),
    atendimentos: Math.max(Math.round(atendimentosFechados + rendeAtendimentos), atendimentos),
  };

  const confianca: Confianca =
    comMovimento.length >= 10 ? "alta" : comMovimento.length >= 4 ? "media" : "baixa";

  const meta = montarMeta(
    e.meta,
    projReceita,
    receita,
    receitaFechada,
    diasRestantes,
    realizado.ticket,
  );

  return {
    realizado,
    projetado,
    diasCorridos,
    diasRestantes,
    feriados: faltam.feriados,
    rendeNoRitmo,
    previsaoPorDia,
    mediaDiaria,
    mediaAtendimentosDia,
    confianca,
    // Hoje fica de fora: de manhã ele sempre pareceria "dia sem entrada".
    pontos: pontosDeAtencao(fechados, realizado, mediaDiaria),
    meta,
  };
}

function montarMeta(
  meta: number | undefined,
  projecao: number,
  realizado: number,
  realizadoFechado: number,
  diasRestantes: number,
  ticket: number,
): MetaProjecao | null {
  if (!meta || meta <= 0) return null;
  const falta = cent(Math.max(meta - realizado, 0));
  // O ritmo pedido conta hoje como dia inteiro, então parte do fechado até ontem.
  const faltaDesdeHoje = Math.max(meta - realizadoFechado, 0);
  const porDia = diasRestantes > 0 ? cent(faltaDesdeHoje / diasRestantes) : falta;
  return {
    meta: cent(meta),
    falta,
    porDiaRestante: porDia,
    atendimentosPorDia: ticket > 0 ? Math.ceil(porDia / ticket) : 0,
    alcancavel: projecao >= meta,
  };
}

/**
 * Onde dá para melhorar. Só aponta o que os próprios números mostram — nada de
 * recomendação genérica.
 */
export function pontosDeAtencao(
  dias: DiaCaixa[],
  realizado: Realizado,
  mediaDiaria: number,
): PontoAtencao[] {
  const pontos: PontoAtencao[] = [];
  const comMovimento = dias.filter((d) => d.receita > 0 || d.atendimentos > 0);

  const semMovimento = dias.filter((d) => d.receita <= 0 && d.atendimentos <= 0);
  if (semMovimento.length > 0) {
    pontos.push({
      id: "dias-parados",
      titulo: `${semMovimento.length} dia(s) sem nenhuma entrada no caixa`,
      detalhe: semMovimento
        .slice(0, 6)
        .map((d) => fmtDia(d.data))
        .join(", "),
      gravidade: semMovimento.length >= 4 ? "alta" : "info",
    });
  }

  // "Dia bem abaixo da média" saiu daqui: comparado com a média de todos os
  // dias, todo sábado (meio expediente) aparecia como dia fraco — 05/09/2026
  // fez R$ 23 mil contra ~R$ 46 mil de média, mas estava no normal dos
  // sábados. A comparação com o mesmo dia da semana, com os motivos da queda,
  // vive em `./projecao-melhorias`.

  if (realizado.receita > 0 && realizado.despesa / realizado.receita > 0.7) {
    pontos.push({
      id: "despesa-alta",
      titulo: "Despesa consumindo mais de 70% da receita",
      detalhe: `${fmtBRL(realizado.despesa)} de despesa para ${fmtBRL(realizado.receita)} de receita.`,
      gravidade: "alta",
    });
  }

  const metade = Math.floor(comMovimento.length / 2);
  if (metade >= 2) {
    const ordenados = [...comMovimento].sort((a, b) => a.data.localeCompare(b.data));
    const inicio = ordenados.slice(0, metade);
    const fim = ordenados.slice(-metade);
    const mediaInicio = inicio.reduce((s, d) => s + d.receita, 0) / metade;
    const mediaFim = fim.reduce((s, d) => s + d.receita, 0) / metade;
    if (mediaInicio > 0 && mediaFim < mediaInicio * 0.85) {
      pontos.push({
        id: "queda-ritmo",
        titulo: "Ritmo caindo na segunda metade do período",
        detalhe: `Média passou de ${fmtBRL(cent(mediaInicio))} para ${fmtBRL(cent(mediaFim))} por dia.`,
        gravidade: "media",
      });
    }
  }

  const ticketBaixo = comMovimento.filter(
    (d) =>
      d.atendimentos > 0 &&
      realizado.ticket > 0 &&
      d.receita / d.atendimentos < realizado.ticket * 0.7,
  );
  if (ticketBaixo.length >= 2) {
    pontos.push({
      id: "ticket-baixo",
      titulo: `${ticketBaixo.length} dia(s) com ticket bem abaixo do médio`,
      detalhe: `Ticket médio do período: ${fmtBRL(realizado.ticket)}.`,
      gravidade: "info",
    });
  }

  return pontos;
}

/**
 * SIMULAÇÃO DE CRESCIMENTO
 *
 * Quanto precisa entrar por dia para o mês fechar X% acima do mês anterior.
 *
 * A base é o mês anterior FECHADO, e não a média dos últimos meses: é assim
 * que a gestão lê crescimento ("agosto fechou em tanto; quero 10% a mais").
 * A tela sempre mostra qual foi a base, porque um mês anterior atípico muda o
 * alvo inteiro.
 *
 * "Dia de movimento" e não "dia útil": a clínica atende de segunda a sábado —
 * o sábado responde por perto de 10% do caixa —, e domingo é vazio. Dividir o
 * que falta por dias úteis de calendário pediria um ritmo que nunca existiu.
 */
export interface MetaCrescimento {
  /** 5, 10, 15… ou 0 quando é a meta digitada à mão. */
  percentual: number;
  /** Nome curto para a tela: "+10%" ou "Meta digitada". */
  rotulo: string;
  alvo: number;
  falta: number;
  porDiaRestante: number;
  atendimentosPorDia: number;
  /** O ritmo de hoje chega lá sem mudar nada? */
  alcancavel: boolean;
  /** Quanto o ritmo precisa subir sobre a média atual, em %. */
  esforcoPercentual: number;
}

export interface EntradaSimulacao {
  /** Receita do mês anterior fechado. Sem ela não há o que simular. */
  baseMesAnterior: number;
  /** Percentuais de crescimento a simular. */
  percentuais?: number[];
  /** Meta em reais digitada na tela, se houver. */
  metaCustomizada?: number;
}

/**
 * Monta uma linha de simulação por percentual pedido (e a meta digitada, se
 * houver). Devolve lista vazia quando não há base de comparação.
 */
export function simularCrescimento(r: ResultadoProjecao, e: EntradaSimulacao): MetaCrescimento[] {
  const ticket = r.realizado.ticket;

  const montar = (alvoBruto: number, percentual: number, rotulo: string): MetaCrescimento => {
    const alvo = cent(alvoBruto);
    const falta = cent(Math.max(alvo - r.realizado.receita, 0));
    const faltaDesdeHoje = Math.max(alvo - r.realizado.receitaFechada, 0);
    const porDia = r.diasRestantes > 0 ? cent(faltaDesdeHoje / r.diasRestantes) : falta;
    return {
      percentual,
      rotulo,
      alvo,
      falta,
      porDiaRestante: porDia,
      atendimentosPorDia: ticket > 0 ? Math.ceil(porDia / ticket) : 0,
      alcancavel: r.projetado.receita >= alvo,
      // Mesma régua da tabela por dia da semana: quanto o que falta passa do
      // que os dias restantes rendem no ritmo normal.
      esforcoPercentual:
        r.rendeNoRitmo > 0 ? Math.round((faltaDesdeHoje / r.rendeNoRitmo - 1) * 100) : 0,
    };
  };

  const linhas: MetaCrescimento[] = [];
  if (e.baseMesAnterior > 0) {
    for (const p of e.percentuais ?? [5, 10, 15]) {
      linhas.push(montar(e.baseMesAnterior * (1 + p / 100), p, `+${p}%`));
    }
  }
  if (e.metaCustomizada && e.metaCustomizada > 0) {
    linhas.push(montar(e.metaCustomizada, 0, "Meta digitada"));
  }
  return linhas;
}

/** Um dia da curva de tendência. `realizado` é null nos dias que ainda não vieram. */
export interface PontoTendencia {
  data: string;
  /** Ex.: "03/09" — pronto para o eixo X. */
  rotulo: string;
  /** Receita acumulada até o dia, ou null se o dia ainda não aconteceu. */
  realizado: number | null;
  /** Curva projetada acumulada, que segue o realizado até hoje. */
  projetado: number;
}

/**
 * Curva do mês: o acumulado que já entrou e, a partir de hoje, o acumulado
 * até ontem seguindo no ritmo dos dias fechados até o último dia.
 *
 * As duas linhas se encontram em ontem de propósito — é o que deixa visível,
 * no gráfico, onde termina o fato e começa a estimativa. Hoje aparece no
 * realizado com o parcial do dia, abaixo da linha projetada até fechar.
 */
export function serieTendencia(e: EntradaProjecao, r: ResultadoProjecao): PontoTendencia[] {
  const porDia = new Map(e.dias.map((d) => [d.data, d.receita]));
  const previsao = new Map(r.previsaoPorDia.map((p) => [p.data, p.receita]));
  const totalDias = diaDoMes(e.fim);
  const hojeDia = Math.min(diaDoMes(e.hoje), totalDias);

  const pontos: PontoTendencia[] = [];
  let acumulado = 0;
  let projetado = 0;
  for (let dia = 1; dia <= totalDias; dia++) {
    const data = `${e.inicio.slice(0, 7)}-${String(dia).padStart(2, "0")}`;
    if (dia < hojeDia) {
      acumulado = cent(acumulado + (porDia.get(data) ?? 0));
      projetado = acumulado;
      pontos.push({ data, rotulo: fmtDia(data), realizado: acumulado, projetado });
    } else if (dia === hojeDia) {
      acumulado = cent(acumulado + (porDia.get(data) ?? 0));
      projetado = cent(projetado + (previsao.get(data) ?? 0));
      pontos.push({ data, rotulo: fmtDia(data), realizado: acumulado, projetado });
    } else {
      // Domingo e feriado não estão na previsão: a curva fica reta nesses dias.
      projetado = cent(projetado + (previsao.get(data) ?? 0));
      pontos.push({ data, rotulo: fmtDia(data), realizado: null, projetado });
    }
  }
  return pontos;
}
