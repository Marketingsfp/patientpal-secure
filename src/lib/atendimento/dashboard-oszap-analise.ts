import { diaVazio, type CampoDia } from "./dashboard-oszap";
import {
  agruparDiasDashboard,
  contarDias,
  type AgrupamentoDashboard,
  type PeriodoDashboard,
} from "./dashboard-oszap-periodos";

/**
 * Análise do Dashboard por IA (16/10/2026).
 *
 * A IA recebe SÓ os números que o dashboard já calculou para o período
 * consultado, num formato compacto: nada de paciente (os registros de
 * avaliações com nome de paciente ficam fora), nenhum id interno.
 */
export const MODELO_ANALISE_DASHBOARD = "google/gemini-3.1-flash-lite";

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

type ResumoDashboard = {
  periodo: PeriodoDashboard;
  anterior: PeriodoDashboard;
  porDia: Array<{ dia: string } & Record<CampoDia, number>>;
  porHora: Array<{ diaSemana: number; hora: number; recebidas: number }>;
  equipe: Array<{ id?: string } & Record<string, unknown>>;
  departamentos: Array<{ id?: string } & Record<string, unknown>>;
  registrosAvaliacoes?: unknown;
  [campo: string]: unknown;
};

/** Agrupa a série diária para o texto não ficar longo em períodos grandes. */
export function agrupamentoParaAnalise(periodo: PeriodoDashboard): AgrupamentoDashboard {
  const dias = contarDias(periodo);
  return dias <= 31 ? "dia" : dias <= 120 ? "semana" : "mes";
}

/** Arredonda frações e remove ids, recursivamente. */
function limpar(valor: unknown): unknown {
  if (typeof valor === "number") return Number.isInteger(valor) ? valor : Number(valor.toFixed(2));
  if (Array.isArray(valor)) return valor.map(limpar);
  if (valor && typeof valor === "object")
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .filter(([chave]) => chave !== "id")
        .map(([chave, v]) => [chave, limpar(v)]),
    );
  return valor;
}

export function dadosParaAnaliseDashboard(resumo: ResumoDashboard) {
  const {
    porDia,
    porHora,
    registrosAvaliacoes: _semPacientes,
    // Datas técnicas da consulta não ajudam a análise.
    inicio: _inicio,
    fim: _fim,
    atualizadoEm: _atualizadoEm,
    avisos,
    ...resto
  } = resumo;
  const agrupamento = agrupamentoParaAnalise(resumo.periodo);
  const serie = agruparDiasDashboard(porDia, resumo.periodo, agrupamento, diaVazio).map(
    ({ parcial: _parcial, dias: _dias, ...g }) => g,
  );
  const comMovimento = porHora.filter((h) => h.recebidas > 0);
  const porDiaSemana = DIAS_SEMANA.map((nome, i) => ({
    dia: nome,
    recebidas: comMovimento.filter((h) => h.diaSemana === i).reduce((n, h) => n + h.recebidas, 0),
  })).filter((d) => d.recebidas > 0);
  const horariosMaisMovimentados = [...comMovimento]
    .sort((a, b) => b.recebidas - a.recebidas)
    .slice(0, 5)
    .map((h) => ({ dia: DIAS_SEMANA[h.diaSemana], hora: `${h.hora}h`, recebidas: h.recebidas }));
  return limpar({
    ...resto,
    avisosDoSistema: avisos ?? [],
    serie: { agrupadaPor: agrupamento, grupos: serie },
    mensagensRecebidasPorDiaDaSemana: porDiaSemana,
    horariosMaisMovimentados,
  });
}

export const INSTRUCOES_ANALISE_DASHBOARD = [
  "Você é analista do atendimento por WhatsApp de uma clínica. Escreva em português do Brasil, em linguagem simples, para a gestão.",
  "Use SOMENTE os números do JSON recebido. Nunca invente número, nome, causa ou meta. Se um dado for null, zero ou ausente, diga que não houve registro.",
  "O JSON traz o período consultado (periodo) e o período anterior de mesmo tamanho (anterior). Em indicadores, 'atual' e 'anterior' são esses dois períodos: compare quando os dois existirem, com a diferença em número ou porcentagem.",
  "Tempos estão em minutos (Min) ou segundos (S); porcentagens vêm como fração de 0 a 1 (0,85 = 85%). Datas em AAAA-MM-DD: escreva DD/MM/AAAA.",
  "Atendentes: são só as pessoas da lista equipe. Diga quem respondeu mais rápido (menor respostaMedianaMin), quem foi melhor avaliada (maior notaMedia) e quem mais atendeu, sempre informando a quantidade de medidas ou avaliações. Com menos de 3 medidas ou avaliações, avise que a amostra é pequena e não chame de destaque.",
  "Nina é a assistente virtual; Francisco é o acompanhamento de orçamentos. Comente-os só se houver dados.",
  "Formato: títulos curtos começando com '### ' (Visão geral, Equipe, Qualidade e avaliações, Horários, Nina e Francisco, WhatsApp, Pontos de atenção) e frases ou itens começando com '- '. Pule a seção que não tiver dado. No máximo 350 palavras.",
  "Em Pontos de atenção, aponte só o que os números mostram (ex.: queda, espera alta, falhas de envio, pesquisa sem resposta). Não dê ordens nem recomendações de negócio que os números não sustentem.",
].join("\n");
