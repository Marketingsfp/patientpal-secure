/**
 * FASE 5 — Regras puras de apresentação do desempenho da Nina por período
 * (dentro do horário, fora do horário, não classificável).
 *
 * Nada aqui consulta banco nem altera atendimento. São só contagens e taxas
 * com denominador explícito.
 */

export type ClassePeriodo = "DENTRO_DO_HORARIO" | "FORA_DO_HORARIO" | "NAO_CLASSIFICAVEL";
export type FiltroPeriodo = "todos" | ClassePeriodo;

export const FILTROS_PERIODO: { valor: FiltroPeriodo; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos os períodos" },
  { valor: "DENTRO_DO_HORARIO", rotulo: "Dentro do horário" },
  { valor: "FORA_DO_HORARIO", rotulo: "Fora do horário" },
  { valor: "NAO_CLASSIFICAVEL", rotulo: "Não classificável" },
];

export type ContagemTipo = { eventos: number; distintos: number };
export type Bucket = Record<string, ContagemTipo | undefined>;

export type DesempenhoPeriodo = {
  fuso: string;
  geradoEm: string | null;
  buckets: Partial<Record<ClassePeriodo, Bucket>>;
  total: Bucket;
  tempoResposta: Partial<
    Record<ClassePeriodo, { amostras: number; medianaSegundos: number | null; mediaSegundos: number | null }>
  >;
  conversas: {
    unicasTotal: number;
    iniciadas: Partial<Record<ClassePeriodo, number>>;
    comInteracao: Partial<Record<ClassePeriodo, number>>;
    observacao: string;
  };
  naoClassificavel: { eventos: number; motivos: { motivo: string; eventos: number }[] };
  versoesUtilizadas: { versaoId: string | null; versao: string | null }[];
  limitacoes: string[];
};

/** Contagem de um indicador no recorte escolhido. */
export function contagem(
  dados: DesempenhoPeriodo | null,
  filtro: FiltroPeriodo,
  tipo: string,
  campo: "eventos" | "distintos" = "eventos",
): number {
  if (!dados) return 0;
  const b = filtro === "todos" ? dados.total : (dados.buckets[filtro] ?? {});
  return b?.[tipo]?.[campo] ?? 0;
}

/**
 * Taxa com denominador explícito. Denominador zero devolve `null` — ausência
 * de dado, nunca 0% artificial.
 */
export function taxa(numerador: number, denominador: number) {
  return {
    numerador,
    denominador,
    percentual: denominador > 0 ? (numerador / denominador) * 100 : null,
  };
}

export function formatarTaxa(t: { numerador: number; denominador: number; percentual: number | null }) {
  if (t.percentual === null) return "Sem dados";
  return `${t.percentual.toFixed(1)}% (${t.numerador}/${t.denominador})`;
}

export function formatarDuracao(segundos: number | null): string {
  if (segundos === null || !Number.isFinite(segundos)) return "—";
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}min ${s % 60}s`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}min`;
}

export const MOTIVOS_ROTULO: Record<string, string> = {
  sem_calendario_publicado: "Sem horário oficial publicado",
  sem_versao_para_a_data: "Nenhuma versão do horário vale para essa data",
  dia_nao_configurado: "Dia da semana sem configuração (não é o mesmo que fechado)",
  timestamp_ausente_ou_invalido: "Data e hora do evento ausente ou inválida",
  escopo_nao_identificavel: "Clínica/unidade do evento não identificada",
  conflito_de_configuracao: "Mais de um horário oficial válido — conflito não resolvido",
};

export function rotuloMotivo(motivo: string) {
  return MOTIVOS_ROTULO[motivo] ?? motivo;
}

/** Explicações curtas exibidas junto de cada indicador. */
export const EXPLICACOES: Record<string, string> = {
  mensagem: "Todas as mensagens do atendimento, classificadas pelo horário de cada mensagem.",
  resposta_nina: "Respostas enviadas pela Nina, pelo horário de cada resposta.",
  agendamento: "Agendamentos registrados pela Nina, pelo momento da criação do registro — não pela data da consulta.",
  encaminhamento:
    "Encaminhamentos para atendente, pelo horário real do evento. Fora do expediente não é falha da Nina.",
  resposta_avaliada: "Respostas que passaram por avaliação, pelo horário da mensagem avaliada.",
  suspeita_ia: "Suspeitas apontadas pela própria IA. Não são erros comprovados.",
  erro_reportado:
    "Reportes de usuário, pelo horário da mensagem com erro. Vários reportes da mesma resposta contam uma resposta.",
  erro_confirmado: "Erros confirmados na revisão humana, pelo horário da mensagem avaliada.",
  correcao_aplicada:
    "Produtividade da revisão humana: correções aplicadas pelo horário da própria correção, não do desempenho da Nina.",
};
