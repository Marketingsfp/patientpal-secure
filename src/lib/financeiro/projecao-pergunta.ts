/**
 * Pergunta livre na aba Projeção — a parte que NÃO é IA (módulo puro).
 *
 * A gestão escreve o que quer saber ("quanto preciso fazer na sexta para
 * fechar 1 milhão?") e a IA responde em texto. Mas conta quem faz é o
 * sistema: este módulo monta, a partir dos mesmos números da tela, o resumo
 * que vai para a IA — e, quando a pergunta traz um valor ou percentual, a
 * tabela de atendimentos por dia da semana já calculada para aquele alvo.
 * A IA só explica; não recalcula. A tabela mostrada na tela sai daqui, nunca
 * do texto do modelo.
 *
 * Nada de paciente entra aqui: só totais do caixa e médias por dia.
 */

import type { MetaCrescimento, ResultadoProjecao } from "./projecao";
import {
  NOME_DIA_SEMANA,
  atendimentosPorDiaDaSemana,
  diasQueFaltam,
  interpretarMeta,
  ritmoPorDiaDaSemana,
  type DiaReceita,
  type ResultadoMetaSemana,
} from "./projecao-meta-semana";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export interface EntradaPergunta {
  pergunta: string;
  r: ResultadoProjecao;
  historico: DiaReceita[];
  hoje: string;
  fimMes: string;
  mesAnterior: { nome: string; receita: number };
  /** Meta já digitada na caixa de meta da tela (0 = nenhuma). */
  metaTela: number;
  simulacoes: MetaCrescimento[];
  /**
   * Alvo da pergunta anterior desta conversa. Numa continuação sem valor
   * ("e no sábado?"), a conta segue o alvo de que se estava falando.
   */
  alvoAnterior?: { valor: number; explicacao: string } | null;
}

export interface ContextoPergunta {
  /** Texto com os números para a IA. */
  contexto: string;
  /** Alvo lido da própria pergunta, ou a meta da tela, se houver. */
  alvo: {
    valor: number;
    origem: "pergunta" | "pergunta anterior" | "meta da tela";
    explicacao: string;
  } | null;
  /** Tabela por dia da semana calculada para o alvo — é ela que a tela mostra. */
  tabela: ResultadoMetaSemana | null;
}

export function montarContextoPergunta(e: EntradaPergunta): ContextoPergunta {
  const { r } = e;
  const reserva = {
    receita: r.mediaDiaria,
    pagamentos: r.realizado.diasComMovimento > 0 ? r.mediaAtendimentosDia : 0,
  };

  const lida = interpretarMeta(e.pergunta, {
    mesAnterior: e.mesAnterior.receita,
    nomeMesAnterior: e.mesAnterior.nome,
  });
  const alvo = lida.ok
    ? { valor: lida.valor, origem: "pergunta" as const, explicacao: lida.explicacao }
    : e.alvoAnterior
      ? { ...e.alvoAnterior, origem: "pergunta anterior" as const }
      : e.metaTela > 0
        ? {
            valor: e.metaTela,
            origem: "meta da tela" as const,
            explicacao: `Meta de ${fmt(e.metaTela)} no mês.`,
          }
        : null;

  const tabela = alvo
    ? atendimentosPorDiaDaSemana({
        meta: alvo.valor,
        realizadoAteOntem: r.realizado.receitaFechada,
        historico: e.historico,
        hoje: e.hoje,
        fimMes: e.fimMes,
        reserva,
      })
    : null;

  const ritmo = ritmoPorDiaDaSemana(e.historico, e.hoje);
  const faltam = diasQueFaltam(e.hoje, e.fimMes);
  const hojeParcial = Math.max(r.realizado.receita - r.realizado.receitaFechada, 0);

  const linhas: string[] = [];
  linhas.push(
    `HOJE: ${ddmm(e.hoje)} (${NOME_DIA_SEMANA[new Date(`${e.hoje}T00:00:00Z`).getUTCDay()]}). Mês termina em ${ddmm(e.fimMes)}.`,
  );
  linhas.push(
    `DIAS: ${r.diasCorridos} dia(s) do mês já fechados (até ontem); ${r.diasRestantes} dia(s) de atendimento pela frente contando hoje (segunda a sábado, sem domingo e sem feriado nacional)${
      faltam.feriados.length
        ? `; feriado(s) descontado(s): ${faltam.feriados.map(ddmm).join(", ")}`
        : ""
    }.`,
  );
  linhas.push("");
  linhas.push("REALIZADO NO MÊS:");
  linhas.push(`- Receita até ontem: ${fmt(r.realizado.receitaFechada)}`);
  linhas.push(`- Receita de hoje até agora (dia em andamento): ${fmt(hojeParcial)}`);
  linhas.push(`- Receita total já entrada: ${fmt(r.realizado.receita)}`);
  linhas.push(`- Despesa: ${fmt(r.realizado.despesa)} · Saldo: ${fmt(r.realizado.saldo)}`);
  linhas.push(
    `- Atendimentos: ${r.realizado.atendimentos} · Ticket médio: ${fmt(r.realizado.ticket)}`,
  );
  linhas.push(
    `- Ritmo dos dias fechados: ${fmt(r.mediaDiaria)} e ${r.mediaAtendimentosDia} atendimentos por dia de movimento`,
  );
  linhas.push("");
  linhas.push("PROJEÇÃO DE FECHAMENTO DO MÊS (no ritmo normal de cada dia da semana):");
  linhas.push(
    `- Receita ${fmt(r.projetado.receita)} · Despesa ${fmt(r.projetado.despesa)} · Saldo ${fmt(r.projetado.saldo)} · Atendimentos ${r.projetado.atendimentos}`,
  );
  linhas.push(`- Os dias que faltam rendem ${fmt(r.rendeNoRitmo)} no ritmo normal.`);
  linhas.push(`- Confiança da estimativa: ${r.confianca}.`);
  if (e.mesAnterior.receita > 0) {
    linhas.push("");
    linhas.push(
      `MÊS ANTERIOR (${e.mesAnterior.nome}) fechou com receita de ${fmt(e.mesAnterior.receita)}.`,
    );
    for (const s of e.simulacoes.filter((x) => x.percentual > 0)) {
      linhas.push(
        `- ${s.rotulo}: alvo ${fmt(s.alvo)}; ${s.alcancavel ? "o ritmo normal chega lá" : `exige ${s.esforcoPercentual}% a mais por dia`}`,
      );
    }
  }
  linhas.push("");
  linhas.push("O QUE CADA DIA DA SEMANA COSTUMA FAZER (média das últimas semanas, até ontem):");
  for (let w = 1; w <= 6; w++) {
    const rd = ritmo.get(w);
    const n = faltam.porDiaSemana.get(w) ?? 0;
    if (!rd) {
      linhas.push(`- ${NOME_DIA_SEMANA[w]}: sem histórico; faltam ${n} no mês`);
      continue;
    }
    const ticket = rd.pagamentos > 0 ? rd.receita / rd.pagamentos : 0;
    linhas.push(
      `- ${NOME_DIA_SEMANA[w]}: ${Math.round(rd.pagamentos)} atendimentos, ${fmt(rd.receita)}, ticket ${fmt(ticket)}; faltam ${n} no mês`,
    );
  }

  if (alvo && tabela) {
    linhas.push("");
    linhas.push(
      `CÁLCULO PRONTO PARA O ALVO (${
        alvo.origem === "pergunta"
          ? "lido da pergunta"
          : alvo.origem === "pergunta anterior"
            ? "o mesmo da pergunta anterior"
            : "meta digitada na tela"
      }): ${alvo.explicacao}`,
    );
    if (tabela.falta <= 0) {
      linhas.push("- O alvo já foi alcançado com o que entrou até ontem.");
    } else {
      linhas.push(
        `- Falta ${fmt(tabela.falta)} a partir de hoje; no ritmo normal os dias que faltam rendem ${fmt(tabela.rendeNoRitmo)}; ${
          tabela.esforcoPercentual > 0
            ? `é preciso ${tabela.esforcoPercentual}% a mais em cada dia`
            : `o ritmo normal já basta (sobra ${Math.abs(tabela.esforcoPercentual)}%)`
        }.`,
      );
      for (const l of tabela.linhas) {
        linhas.push(
          `- ${l.nome}: precisa ${l.atendimentosNecessarios} atendimentos por dia (costuma ${l.atendimentosHoje}; diferença ${
            l.atendimentosNecessarios - l.atendimentosHoje
          }), ${fmt(l.receitaNecessaria)} por dia; faltam ${l.diasRestantes} no mês`,
        );
      }
    }
  } else {
    linhas.push("");
    linhas.push(
      "CÁLCULO PRONTO PARA O ALVO: nenhum — a pergunta não traz valor e não há meta na tela.",
    );
  }

  return { contexto: linhas.join("\n"), alvo, tabela };
}
