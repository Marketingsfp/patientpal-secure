/**
 * FASE 7 — Camada de dados do analista de métricas da Nina.
 *
 * SOMENTE LEITURA e SEM IA. Este módulo só descreve o recorte, consolida
 * numeradores/denominadores e monta a rastreabilidade. Nada aqui altera
 * atendimento, agenda, distribuição, catálogo ou prompt da Nina.
 */
import type { RecorteResolvido } from "@/lib/nina/metricas-filtros";
import { partesNoFuso } from "@/lib/nina/metricas-filtros";

export const VERSAO_REGRAS_ANALISE = "fase7.1";

export const DIAS_SEMANA_NOME = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

export type ResumoCobertura = {
  /** Dias efetivamente incluídos no recorte (já sem os dias da semana filtrados). */
  dias: number;
  /** Quantidade de dias por dia da semana (0 = domingo). */
  porDiaSemana: Record<number, number>;
  /** Horas efetivamente incluídas (dias × duração da faixa diária). */
  horas: number;
  /** Dias do recorte que ainda não aconteceram. */
  diasFuturos: number;
  /** Verdadeiro quando o recorte inclui hoje ou datas futuras. */
  parcial: boolean;
};

/** Dia da semana (0 = domingo) de uma data AAAA-MM-DD. */
export function diaDaSemana(data: string): number {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

function dataDaJanela(inicio: string, fuso: string): string {
  const p = partesNoFuso(new Date(inicio), fuso);
  return `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

/**
 * Descreve o que o recorte realmente cobre: quantos dias, quantos sábados,
 * quantas horas e se o período ainda está em andamento.
 *
 * Dias futuros NÃO são tratados como dias com zero atendimento: eles são
 * contados à parte e o recorte é marcado como parcial.
 */
export function resumirCobertura(
  recorte: RecorteResolvido,
  diasSemana: number[] | null,
  agora: Date = new Date(),
): ResumoCobertura {
  const hoje = dataDaJanela(agora.toISOString(), recorte.fuso);
  const porDiaSemana: Record<number, number> = {};
  let dias = 0;
  let diasFuturos = 0;

  for (const janela of recorte.janelas) {
    const data = dataDaJanela(janela.inicio, recorte.fuso);
    const dow = diaDaSemana(data);
    if (diasSemana && diasSemana.length > 0 && !diasSemana.includes(dow)) continue;
    dias += 1;
    porDiaSemana[dow] = (porDiaSemana[dow] ?? 0) + 1;
    if (data >= hoje) diasFuturos += 1;
  }

  const minutosPorDia = recorte.minutoFim - recorte.minutoInicio;
  return {
    dias,
    porDiaSemana,
    horas: Number(((dias * minutosPorDia) / 60).toFixed(2)),
    diasFuturos,
    parcial: diasFuturos > 0,
  };
}

export type ParcelaTaxa = { numerador: number; denominador: number };

/**
 * Consolida a taxa de erro de vários dias/unidades: soma numeradores e
 * denominadores e só então divide. Nunca faz média das porcentagens.
 * Com denominador zero, a taxa é indisponível (null) — nunca 0%.
 */
export function consolidarTaxaErro(parcelas: ParcelaTaxa[]): {
  numerador: number;
  denominador: number;
  valor: number | null;
  formula: string;
} {
  const numerador = parcelas.reduce((s, p) => s + p.numerador, 0);
  const denominador = parcelas.reduce((s, p) => s + p.denominador, 0);
  return {
    numerador,
    denominador,
    valor: denominador > 0 ? (numerador / denominador) * 100 : null,
    formula: "erros reportados da Nina ÷ mensagens totais do sistema × 100",
  };
}

/** Média por dia efetivamente incluído. Sem dias, devolve null. */
export function mediaPorDia(total: number, dias: number): number | null {
  return dias > 0 ? total / dias : null;
}

/** Média por hora efetivamente incluída. Sem horas, devolve null. */
export function mediaPorHora(total: number, horas: number): number | null {
  return horas > 0 ? total / horas : null;
}

export type FaixaHoraria = {
  chave: string;
  nome: string;
  horaInicio: string;
  horaFim: string;
};

/**
 * Resolve uma faixa citada na pergunta ("manhã") usando SOMENTE as faixas
 * configuradas. Sem configuração, devolve null para que o analista pergunte
 * o intervalo em vez de presumir 07:00–12:00.
 */
export function resolverFaixa(nome: string, faixas: FaixaHoraria[]): FaixaHoraria | null {
  const alvo = nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const f of faixas) {
    const chave = f.chave.toLowerCase();
    const rotulo = f.nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (chave === alvo || rotulo === alvo) return f;
  }
  return null;
}

/** Descrição legível dos indicadores devolvidos, para rastreabilidade. */
export const DEFINICOES_INDICADORES: Record<string, string> = {
  mensagensTotais:
    "Todas as mensagens do sistema de atendimento no recorte (recebidas, enviadas por pessoas, pela Nina e automáticas), exceto notas internas, rascunhos e envios que falharam.",
  msgsPaciente: "Mensagens recebidas de pacientes no recorte.",
  msgsNina: "Mensagens enviadas pela Nina no recorte.",
  msgsHumano: "Mensagens enviadas por atendentes no recorte.",
  msgsAutomaticas: "Mensagens automáticas do sistema no recorte.",
  ninaEntrada:
    "Mensagens recebidas que foram efetivamente processadas pela Nina (só contabilizadas a partir da data informada em cobertura).",
  ninaSaida: "Respostas enviadas pela Nina no recorte.",
  ninaParticipacao: "Recebidas processadas pela Nina somadas às respostas enviadas por ela.",
  errosReportados:
    "Erros reportados de mensagens da Nina, atribuídos ao período da mensagem original. Reportes rejeitados ficam fora.",
  errosConfirmados: "Reportes confirmados pela revisão humana (aprovados, aplicados ou revertidos).",
  errosPendentes: "Reportes ainda sem decisão humana.",
  errosRejeitados: "Reportes rejeitados na revisão. Não entram na taxa de erro.",
  correcoesAplicadas: "Correções efetivamente aplicadas.",
  correcoesValidadas: "Correções aplicadas que passaram na validação.",
  correcoesRevertidas: "Correções que foram desfeitas.",
  errosSemVinculo: "Reportes sem mensagem vinculada; atribuídos à data do próprio reporte.",
  agendamentosNina: "Agendamentos concluídos pela Nina, pela data da conclusão.",
  encaminhamentos: "Encaminhamentos para atendimento humano iniciados pela Nina.",
};

export type ComparacaoIndicador = {
  chave: string;
  a: number;
  b: number;
  diferencaAbsoluta: number;
  /** Variação percentual de A para B. Null quando A é zero (sem base). */
  variacaoPercentual: number | null;
};

/**
 * Compara indicadores de dois períodos de forma determinística.
 * O modelo não faz aritmética: ele apenas cita estes valores.
 */
export function compararIndicadores(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): ComparacaoIndicador[] {
  const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
  const saida: ComparacaoIndicador[] = [];
  for (const chave of chaves) {
    const va = Number(a[chave]);
    const vb = Number(b[chave]);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    saida.push({
      chave,
      a: va,
      b: vb,
      diferencaAbsoluta: vb - va,
      variacaoPercentual: va === 0 ? null : ((vb - va) / va) * 100,
    });
  }
  return saida.sort((x, y) => x.chave.localeCompare(y.chave));
}

/**
 * Compara duas taxas de erro. Diferença de taxas é em PONTOS PERCENTUAIS;
 * a variação relativa é percentual. Os dois campos vêm separados de propósito.
 */
export function compararTaxas(
  a: { valor?: number | null; numerador?: number; denominador?: number } | null,
  b: { valor?: number | null; numerador?: number; denominador?: number } | null,
): {
  taxaA: number | null;
  taxaB: number | null;
  diferencaPontosPercentuais: number | null;
  variacaoPercentual: number | null;
} {
  const ta = a?.valor ?? null;
  const tb = b?.valor ?? null;
  if (ta === null || tb === null) {
    return {
      taxaA: ta,
      taxaB: tb,
      diferencaPontosPercentuais: null,
      variacaoPercentual: null,
    };
  }
  return {
    taxaA: ta,
    taxaB: tb,
    diferencaPontosPercentuais: tb - ta,
    variacaoPercentual: ta === 0 ? null : ((tb - ta) / ta) * 100,
  };
}
