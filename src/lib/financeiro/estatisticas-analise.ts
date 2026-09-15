/**
 * Métricas de gestão da tela Financeiro → Estatísticas — módulo puro (sem
 * banco, sem React).
 *
 * Tudo aqui parte das linhas do Rateio (`RateioLinha`), que já é a base das
 * outras telas do Financeiro: mesma régua de data (o dia em que o dinheiro
 * entrou no caixa), mesma receita e mesma contagem de atendimentos. Calcular
 * ranking por outro caminho traria de volta exatamente o problema que a
 * direção pediu para resolver em 12/09/2026 — cada tela mostrando um número.
 */
import type { RateioLinha } from "@/lib/financeiro/rateio-receita";

const cent = (v: number) => Math.round(v * 100) / 100;

/**
 * Linha "[LAUDO]" é o repasse do médico que laudou um exame, não um atendimento
 * com paciente: o exame já foi contado na linha dele. Contá-la aqui inflava o
 * volume com atendimentos de R$ 0,00, baixava o ticket médio e distorcia a
 * fatia de cada modalidade.
 */
const semLaudo = (linhas: RateioLinha[]) => linhas.filter((l) => !l.laudo);

/** Uma posição do ranking, já com participação e acumulado de Pareto. */
export interface LinhaRanking {
  nome: string;
  receita: number;
  atendimentos: number;
  ticket: number;
  /** Participação na receita total do período, em % (0–100). */
  participacao: number;
  /** Soma das participações até esta linha, em % — a curva de Pareto. */
  acumulado: number;
}

/** Recorte disponível para o ranking. */
export type ChaveRanking = "especialidade" | "medico" | "servico" | "grupo";

const NOME_VAZIO: Record<ChaveRanking, string> = {
  especialidade: "Sem especialidade",
  medico: "Sem profissional",
  servico: "Sem serviço",
  grupo: "Sem grupo",
};

function nomeDaLinha(l: RateioLinha, chave: ChaveRanking): string {
  const bruto =
    chave === "especialidade"
      ? l.especialidade_nome
      : chave === "medico"
        ? l.medico_nome
        : chave === "servico"
          ? l.servico_nome
          : (l.grupo ?? "");
  return bruto?.trim() || NOME_VAZIO[chave];
}

/**
 * Ranking de receita, do maior para o menor, com participação e Pareto.
 *
 * Recebimento sem profissional (mensalidade, adesão) tem lugar no ranking de
 * serviço, mas não no de médico ou especialidade: lá ele viraria uma fatia
 * enorme de "Sem profissional" que esconderia a leitura que a gestão quer. Por
 * isso os dois rankings clínicos olham só as linhas de atendimento.
 */
export function rankingPorChave(linhas: RateioLinha[], chave: ChaveRanking): LinhaRanking[] {
  const somenteAtendimento = chave === "especialidade" || chave === "medico";
  const reais = semLaudo(linhas);
  const base = somenteAtendimento ? reais.filter((l) => l.origem === "atendimento") : reais;

  const mapa = new Map<string, { receita: number; atendimentos: number }>();
  for (const l of base) {
    const nome = nomeDaLinha(l, chave);
    const atual = mapa.get(nome) ?? { receita: 0, atendimentos: 0 };
    atual.receita += Number(l.receita) || 0;
    atual.atendimentos += 1;
    mapa.set(nome, atual);
  }

  const total = [...mapa.values()].reduce((s, v) => s + v.receita, 0);
  const ordenado = [...mapa.entries()].sort(
    (a, b) => b[1].receita - a[1].receita || b[1].atendimentos - a[1].atendimentos,
  );

  let acumulado = 0;
  return ordenado.map(([nome, v]) => {
    const participacao = total > 0 ? (v.receita / total) * 100 : 0;
    acumulado += participacao;
    return {
      nome,
      receita: cent(v.receita),
      atendimentos: v.atendimentos,
      ticket: v.atendimentos > 0 ? cent(v.receita / v.atendimentos) : 0,
      participacao: Math.round(participacao * 10) / 10,
      acumulado: Math.min(Math.round(acumulado * 10) / 10, 100),
    };
  });
}

/**
 * Quantas linhas do ranking respondem por `alvo`% da receita — a leitura de
 * Pareto ("6 especialidades fazem 80% do faturamento").
 */
export function corteDePareto(ranking: LinhaRanking[], alvo = 80): number {
  if (ranking.length === 0) return 0;
  const i = ranking.findIndex((l) => l.acumulado >= alvo);
  return i === -1 ? ranking.length : i + 1;
}

/** Como o paciente foi atendido, nos nomes que a clínica usa. */
export type Modalidade = "Particular" | "Cartão Consulta" | "Cartão Desconto" | "Convênio";

export interface FatiaModalidade {
  modalidade: Modalidade;
  atendimentos: number;
  receita: number;
  /** Participação na QUANTIDADE de atendimentos, em % (0–100). */
  participacao: number;
}

const MODALIDADES: Modalidade[] = ["Particular", "Cartão Consulta", "Cartão Desconto", "Convênio"];

/**
 * Distribuição dos atendimentos entre particular e os produtos do Cartão
 * Benefícios.
 *
 * Só linhas de atendimento: mensalidade e adesão são a venda do Cartão, não um
 * atendimento feito por ele, e contá-las aqui inflaria a fatia do Cartão.
 * Modalidades sem nenhum atendimento no período ficam de fora do resultado.
 */
export function distribuicaoPorModalidade(linhas: RateioLinha[]): FatiaModalidade[] {
  const base = semLaudo(linhas).filter((l) => l.origem === "atendimento");
  const mapa = new Map<Modalidade, { atendimentos: number; receita: number }>();
  for (const l of base) {
    const c = (l.condicao ?? "").toUpperCase();
    const modalidade: Modalidade =
      c === "CARTÃO CONSULTA"
        ? "Cartão Consulta"
        : c === "CARTÃO DESCONTO"
          ? "Cartão Desconto"
          : c === "CONVÊNIO"
            ? "Convênio"
            : "Particular";
    const atual = mapa.get(modalidade) ?? { atendimentos: 0, receita: 0 };
    atual.atendimentos += 1;
    atual.receita += Number(l.receita) || 0;
    mapa.set(modalidade, atual);
  }
  const total = base.length;
  return MODALIDADES.filter((m) => mapa.has(m)).map((modalidade) => {
    const v = mapa.get(modalidade)!;
    return {
      modalidade,
      atendimentos: v.atendimentos,
      receita: cent(v.receita),
      participacao: total > 0 ? Math.round((v.atendimentos / total) * 1000) / 10 : 0,
    };
  });
}

/** Um ponto da evolução — um dia ou uma semana, conforme o agrupamento. */
export interface PontoEvolucao {
  /** Chave do período: "2026-09-03" no dia, "2026-09-01" na semana. */
  chave: string;
  /** Rótulo pronto para o eixo: "03/09" ou "01/09 a 07/09". */
  rotulo: string;
  atendimentos: number;
  receita: number;
  ticket: number;
}

export type Agrupamento = "dia" | "semana";

const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Domingo da semana da data, em data pura (sem fuso). */
function domingoDa(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const dow = new Date(base).getUTCDay();
  return new Date(base - dow * 86400000).toISOString().slice(0, 10);
}

const somaDias = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Evolução de volume, receita e ticket médio ao longo do período.
 *
 * O ticket é calculado no fim, sobre os totais do período — e não pela média
 * dos tickets diários, que daria peso igual a um sábado de 20 atendimentos e a
 * uma terça de 300.
 */
export function evolucao(linhas: RateioLinha[], por: Agrupamento = "dia"): PontoEvolucao[] {
  const mapa = new Map<string, { atendimentos: number; receita: number }>();
  for (const l of semLaudo(linhas)) {
    const dia = String(l.data ?? "").slice(0, 10);
    if (!dia) continue;
    const chave = por === "semana" ? domingoDa(dia) : dia;
    const atual = mapa.get(chave) ?? { atendimentos: 0, receita: 0 };
    atual.atendimentos += 1;
    atual.receita += Number(l.receita) || 0;
    mapa.set(chave, atual);
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([chave, v]) => ({
      chave,
      rotulo: por === "semana" ? `${fmtDia(chave)} a ${fmtDia(somaDias(chave, 6))}` : fmtDia(chave),
      atendimentos: v.atendimentos,
      receita: cent(v.receita),
      ticket: v.atendimentos > 0 ? cent(v.receita / v.atendimentos) : 0,
    }));
}
