/**
 * Projeção de fechamento do mês — módulo puro (sem banco, sem React).
 *
 * A ideia é simples e conservadora: o que já entrou no caixa até hoje vira um
 * ritmo por DIA COM MOVIMENTO (não por dia do calendário, senão domingo e
 * feriado puxam a média para baixo), e esse ritmo é repetido nos dias que
 * ainda faltam para o fim do mês.
 *
 * Nada aqui inventa dado: se o mês ainda não tem movimento, a projeção é igual
 * ao realizado e a confiança é "baixa".
 */

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
}

export interface Realizado {
  receita: number;
  despesa: number;
  saldo: number;
  atendimentos: number;
  ticket: number;
  diasComMovimento: number;
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
  /** Dias do mês já corridos (inclui hoje) e dias que ainda faltam. */
  diasCorridos: number;
  diasRestantes: number;
  mediaDiaria: number;
  mediaAtendimentosDia: number;
  confianca: Confianca;
  pontos: PontoAtencao[];
  meta: MetaProjecao | null;
}

const cent = (v: number) => Math.round(v * 100) / 100;

const diaDoMes = (iso: string) => Number(iso.slice(8, 10)) || 0;

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Projeção do fechamento do mês + o que precisa melhorar.
 */
export function projetarMes(e: EntradaProjecao): ResultadoProjecao {
  const dentro = e.dias.filter((d) => d.data >= e.inicio && d.data <= e.hoje);

  const receita = cent(dentro.reduce((s, d) => s + d.receita, 0));
  const despesa = cent(dentro.reduce((s, d) => s + d.despesa, 0));
  const atendimentos = dentro.reduce((s, d) => s + d.atendimentos, 0);
  const comMovimento = dentro.filter((d) => d.receita > 0 || d.atendimentos > 0);

  const realizado: Realizado = {
    receita,
    despesa,
    saldo: cent(receita - despesa),
    atendimentos,
    ticket: atendimentos > 0 ? cent(receita / atendimentos) : 0,
    diasComMovimento: comMovimento.length,
  };

  const totalDias = diaDoMes(e.fim);
  const diasCorridos = Math.min(diaDoMes(e.hoje), totalDias);
  const diasRestantes = Math.max(totalDias - diasCorridos, 0);

  // Proporção de dias com movimento observada até aqui, aplicada ao que falta.
  const proporcao = diasCorridos > 0 ? comMovimento.length / diasCorridos : 0;
  const diasProdutivosRestantes = diasRestantes * proporcao;

  const mediaDiaria = comMovimento.length > 0 ? cent(receita / comMovimento.length) : 0;
  const mediaDespesaDia = comMovimento.length > 0 ? cent(despesa / comMovimento.length) : 0;
  const mediaAtendimentosDia =
    comMovimento.length > 0 ? Math.round(atendimentos / comMovimento.length) : 0;

  const projReceita = cent(receita + mediaDiaria * diasProdutivosRestantes);
  const projDespesa = cent(despesa + mediaDespesaDia * diasProdutivosRestantes);
  const projetado: Projetado = {
    receita: projReceita,
    despesa: projDespesa,
    saldo: cent(projReceita - projDespesa),
    atendimentos: Math.round(
      atendimentos +
        (comMovimento.length > 0
          ? (atendimentos / comMovimento.length) * diasProdutivosRestantes
          : 0),
    ),
  };

  const confianca: Confianca =
    comMovimento.length >= 10 ? "alta" : comMovimento.length >= 4 ? "media" : "baixa";

  const meta = montarMeta(e.meta, projReceita, receita, diasRestantes, realizado.ticket, proporcao);

  return {
    realizado,
    projetado,
    diasCorridos,
    diasRestantes,
    mediaDiaria,
    mediaAtendimentosDia,
    confianca,
    pontos: pontosDeAtencao(dentro, realizado, mediaDiaria),
    meta,
  };
}

function montarMeta(
  meta: number | undefined,
  projecao: number,
  realizado: number,
  diasRestantes: number,
  ticket: number,
  proporcao: number,
): MetaProjecao | null {
  if (!meta || meta <= 0) return null;
  const falta = cent(Math.max(meta - realizado, 0));
  const diasProdutivos = Math.max(diasRestantes * proporcao, 0);
  const porDia = diasProdutivos > 0 ? cent(falta / diasProdutivos) : falta;
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

  const fracos = comMovimento
    .filter((d) => mediaDiaria > 0 && d.receita < mediaDiaria * 0.6)
    .sort((a, b) => a.receita - b.receita);
  if (fracos.length > 0) {
    pontos.push({
      id: "dias-fracos",
      titulo: `${fracos.length} dia(s) bem abaixo da média de ${fmtBRL(mediaDiaria)}`,
      detalhe: fracos
        .slice(0, 4)
        .map((d) => `${fmtDia(d.data)} ${fmtBRL(d.receita)}`)
        .join(" · "),
      gravidade: fracos.length >= 3 ? "media" : "info",
    });
  }

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
  const diasProdutivos =
    r.diasCorridos > 0 ? (r.diasRestantes * r.realizado.diasComMovimento) / r.diasCorridos : 0;
  const ticket = r.realizado.ticket;
  const media = r.mediaDiaria;

  const montar = (alvoBruto: number, percentual: number, rotulo: string): MetaCrescimento => {
    const alvo = cent(alvoBruto);
    const falta = cent(Math.max(alvo - r.realizado.receita, 0));
    const porDia = diasProdutivos > 0 ? cent(falta / diasProdutivos) : falta;
    return {
      percentual,
      rotulo,
      alvo,
      falta,
      porDiaRestante: porDia,
      atendimentosPorDia: ticket > 0 ? Math.ceil(porDia / ticket) : 0,
      alcancavel: r.projetado.receita >= alvo,
      esforcoPercentual: media > 0 ? Math.round(((porDia - media) / media) * 100) : 0,
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
 * Curva do mês: o acumulado que já entrou e, a partir de hoje, o mesmo
 * acumulado seguindo no ritmo atual até o último dia.
 *
 * As duas linhas se encontram no dia de hoje de propósito — é o que deixa
 * visível, no gráfico, onde termina o fato e começa a estimativa.
 */
export function serieTendencia(e: EntradaProjecao, r: ResultadoProjecao): PontoTendencia[] {
  const porDia = new Map(e.dias.map((d) => [d.data, d.receita]));
  const totalDias = diaDoMes(e.fim);
  const hojeDia = Math.min(diaDoMes(e.hoje), totalDias);
  const diasProdutivosRestantes =
    r.diasCorridos > 0 ? r.realizado.diasComMovimento / r.diasCorridos : 0;

  const pontos: PontoTendencia[] = [];
  let acumulado = 0;
  let projetado = 0;
  for (let dia = 1; dia <= totalDias; dia++) {
    const data = `${e.inicio.slice(0, 7)}-${String(dia).padStart(2, "0")}`;
    if (dia <= hojeDia) {
      acumulado = cent(acumulado + (porDia.get(data) ?? 0));
      projetado = acumulado;
      pontos.push({ data, rotulo: fmtDia(data), realizado: acumulado, projetado });
    } else {
      // Cada dia futuro rende a média diária, descontada pela chance de o dia
      // não ter movimento (domingo, feriado) observada no próprio mês.
      projetado = cent(projetado + r.mediaDiaria * diasProdutivosRestantes);
      pontos.push({ data, rotulo: fmtDia(data), realizado: null, projetado });
    }
  }
  return pontos;
}
