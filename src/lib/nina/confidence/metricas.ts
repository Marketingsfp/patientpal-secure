/**
 * FASE 6 — Métricas de confiabilidade da Nina.
 *
 * Camada pura: recebe as decisões já lidas do banco (e os erros reportados
 * manualmente) e devolve os indicadores. Não acessa banco, rede nem modelo,
 * e não altera nenhum indicador existente do módulo de Métricas.
 *
 * Nada aqui expõe texto do paciente: só códigos, contagens e médias.
 */

import {
  agruparSaidas,
  calcularAcertoObservado,
  calcularDenominadores,
  calcularResultadosConfirmados,
  descreverAmostra,
  indexarRevisoes,
  resumirRevisao,
  type AcertoObservado,
  type Amostra,
  type Denominadores,
  type LinhaSaida,
  type ProvaAgendamento,
  type ProvaTransferencia,
  type ReporteRevisao,
  type ResultadosConfirmados,
  type ResumoRevisao,
} from "./denominadores";

export type PeriodoOperacao = "DENTRO_DO_HORARIO" | "FORA_DO_HORARIO" | "NAO_CLASSIFICAVEL";

/** Linha de decisão já enriquecida com data local e período de operação. */
export type LinhaDecisaoMetrica = {
  id: string;
  created_at: string;
  ambiente: string | null;
  conversation_id: string | null;
  /** Execução da Nina que produziu a mensagem (vínculo exato com o reporte). */
  execucao_id?: string | null;
  /** FASE 6 — mensagem da Nina efetivamente enviada (vínculo principal). */
  message_id?: string | null;
  /** FASE 7 — mensagem de saída persistida (vínculo mais forte que message_id). */
  outgoing_message_id?: string | null;
  /** FASE 7 — "answer_confidence" | "action_safety". */
  avaliacao?: string | null;
  /** FASE 7 — "shadow" quando a decisão é apenas observacional. */
  modo?: string | null;
  /** FASE 7 — prova de que a transferência realmente ocorreu. */
  handoff_ocorreu?: boolean | null;
  handoff_decision?: string | null;
  acao_solicitada?: string | null;
  resultado_final?: string | null;
  rodadas?: number | null;
  score: number;
  nivel: string | null;
  decisao: string | null;
  acao: string | null;
  intencao: string | null;
  categorias: string[];
  bloqueadores: string[];
  reason_codes: string[];
  validadores: Array<{ validator: string; status: string; reasonCode?: string | null }>;
  ferramentas: Array<{ nome: string; sucesso: boolean }>;
  /** AAAA-MM-DD no fuso da operação. */
  data_local: string | null;
  /** 0 = domingo … 6 = sábado, no fuso da operação. */
  dia_semana: number | null;
  periodo: PeriodoOperacao;
};

export type ErroReportado = {
  id: string;
  conversa_id: string | null;
  /** Execução exata reportada, quando o reporte guardou esse vínculo. */
  execucao_id?: string | null;
  /** FASE 6 — mensagem exata reportada, quando o reporte guardou esse vínculo. */
  mensagem_id?: string | null;
  created_at: string;
  categoria: string | null;
};

/** FASE 6 — calibração: confiança declarada × erro efetivamente reportado. */
export type CalibracaoNivel = {
  nivel: "HIGH" | "MEDIUM" | "LOW";
  rotulo: string;
  mensagens: number;
  erros: number;
  /** Percentual com uma casa decimal (0 quando não há mensagens). */
  taxaErro: number;
};

/** FASE 8 — calibração empírica por faixa de score. */
export type FaixaScore = {
  id: string;
  rotulo: string;
  min: number;
  max: number;
  mensagens: number;
  erros: number;
  /** Percentual com uma casa decimal (0 quando não há mensagens). */
  taxaErro: number;
};

export type CalibracaoPorFaixaScore = {
  faixas: FaixaScore[];
  /** Faixas com pelo menos uma mensagem, da menor confiança para a maior. */
  faixasComDados: number;
  /**
   * A taxa de erro cai (ou empata) conforme a confiança sobe, considerando
   * apenas faixas com dados. `null` quando há menos de duas faixas com dados.
   */
  monotonica: boolean | null;
  /** Faixas onde a taxa de erro subiu em relação à faixa de confiança menor. */
  inversoes: { de: string; para: string; taxaDe: number; taxaPara: number }[];
};

/** FASE 9 — calibração por tipo de pergunta (valores, agenda, exame...). */
export type CalibracaoTipo = {
  tipo: string;
  mensagens: number;
  mensagensAlta: number;
  erros: number;
  errosAlta: number;
  taxaErro: number;
  taxaErroAlta: number;
};

export type Contagem = { chave: string; total: number };
export type MediaGrupo = { chave: string; total: number; scoreMedio: number; baixa: number };

export type FaixaCorrelacao = {
  faixa: "alta" | "media" | "baixa";
  rotulo: string;
  decisoes: number;
  conversasComErro: number;
  taxaErro: number;
};

/**
 * FASE 7 — HIGH_CONFIDENCE_ERROR.
 *
 * Resposta que o motor classificou como ALTA confiança e que, mesmo assim, foi
 * reportada como erro pela equipe. É o caso mais grave: o sistema não sinalizou
 * incerteza nenhuma, então o problema tende a estar na fonte, no validador, na
 * regra, no peso, na identificação da entidade, na ferramenta ou na própria
 * arquitetura de confiança.
 */
export const CLASSIFICACAO_ALTA_CONFIANCA_ERRO = "HIGH_CONFIDENCE_ERROR" as const;

export type AltaConfiancaComErro = {
  classificacao: typeof CLASSIFICACAO_ALTA_CONFIANCA_ERRO;
  /** Respostas de alta confiança reportadas como erro. */
  casos: number;
  /** Total de respostas de alta confiança no recorte. */
  mensagensAlta: number;
  /** Percentual das respostas de alta confiança que viraram erro. */
  taxa: number;
  /** Participação desses casos no total de erros vinculados no recorte. */
  participacaoNosErros: number;
  scoreMedio: number;
  /** Onde investigar primeiro — só nos casos HIGH_CONFIDENCE_ERROR. */
  fontesProvaveis: {
    validadores: Contagem[];
    ferramentas: Contagem[];
    tiposAtendimento: Contagem[];
    motivos: Contagem[];
  };
};

export type OpcoesMetricas = {
  /** Reportes humanos com status, para separar revisão de ausência de revisão. */
  reportes?: ReporteRevisao[];
  /** Saídas revisadas por uma pessoa e consideradas corretas. */
  revisadasCorretas?: string[];
  provasTransferencia?: ProvaTransferencia[];
  provasAgendamento?: ProvaAgendamento[];
  falhasOperacionais?: number;
  /** Teto de leitura aplicado na consulta (para declarar truncamento). */
  limiteLeitura?: number;
};

export type MetricasConfiabilidade = {
  total: number;
  /** FASE 7 — denominadores separados: mensagens, avaliações, rodadas, operações. */
  denominadores: Denominadores;
  /** FASE 7 — estados de revisão humana por saída. */
  revisao: ResumoRevisao;
  /** FASE 7 — acerto só sobre itens revisados, com cobertura e amostra. */
  acerto: AcertoObservado;
  /** FASE 7 — resultados confirmados pelos serviços (não pela decisão do motor). */
  resultados: ResultadosConfirmados;
  /** FASE 7 — tamanho da amostra e indicação de recorte parcial. */
  amostra: Amostra;
  scoreMedio: number;
  distribuicao: { HIGH: number; MEDIUM: number; LOW: number };
  handoffsBaixaConfianca: number;
  esclarecimentos: number;
  respostasLiberadas: number;
  acoesBloqueadas: number;
  bloqueadores: number;
  motivosBaixaConfianca: Contagem[];
  ferramentasComFalha: Contagem[];
  informacoesAusentes: Contagem[];
  validadoresQueProvocamHandoff: Contagem[];
  porTipoAtendimento: MediaGrupo[];
  porDia: MediaGrupo[];
  porDiaSemana: MediaGrupo[];
  porPeriodoOperacao: MediaGrupo[];
  correlacaoErros: FaixaCorrelacao[];
  calibracaoPorNivel: CalibracaoNivel[];
  calibracaoPorFaixaScore: CalibracaoPorFaixaScore;
  calibracaoPorTipo: CalibracaoTipo[];
  altaConfiancaComErro: AltaConfiancaComErro;
};

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const NOME_DIA_SEMANA = (d: number): string => DIAS[d] ?? String(d);

/** Nível efetivo: usa o campo gravado; se faltar, deriva do score. */
export function nivelDa(l: Pick<LinhaDecisaoMetrica, "nivel" | "score">): "HIGH" | "MEDIUM" | "LOW" {
  const n = (l.nivel ?? "").toUpperCase();
  if (n === "HIGH" || n === "MEDIUM" || n === "LOW") return n;
  if (l.score >= 90) return "HIGH";
  if (l.score >= 75) return "MEDIUM";
  return "LOW";
}

/** Decisão efetiva, tolerando os registros antigos gravados em português. */
export function decisaoDa(l: Pick<LinhaDecisaoMetrica, "decisao" | "acao">): string {
  const d = (l.decisao ?? "").toUpperCase();
  if (d) return d;
  const a = (l.acao ?? "").toLowerCase();
  if (a === "responder") return "ALLOW";
  if (a === "esclarecer") return "CLARIFY";
  if (a === "transferir") return "HANDOFF";
  return "";
}

const PADROES_AUSENCIA = ["MISSING", "AUSENTE", "SEM_", "NOT_FOUND", "NAO_ENCONTRAD", "UNCONFIRMED"];

function ehAusencia(code: string): boolean {
  const c = code.toUpperCase();
  return PADROES_AUSENCIA.some((p) => c.includes(p));
}

function somar(mapa: Map<string, number>, chave: string, n = 1) {
  if (!chave) return;
  mapa.set(chave, (mapa.get(chave) ?? 0) + n);
}

function ordenar(mapa: Map<string, number>): Contagem[] {
  return [...mapa.entries()]
    .map(([chave, total]) => ({ chave, total }))
    .sort((a, b) => b.total - a.total || a.chave.localeCompare(b.chave));
}

type Acumulador = { total: number; soma: number; baixa: number };

function acumular(mapa: Map<string, Acumulador>, chave: string, score: number, baixa: boolean) {
  const atual = mapa.get(chave) ?? { total: 0, soma: 0, baixa: 0 };
  atual.total += 1;
  atual.soma += score;
  if (baixa) atual.baixa += 1;
  mapa.set(chave, atual);
}

function medias(mapa: Map<string, Acumulador>, ordenarPorChave = false): MediaGrupo[] {
  const lista = [...mapa.entries()].map(([chave, a]) => ({
    chave,
    total: a.total,
    scoreMedio: a.total ? Math.round((a.soma / a.total) * 10) / 10 : 0,
    baixa: a.baixa,
  }));
  return ordenarPorChave
    ? lista.sort((a, b) => a.chave.localeCompare(b.chave))
    : lista.sort((a, b) => b.total - a.total || a.chave.localeCompare(b.chave));
}

const JANELA_ERRO_MS = 48 * 60 * 60 * 1000;

/**
 * Correlação com erros reportados manualmente: uma decisão conta como
 * "seguida de erro" quando a mesma conversa recebeu um reporte manual
 * até 48h depois da decisão.
 */
function correlacionar(
  linhas: LinhaDecisaoMetrica[],
  erros: ErroReportado[],
): FaixaCorrelacao[] {
  const porConversa = new Map<string, number[]>();
  for (const e of erros) {
    if (!e.conversa_id) continue;
    const t = Date.parse(e.created_at);
    if (Number.isNaN(t)) continue;
    const arr = porConversa.get(e.conversa_id) ?? [];
    arr.push(t);
    porConversa.set(e.conversa_id, arr);
  }

  const faixas: Array<{ faixa: FaixaCorrelacao["faixa"]; rotulo: string; teste: (s: number) => boolean }> = [
    { faixa: "alta", rotulo: "Acima de 90%", teste: (s) => s >= 90 },
    { faixa: "media", rotulo: "Entre 75% e 89%", teste: (s) => s >= 75 && s < 90 },
    { faixa: "baixa", rotulo: "Abaixo de 75%", teste: (s) => s < 75 },
  ];

  return faixas.map((f) => {
    const decisoes = linhas.filter((l) => f.teste(l.score));
    let comErro = 0;
    for (const l of decisoes) {
      const t = Date.parse(l.created_at);
      const marcas = l.conversation_id ? porConversa.get(l.conversation_id) : undefined;
      if (!marcas || Number.isNaN(t)) continue;
      if (marcas.some((m) => m >= t && m - t <= JANELA_ERRO_MS)) comErro += 1;
    }
    return {
      faixa: f.faixa,
      rotulo: f.rotulo,
      decisoes: decisoes.length,
      conversasComErro: comErro,
      taxaErro: decisoes.length ? Math.round((comErro / decisoes.length) * 1000) / 10 : 0,
    };
  });
}

const ROTULO_NIVEL: Record<CalibracaoNivel["nivel"], string> = {
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
};

/**
 * Calibração por nível de confiança: quantas mensagens a Nina produziu em cada
 * nível e quantas dessas foram reportadas como erro.
 *
 * O vínculo preferencial é exato (mesma execução). Quando o reporte não guardou
 * a execução, cai para o vínculo por conversa dentro de 48h — o mesmo critério
 * já usado na correlação por faixa. Nenhum valor é estimado ou fixo.
 */
type IndiceErros = {
  execucoes: Set<string>;
  mensagens: Set<string>;
  porConversa: Map<string, number[]>;
};

/**
 * Índice de reportes. FASE 6: o vínculo é por mensagem ou execução. A conversa
 * só entra para reportes LEGADOS, que não guardaram nenhum dos dois — assim um
 * erro isolado não contamina todas as respostas daquela conversa.
 */
export function indexarErros(erros: ErroReportado[]): IndiceErros {
  const execucoes = new Set<string>();
  const mensagens = new Set<string>();
  const porConversa = new Map<string, number[]>();
  for (const e of erros) {
    if (e.mensagem_id) mensagens.add(e.mensagem_id);
    if (e.execucao_id) execucoes.add(e.execucao_id);
    if (!e.execucao_id && !e.mensagem_id && e.conversa_id) {
      const t = Date.parse(e.created_at);
      if (Number.isNaN(t)) continue;
      const arr = porConversa.get(e.conversa_id) ?? [];
      arr.push(t);
      porConversa.set(e.conversa_id, arr);
    }
  }
  return { execucoes, mensagens, porConversa };
}

/** A resposta avaliada foi reportada como erro depois? */
export function foiReportadaComoErro(l: LinhaDecisaoMetrica, idx: IndiceErros): boolean {
  if (l.message_id && idx.mensagens.has(l.message_id)) return true;
  if (l.execucao_id && idx.execucoes.has(l.execucao_id)) return true;
  if (!l.conversation_id) return false;
  const marcas = idx.porConversa.get(l.conversation_id);
  const t = Date.parse(l.created_at);
  if (!marcas || Number.isNaN(t)) return false;
  return marcas.some((m) => m >= t && m - t <= JANELA_ERRO_MS);
}

export function calcularCalibracaoPorNivel(
  linhas: LinhaDecisaoMetrica[],
  erros: ErroReportado[] = [],
): CalibracaoNivel[] {
  const idx = indexarErros(erros);

  const base: Record<CalibracaoNivel["nivel"], { mensagens: number; erros: number }> = {
    HIGH: { mensagens: 0, erros: 0 },
    MEDIUM: { mensagens: 0, erros: 0 },
    LOW: { mensagens: 0, erros: 0 },
  };

  for (const l of linhas) {
    const nivel = nivelDa({ nivel: l.nivel, score: Number.isFinite(l.score) ? l.score : 0 });
    base[nivel].mensagens += 1;
    if (foiReportadaComoErro(l, idx)) base[nivel].erros += 1;
  }

  return (["HIGH", "MEDIUM", "LOW"] as const).map((nivel) => {
    const { mensagens, erros: qtd } = base[nivel];
    return {
      nivel,
      rotulo: ROTULO_NIVEL[nivel],
      mensagens,
      erros: qtd,
      taxaErro: mensagens ? Math.round((qtd / mensagens) * 1000) / 10 : 0,
    };
  });
}

/** FASE 6 — faixas pedidas para comparar score previsto e acerto observado. */
export type FaixaCalibracao = {
  id: string;
  rotulo: string;
  mensagens: number;
  erros: number;
  /** Média dos scores da faixa (o que o motor previu). */
  scorePrevisto: number;
  /** % de respostas sem erro confirmado (o que foi observado). */
  acertoObservado: number;
  /** acertoObservado − scorePrevisto: negativo = superconfiança. */
  desvio: number;
};

const FAIXAS_CALIBRACAO: { id: string; rotulo: string; min: number; max: number }[] = [
  { id: "90-99", rotulo: "90–99%", min: 90, max: 100 },
  { id: "75-89", rotulo: "75–89%", min: 75, max: 89 },
  { id: "50-74", rotulo: "50–74%", min: 50, max: 74 },
  { id: "0-49", rotulo: "0–49%", min: 0, max: 49 },
];

/**
 * FASE 6 — High Confidence Error Rate: proporção de respostas classificadas
 * como alta confiança que depois tiveram erro confirmado.
 */
export function calcularTaxaErroAltaConfianca(
  linhas: LinhaDecisaoMetrica[],
  erros: ErroReportado[] = [],
): { mensagens: number; erros: number; taxa: number } {
  const idx = indexarErros(erros);
  let mensagens = 0;
  let qtd = 0;
  for (const l of linhas) {
    const nivel = nivelDa({ nivel: l.nivel, score: Number.isFinite(l.score) ? l.score : 0 });
    if (nivel !== "HIGH") continue;
    mensagens += 1;
    if (foiReportadaComoErro(l, idx)) qtd += 1;
  }
  return { mensagens, erros: qtd, taxa: mensagens ? Math.round((qtd / mensagens) * 1000) / 10 : 0 };
}

/** FASE 6 — previsto x observado nas faixas 90–99, 75–89, 50–74 e 0–49. */
export function calcularCalibracaoPorFaixa(
  linhas: LinhaDecisaoMetrica[],
  erros: ErroReportado[] = [],
): FaixaCalibracao[] {
  const idx = indexarErros(erros);
  return FAIXAS_CALIBRACAO.map((f) => {
    const doGrupo = linhas.filter((l) => {
      const s = Number.isFinite(l.score) ? l.score : 0;
      return s >= f.min && s <= f.max;
    });
    const qtdErros = doGrupo.filter((l) => foiReportadaComoErro(l, idx)).length;
    const mensagens = doGrupo.length;
    const scorePrevisto = mensagens
      ? Math.round((doGrupo.reduce((s, l) => s + (Number.isFinite(l.score) ? l.score : 0), 0) / mensagens) * 10) / 10
      : 0;
    const acertoObservado = mensagens
      ? Math.round(((mensagens - qtdErros) / mensagens) * 1000) / 10
      : 0;
    return {
      id: f.id,
      rotulo: f.rotulo,
      mensagens,
      erros: qtdErros,
      scorePrevisto,
      acertoObservado,
      desvio: mensagens ? Math.round((acertoObservado - scorePrevisto) * 10) / 10 : 0,
    };
  });
}

const FAIXAS_SCORE: { id: string; rotulo: string; min: number; max: number }[] = [
  { id: "0-59", rotulo: "0–59%", min: 0, max: 59 },
  { id: "60-69", rotulo: "60–69%", min: 60, max: 69 },
  { id: "70-79", rotulo: "70–79%", min: 70, max: 79 },
  { id: "80-89", rotulo: "80–89%", min: 80, max: 89 },
  { id: "90-94", rotulo: "90–94%", min: 90, max: 94 },
  { id: "95-100", rotulo: "95–100%", min: 95, max: 100 },
];

/**
 * FASE 8 — calibração real: agrupa as respostas por faixa de confiança e mede a
 * taxa de erro efetivamente reportada em cada faixa. Serve para verificar
 * empiricamente se quanto maior a confiança, menor a taxa de erro. Nenhum valor
 * é fixo ou estimado: tudo vem dos registros do recorte.
 */
export function calcularCalibracaoPorFaixaScore(
  linhas: LinhaDecisaoMetrica[],
  erros: ErroReportado[] = [],
): CalibracaoPorFaixaScore {
  const idx = indexarErros(erros);
  const base = FAIXAS_SCORE.map((f) => ({ ...f, mensagens: 0, erros: 0, taxaErro: 0 }));

  for (const l of linhas) {
    const score = Number.isFinite(l.score) ? Math.max(0, Math.min(100, Math.round(l.score))) : 0;
    const faixa = base.find((f) => score >= f.min && score <= f.max);
    if (!faixa) continue;
    faixa.mensagens += 1;
    if (foiReportadaComoErro(l, idx)) faixa.erros += 1;
  }

  for (const f of base) {
    f.taxaErro = f.mensagens ? Math.round((f.erros / f.mensagens) * 1000) / 10 : 0;
  }

  const comDados = base.filter((f) => f.mensagens > 0);
  const inversoes: CalibracaoPorFaixaScore["inversoes"] = [];
  for (let i = 1; i < comDados.length; i += 1) {
    const anterior = comDados[i - 1]!;
    const atual = comDados[i]!;
    if (atual.taxaErro > anterior.taxaErro) {
      inversoes.push({
        de: anterior.rotulo,
        para: atual.rotulo,
        taxaDe: anterior.taxaErro,
        taxaPara: atual.taxaErro,
      });
    }
  }

  return {
    faixas: base,
    faixasComDados: comDados.length,
    monotonica: comDados.length < 2 ? null : inversoes.length === 0,
    inversoes,
  };
}

/**
 * FASE 7 — recorte dedicado aos casos HIGH_CONFIDENCE_ERROR, com as pistas
 * observáveis (validadores usados, ferramentas, tipo de atendimento e motivos
 * registrados) para priorizar a melhoria do sistema. Nada é estimado.
 */
export function calcularAltaConfiancaComErro(
  linhas: LinhaDecisaoMetrica[],
  erros: ErroReportado[] = [],
): AltaConfiancaComErro {
  const idx = indexarErros(erros);
  const validadores = new Map<string, number>();
  const ferramentas = new Map<string, number>();
  const tipos = new Map<string, number>();
  const motivos = new Map<string, number>();

  let mensagensAlta = 0;
  let casos = 0;
  let soma = 0;
  let errosTotais = 0;

  for (const l of linhas) {
    const score = Number.isFinite(l.score) ? l.score : 0;
    const nivel = nivelDa({ nivel: l.nivel, score });
    const alta = nivel === "HIGH";
    if (alta) mensagensAlta += 1;

    if (!foiReportadaComoErro(l, idx)) continue;
    errosTotais += 1;
    if (!alta) continue;

    casos += 1;
    soma += score;
    for (const v of l.validadores) somar(validadores, v.validator);
    for (const f of l.ferramentas) somar(ferramentas, f.nome);
    const cats = l.categorias.length > 0 ? l.categorias : [l.intencao || "nao_classificado"];
    for (const c of cats) somar(tipos, c);
    for (const c of l.reason_codes) somar(motivos, c);
    for (const b of l.bloqueadores) somar(motivos, b);
  }

  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

  return {
    classificacao: CLASSIFICACAO_ALTA_CONFIANCA_ERRO,
    casos,
    mensagensAlta,
    taxa: pct(casos, mensagensAlta),
    participacaoNosErros: pct(casos, errosTotais),
    scoreMedio: casos ? Math.round((soma / casos) * 10) / 10 : 0,
    fontesProvaveis: {
      validadores: ordenar(validadores),
      ferramentas: ordenar(ferramentas),
      tiposAtendimento: ordenar(tipos),
      motivos: ordenar(motivos),
    },
  };
}

/**
 * FASE 9 — mesma leitura de calibração, mas por tipo de pergunta, para responder
 * se há excesso de confiança em um assunto específico (valores, agenda, exame).
 * Todos os números vêm dos registros; nada é estimado.
 */
export function calcularCalibracaoPorTipo(
  linhas: LinhaDecisaoMetrica[],
  erros: ErroReportado[] = [],
): CalibracaoTipo[] {
  const idx = indexarErros(erros);
  const base = new Map<string, CalibracaoTipo>();

  for (const l of linhas) {
    const score = Number.isFinite(l.score) ? l.score : 0;
    const alta = nivelDa({ nivel: l.nivel, score }) === "HIGH";
    const errou = foiReportadaComoErro(l, idx);
    const cats = l.categorias.length > 0 ? l.categorias : [l.intencao || "nao_classificado"];
    for (const tipo of cats) {
      const atual =
        base.get(tipo) ??
        {
          tipo,
          mensagens: 0,
          mensagensAlta: 0,
          erros: 0,
          errosAlta: 0,
          taxaErro: 0,
          taxaErroAlta: 0,
        };
      atual.mensagens += 1;
      if (alta) atual.mensagensAlta += 1;
      if (errou) {
        atual.erros += 1;
        if (alta) atual.errosAlta += 1;
      }
      base.set(tipo, atual);
    }
  }

  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  return [...base.values()]
    .map((t) => ({
      ...t,
      taxaErro: pct(t.erros, t.mensagens),
      taxaErroAlta: pct(t.errosAlta, t.mensagensAlta),
    }))
    .sort((a, b) => b.errosAlta - a.errosAlta || b.mensagens - a.mensagens);
}

export function calcularMetricasConfiabilidade(
  linhas: LinhaDecisaoMetrica[],
  erros: ErroReportado[] = [],
  opcoes: OpcoesMetricas = {},
): MetricasConfiabilidade {
  const distribuicao = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const motivos = new Map<string, number>();
  const ferramentas = new Map<string, number>();
  const ausentes = new Map<string, number>();
  const validadoresHandoff = new Map<string, number>();
  const porTipo = new Map<string, Acumulador>();
  const porDia = new Map<string, Acumulador>();
  const porDow = new Map<string, Acumulador>();
  const porPeriodo = new Map<string, Acumulador>();

  let soma = 0;
  let handoffsBaixa = 0;
  let esclarecimentos = 0;
  let liberadas = 0;
  let bloqueadas = 0;
  let totalBloqueadores = 0;

  for (const l of linhas) {
    const score = Number.isFinite(l.score) ? l.score : 0;
    soma += score;
    const nivel = nivelDa({ nivel: l.nivel, score });
    distribuicao[nivel] += 1;
    const baixa = nivel === "LOW";
    const decisao = decisaoDa(l);

    if (decisao === "CLARIFY") esclarecimentos += 1;
    if (decisao === "ALLOW") liberadas += 1;
    if (decisao === "BLOCK_ACTION") bloqueadas += 1;
    if ((decisao === "HANDOFF" || decisao === "BLOCK_ACTION") && baixa) handoffsBaixa += 1;

    totalBloqueadores += l.bloqueadores.length;
    for (const b of l.bloqueadores) somar(motivos, b);

    if (baixa || decisao === "HANDOFF" || decisao === "BLOCK_ACTION") {
      for (const c of l.reason_codes) {
        somar(motivos, c);
        if (ehAusencia(c)) somar(ausentes, c);
      }
    }

    if (decisao === "HANDOFF" || decisao === "BLOCK_ACTION") {
      for (const v of l.validadores) {
        if (v.status === "FAIL" || v.status === "BLOCK") somar(validadoresHandoff, v.validator);
      }
    }

    for (const f of l.ferramentas) {
      if (!f.sucesso) somar(ferramentas, f.nome);
    }

    const tipos = l.categorias.length > 0 ? l.categorias : [l.intencao || "nao_classificado"];
    for (const t of tipos) acumular(porTipo, t, score, baixa);

    if (l.data_local) acumular(porDia, l.data_local, score, baixa);
    if (l.dia_semana !== null && l.dia_semana >= 0 && l.dia_semana <= 6)
      acumular(porDow, NOME_DIA_SEMANA(l.dia_semana), score, baixa);
    acumular(porPeriodo, l.periodo, score, baixa);
  }

  // FASE 7 — denominadores, revisão e resultados confirmados.
  const saidas = linhas as unknown as LinhaSaida[];
  const unidades = agruparSaidas(saidas);
  const reportes: ReporteRevisao[] =
    opcoes.reportes ??
    erros.map((e) => ({
      id: e.id,
      conversa_id: e.conversa_id ?? null,
      mensagem_id: e.mensagem_id ?? null,
      execucao_id: e.execucao_id ?? null,
      status: null,
      created_at: e.created_at,
      categoria: e.categoria ?? null,
    }));
  const idxRevisao = indexarRevisoes(reportes, opcoes.revisadasCorretas ?? []);
  const limiteLeitura = opcoes.limiteLeitura ?? Number.POSITIVE_INFINITY;

  return {
    total: linhas.length,
    denominadores: calcularDenominadores(saidas),
    revisao: resumirRevisao(unidades, idxRevisao),
    acerto: calcularAcertoObservado(unidades, idxRevisao),
    resultados: calcularResultadosConfirmados(
      saidas,
      opcoes.provasTransferencia ?? [],
      opcoes.provasAgendamento ?? [],
      opcoes.falhasOperacionais ?? 0,
    ),
    amostra: descreverAmostra(linhas.length, limiteLeitura, unidades.length),
    scoreMedio: linhas.length ? Math.round((soma / linhas.length) * 10) / 10 : 0,
    distribuicao,
    handoffsBaixaConfianca: handoffsBaixa,
    esclarecimentos,
    respostasLiberadas: liberadas,
    acoesBloqueadas: bloqueadas,
    bloqueadores: totalBloqueadores,
    motivosBaixaConfianca: ordenar(motivos),
    ferramentasComFalha: ordenar(ferramentas),
    informacoesAusentes: ordenar(ausentes),
    validadoresQueProvocamHandoff: ordenar(validadoresHandoff),
    porTipoAtendimento: medias(porTipo),
    porDia: medias(porDia, true),
    porDiaSemana: medias(porDow),
    porPeriodoOperacao: medias(porPeriodo),
    correlacaoErros: correlacionar(linhas, erros),
    calibracaoPorNivel: calcularCalibracaoPorNivel(linhas, erros),
    calibracaoPorFaixaScore: calcularCalibracaoPorFaixaScore(linhas, erros),
    calibracaoPorTipo: calcularCalibracaoPorTipo(linhas, erros),
    altaConfiancaComErro: calcularAltaConfiancaComErro(linhas, erros),
  };
}
