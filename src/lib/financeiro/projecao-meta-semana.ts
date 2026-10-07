/**
 * Meta escrita em texto livre → atendimentos necessários por dia da semana.
 * Módulo puro (sem banco, sem React).
 *
 * A tela de Projeção aceita a meta do jeito que a gestão fala: "600 mil",
 * "R$ 650.000", "1,2 milhão", "10% acima do mês passado". Nada de IA: a
 * leitura é por regra fixa, e a tela sempre mostra o que foi entendido.
 *
 * A distribuição por dia da semana respeita o peso que cada dia já tem: o
 * sábado (meio expediente) faz bem menos que a segunda, então o esforço extra
 * é repartido na mesma proporção, e não como um número igual para todo dia.
 * Domingo fica fora. Hoje conta como dia que falta; o que já entrou conta só
 * até ontem (o dia de hoje ainda está acontecendo).
 */

import { diaDaSemana } from "./preset-periodo";

const cent = (v: number) => Math.round(v * 100) / 100;

/** Abaixo de 30% da mediana do mesmo dia da semana, o dia não é "normal". */
const PISO_DIA_NORMAL = 0.3;

export const NOME_DIA_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

// ---------------------------------------------------------------------------
// 1. LEITURA DA META ESCRITA
// ---------------------------------------------------------------------------

export type MetaInterpretada =
  | { ok: true; valor: number; explicacao: string }
  | { ok: false; motivo: string };

/** "1.234.567,89" / "650.000" / "1,2" / "1.2" → número. */
function lerNumero(bruto: string, temMultiplicador: boolean): number {
  let t = bruto;
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(t) && temMultiplicador) {
    // "1.5 milhão": ponto como vírgula decimal.
  } else {
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const MULTIPLICADOR: Record<string, number> = {
  mil: 1_000,
  k: 1_000,
  milhao: 1_000_000,
  milhoes: 1_000_000,
  mi: 1_000_000,
  mm: 1_000_000,
};

/**
 * Lê a meta de receita escrita na caixa de texto.
 *
 * Valor em reais tem prioridade; sem ele, um percentual vira crescimento
 * sobre o mês anterior fechado. Números pequenos (até 999, como "dia 30")
 * não são tratados como meta em reais.
 */
export function interpretarMeta(
  texto: string,
  base: { mesAnterior: number; nomeMesAnterior: string },
): MetaInterpretada {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!t) return { ok: false, motivo: "vazio" };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Percentual primeiro sai do texto, para "10%" não virar R$ 10.
  const pct = t.match(/(-?\d+(?:[.,]\d+)?)\s*%/);
  const semPct = pct ? t.replace(pct[0], " ") : t;

  let melhor = 0;
  const re = /(\d[\d.,]*)\s*(milhoes|milhao|mil|mm|mi|k)?(?![a-z])/g;
  for (const m of semPct.matchAll(re)) {
    const bruto = m[1].replace(/[.,]$/, "");
    const mult = m[2] ? MULTIPLICADOR[m[2]] : 1;
    const v = lerNumero(bruto, !!m[2]) * mult;
    if (Number.isFinite(v) && v > melhor) melhor = v;
  }
  if (melhor >= 1000) {
    return { ok: true, valor: cent(melhor), explicacao: `Meta de ${fmt(cent(melhor))} no mês.` };
  }

  if (pct) {
    const p = Number(pct[1].replace(",", "."));
    if (!(base.mesAnterior > 0)) {
      return {
        ok: false,
        motivo: `Para usar percentual é preciso ter a receita de ${base.nomeMesAnterior}, e ela não foi encontrada. Escreva o valor em reais.`,
      };
    }
    const valor = cent(base.mesAnterior * (1 + p / 100));
    const sinal = p >= 0 ? `${p}% acima de` : `${Math.abs(p)}% abaixo de`;
    return {
      ok: true,
      valor,
      explicacao: `Meta de ${fmt(valor)}: ${sinal} ${base.nomeMesAnterior} (${fmt(base.mesAnterior)}).`,
    };
  }

  return {
    ok: false,
    motivo: 'Não encontrei um valor. Escreva, por exemplo: "600 mil", "R$ 650.000" ou "10% acima".',
  };
}

// ---------------------------------------------------------------------------
// 2. ATENDIMENTOS NECESSÁRIOS POR DIA DA SEMANA
// ---------------------------------------------------------------------------

/** Receita de um dia já fechado (para o histórico de cada dia da semana). */
export interface DiaReceita {
  /** AAAA-MM-DD */
  dia: string;
  receita: number;
  /** Pagamentos recebidos no dia — a mesma régua de "atendimento" do caixa. */
  pagamentos: number;
}

export interface LinhaDiaSemana {
  /** 1 = segunda … 6 = sábado. */
  diaSemana: number;
  nome: string;
  /** Quantos desses dias ainda faltam no mês (hoje inclusive). */
  diasRestantes: number;
  /** Dias do histórico usados na média deste dia da semana. */
  amostra: number;
  /** Atendimentos que esse dia da semana faz normalmente. */
  atendimentosHoje: number;
  /** Atendimentos por dia necessários para bater a meta. */
  atendimentosNecessarios: number;
  /** Receita por dia necessária para bater a meta. */
  receitaNecessaria: number;
  ticket: number;
}

export interface ResultadoMetaSemana {
  meta: number;
  /** Receita fechada até ontem. */
  realizadoAteOntem: number;
  falta: number;
  /** Quanto os dias que faltam renderiam no ritmo normal de cada dia da semana. */
  rendeNoRitmo: number;
  /** Quanto o ritmo precisa subir, em % (negativo: dá para ir mais devagar). */
  esforcoPercentual: number;
  linhas: LinhaDiaSemana[];
  /** Dias da semana que faltam no mês mas não têm histórico para estimar. */
  semHistorico: string[];
  /** Total de dias de funcionamento que faltam (hoje inclusive). */
  diasRestantes: number;
}

/**
 * Reparte o que falta da meta pelos dias de funcionamento que restam, no peso
 * de cada dia da semana.
 *
 * Cada dia da semana mantém o próprio ticket médio (o sábado costuma ter
 * outro perfil de atendimento), e o fator de esforço é o mesmo para todos:
 * se o mês precisa render 20% a mais, cada dia precisa render 20% a mais do
 * que costuma.
 *
 * Dia muito abaixo do normal do próprio dia da semana (menos de 30% da
 * mediana) fica fora da média: é feriado com meio expediente ou semana de
 * implantação do sistema (agosto/2026 teve semanas de R$ 3 mil contra
 * ~R$ 230 mil das normais), e puxaria o "costuma fazer" para baixo.
 */
export function atendimentosPorDiaDaSemana(p: {
  meta: number;
  realizadoAteOntem: number;
  historico: DiaReceita[];
  hoje: string;
  fimMes: string;
}): ResultadoMetaSemana {
  const porSemana = new Map<number, DiaReceita[]>();
  for (const d of p.historico) {
    if (d.dia >= p.hoje) continue;
    const w = diaDaSemana(d.dia);
    if (w === 0 || d.receita <= 0) continue;
    porSemana.set(w, [...(porSemana.get(w) ?? []), d]);
  }

  const somas = new Map<number, { dias: number; receita: number; pagamentos: number }>();
  for (const [w, lista] of porSemana) {
    const ordenadas = lista.map((d) => d.receita).sort((a, b) => a - b);
    const meio = Math.floor(ordenadas.length / 2);
    const mediana =
      ordenadas.length % 2 ? ordenadas[meio] : (ordenadas[meio - 1] + ordenadas[meio]) / 2;
    for (const d of lista) {
      if (d.receita < mediana * PISO_DIA_NORMAL) continue;
      const s = somas.get(w) ?? { dias: 0, receita: 0, pagamentos: 0 };
      s.dias += 1;
      s.receita += d.receita;
      s.pagamentos += d.pagamentos;
      somas.set(w, s);
    }
  }

  const restantes = new Map<number, number>();
  const cursor = new Date(`${p.hoje}T00:00:00Z`);
  const fim = new Date(`${p.fimMes}T00:00:00Z`);
  let diasRestantes = 0;
  while (cursor <= fim) {
    const w = cursor.getUTCDay();
    if (w !== 0) {
      restantes.set(w, (restantes.get(w) ?? 0) + 1);
      diasRestantes += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const falta = cent(Math.max(p.meta - p.realizadoAteOntem, 0));
  const semHistorico: string[] = [];
  let rendeNoRitmo = 0;
  for (const [w, n] of restantes) {
    const s = somas.get(w);
    if (!s) {
      semHistorico.push(NOME_DIA_SEMANA[w]);
      continue;
    }
    rendeNoRitmo += n * (s.receita / s.dias);
  }
  rendeNoRitmo = cent(rendeNoRitmo);
  const fator = rendeNoRitmo > 0 ? falta / rendeNoRitmo : 0;

  const linhas: LinhaDiaSemana[] = [];
  for (let w = 1; w <= 6; w++) {
    const s = somas.get(w);
    const n = restantes.get(w) ?? 0;
    if (!s || n === 0) continue;
    const mediaReceita = s.receita / s.dias;
    const mediaPagamentos = s.pagamentos / s.dias;
    linhas.push({
      diaSemana: w,
      nome: NOME_DIA_SEMANA[w],
      diasRestantes: n,
      amostra: s.dias,
      atendimentosHoje: Math.round(mediaPagamentos),
      atendimentosNecessarios: Math.ceil(mediaPagamentos * fator),
      receitaNecessaria: cent(mediaReceita * fator),
      ticket: s.pagamentos > 0 ? cent(s.receita / s.pagamentos) : 0,
    });
  }

  return {
    meta: cent(p.meta),
    realizadoAteOntem: cent(p.realizadoAteOntem),
    falta,
    rendeNoRitmo,
    esforcoPercentual: rendeNoRitmo > 0 ? Math.round((fator - 1) * 100) : 0,
    linhas,
    semHistorico,
    diasRestantes,
  };
}
