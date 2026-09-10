/**
 * FASE 7 — Denominadores, ambiente, revisão humana e resultados confirmados.
 *
 * Camada pura (sem banco, sem rede, sem modelo). Existe para que as métricas
 * de confiabilidade parem de inflar números:
 *
 *  - uma saída avaliada duas vezes (resposta + ação) conta UMA mensagem;
 *  - decisão do motor não é prova de execução (transferência, agendamento);
 *  - modo observacional (shadow) não conta como efeito aplicado;
 *  - ausência de reporte não é acerto observado;
 *  - recorte parcial (truncamento) é declarado, nunca escondido.
 */

// ---------------------------------------------------------------- ambiente

export type AmbienteCanonico =
  | "producao"
  | "homologacao"
  | "teste_automatizado"
  | "desconhecido";

const VARIANTES: Record<Exclude<AmbienteCanonico, "desconhecido">, string[]> = {
  producao: ["producao", "produção", "production", "prod", "atendimento", "live"],
  homologacao: [
    "homologacao",
    "homologação",
    "homologation",
    "homolog",
    "hml",
    "staging",
    "sandbox",
  ],
  teste_automatizado: ["teste_automatizado", "teste", "test", "automated_test", "test_console"],
};

/** Normaliza o nome de ambiente gravado no banco (schemas divergem entre tabelas). */
export function normalizarAmbiente(valor: string | null | undefined): AmbienteCanonico {
  const v = String(valor ?? "")
    .trim()
    .toLowerCase();
  if (!v) return "desconhecido";
  for (const [canonico, variantes] of Object.entries(VARIANTES)) {
    if (variantes.includes(v)) return canonico as AmbienteCanonico;
  }
  return "desconhecido";
}

/** Todos os nomes aceitos no banco para um ambiente canônico (para filtros `in`). */
export function variantesAmbiente(canonico: AmbienteCanonico): string[] {
  if (canonico === "desconhecido") return [];
  return [...VARIANTES[canonico]];
}

// -------------------------------------------------------------- estruturas

export type LinhaSaida = {
  id: string;
  created_at: string;
  ambiente?: string | null;
  conversation_id?: string | null;
  execucao_id?: string | null;
  /** Mensagem enviada (vínculo forte com a saída avaliada). */
  outgoing_message_id?: string | null;
  message_id?: string | null;
  /** "answer_confidence" | "action_safety" */
  avaliacao?: string | null;
  /** "shadow" = observacional; qualquer outro valor = decisão aplicada. */
  modo?: string | null;
  decisao?: string | null;
  acao?: string | null;
  handoff_decision?: string | null;
  /** Prova vinda do serviço de atendimento: a transferência realmente ocorreu. */
  handoff_ocorreu?: boolean | null;
  rodadas?: number | null;
  acao_solicitada?: string | null;
  resultado_final?: string | null;
};

/** Uma saída da Nina, com as avaliações que existirem sobre ela. */
export type UnidadeSaida = {
  chave: string;
  /** Chaves de vínculo úteis para cruzar com reportes humanos. */
  mensagemId: string | null;
  execucaoId: string | null;
  conversaId: string | null;
  /** true quando a única identificação possível foi o próprio id da decisão. */
  vinculoFraco: boolean;
  avaliacaoResposta: LinhaSaida | null;
  avaliacaoAcao: LinhaSaida | null;
  avaliacoes: number;
  rodadas: number;
};

export type Denominadores = {
  /** Mensagens de saída distintas (base das métricas de resposta). */
  mensagensDeSaida: number;
  avaliacoesResposta: number;
  avaliacoesAcao: number;
  avaliacoesTotais: number;
  /** Rodadas/tentativas somadas (nunca usadas como denominador de mensagens). */
  rodadas: number;
  /** Operações avaliadas (ações que pediam autorização). */
  operacoes: number;
};

const ehAcao = (l: LinhaSaida) => String(l.avaliacao ?? "").toLowerCase() === "action_safety";
const ehResposta = (l: LinhaSaida) =>
  String(l.avaliacao ?? "answer_confidence").toLowerCase() === "answer_confidence";

/** true quando a decisão foi só observacional (shadow), sem efeito aplicado. */
export function ehObservacional(l: LinhaSaida): boolean {
  return String(l.modo ?? "").toLowerCase() === "shadow";
}

function chaveDaSaida(l: LinhaSaida): { chave: string; fraca: boolean } {
  const forte = l.outgoing_message_id || l.message_id || l.execucao_id;
  if (forte) return { chave: String(forte), fraca: false };
  return { chave: `decisao:${l.id}`, fraca: true };
}

/** Agrupa as decisões por saída: duas avaliações da mesma saída viram uma unidade. */
export function agruparSaidas(linhas: LinhaSaida[]): UnidadeSaida[] {
  const mapa = new Map<string, UnidadeSaida>();
  for (const l of linhas) {
    const { chave, fraca } = chaveDaSaida(l);
    const atual =
      mapa.get(chave) ??
      ({
        chave,
        mensagemId: null,
        execucaoId: null,
        conversaId: null,
        vinculoFraco: fraca,
        avaliacaoResposta: null,
        avaliacaoAcao: null,
        avaliacoes: 0,
        rodadas: 0,
      } satisfies UnidadeSaida);

    atual.mensagemId = atual.mensagemId ?? l.outgoing_message_id ?? l.message_id ?? null;
    atual.execucaoId = atual.execucaoId ?? l.execucao_id ?? null;
    atual.conversaId = atual.conversaId ?? l.conversation_id ?? null;
    atual.avaliacoes += 1;
    atual.rodadas += Number.isFinite(l.rodadas) ? Number(l.rodadas) : 0;
    if (ehAcao(l)) atual.avaliacaoAcao = atual.avaliacaoAcao ?? l;
    else if (ehResposta(l)) atual.avaliacaoResposta = atual.avaliacaoResposta ?? l;
    mapa.set(chave, atual);
  }
  return [...mapa.values()];
}

export function calcularDenominadores(linhas: LinhaSaida[]): Denominadores {
  const unidades = agruparSaidas(linhas);
  return {
    mensagensDeSaida: unidades.length,
    avaliacoesResposta: linhas.filter(ehResposta).length,
    avaliacoesAcao: linhas.filter(ehAcao).length,
    avaliacoesTotais: linhas.length,
    rodadas: unidades.reduce((s, u) => s + u.rodadas, 0),
    operacoes: linhas.filter((l) => ehAcao(l) && Boolean(l.acao_solicitada)).length,
  };
}

// -------------------------------------------------------- revisão humana

export type StatusRevisao =
  | "NAO_REVISADA"
  | "REVISADA_CORRETA"
  | "ERRO_REPORTADO"
  | "ERRO_CONFIRMADO"
  | "REPORTE_DESCARTADO"
  | "LEGADO_SEM_VINCULO";

export type ReporteRevisao = {
  id: string;
  conversa_id: string | null;
  mensagem_id: string | null;
  execucao_id: string | null;
  status: string | null;
  created_at: string;
  categoria?: string | null;
};

const CONFIRMADOS = new Set([
  "approved",
  "aprovado",
  "confirmado",
  "aplicado",
  "validado",
  "corrigido",
]);
const DESCARTADOS = new Set(["rejected", "rejeitado", "descartado", "invalido", "improcedente"]);

export function classificarStatusReporte(
  status: string | null | undefined,
): "ERRO_CONFIRMADO" | "REPORTE_DESCARTADO" | "ERRO_REPORTADO" {
  const s = String(status ?? "").toLowerCase();
  if (CONFIRMADOS.has(s)) return "ERRO_CONFIRMADO";
  if (DESCARTADOS.has(s)) return "REPORTE_DESCARTADO";
  return "ERRO_REPORTADO";
}

export type IndiceRevisao = {
  porMensagem: Map<string, ReporteRevisao[]>;
  porExecucao: Map<string, ReporteRevisao[]>;
  /** Só reportes legados: sem mensagem e sem execução. */
  porConversaLegado: Map<string, ReporteRevisao[]>;
  /** Saídas explicitamente revisadas e consideradas corretas por uma pessoa. */
  revisadasCorretas: Set<string>;
};

export function indexarRevisoes(
  reportes: ReporteRevisao[],
  revisadasCorretas: string[] = [],
): IndiceRevisao {
  const porMensagem = new Map<string, ReporteRevisao[]>();
  const porExecucao = new Map<string, ReporteRevisao[]>();
  const porConversaLegado = new Map<string, ReporteRevisao[]>();
  const push = (m: Map<string, ReporteRevisao[]>, k: string, r: ReporteRevisao) => {
    const arr = m.get(k) ?? [];
    arr.push(r);
    m.set(k, arr);
  };
  for (const r of reportes) {
    if (r.mensagem_id) push(porMensagem, r.mensagem_id, r);
    else if (r.execucao_id) push(porExecucao, r.execucao_id, r);
    else if (r.conversa_id) push(porConversaLegado, r.conversa_id, r);
  }
  return {
    porMensagem,
    porExecucao,
    porConversaLegado,
    revisadasCorretas: new Set(revisadasCorretas),
  };
}

/**
 * Classificação da revisão humana de UMA saída. Ausência de reporte é
 * "não revisada" — nunca acerto observado. Reporte ligado apenas à conversa
 * fica isolado como legado, sem contaminar todas as respostas do diálogo.
 */
export function classificarRevisao(u: UnidadeSaida, idx: IndiceRevisao): StatusRevisao {
  const diretos = [
    ...(u.mensagemId ? (idx.porMensagem.get(u.mensagemId) ?? []) : []),
    ...(u.execucaoId ? (idx.porExecucao.get(u.execucaoId) ?? []) : []),
  ];
  if (diretos.length > 0) {
    const classes = diretos.map((r) => classificarStatusReporte(r.status));
    if (classes.includes("ERRO_CONFIRMADO")) return "ERRO_CONFIRMADO";
    if (classes.includes("ERRO_REPORTADO")) return "ERRO_REPORTADO";
    return "REPORTE_DESCARTADO";
  }
  if (u.mensagemId && idx.revisadasCorretas.has(u.mensagemId)) return "REVISADA_CORRETA";
  if (u.conversaId && (idx.porConversaLegado.get(u.conversaId)?.length ?? 0) > 0)
    return "LEGADO_SEM_VINCULO";
  return "NAO_REVISADA";
}

export type ResumoRevisao = Record<StatusRevisao, number> & { total: number };

export function resumirRevisao(unidades: UnidadeSaida[], idx: IndiceRevisao): ResumoRevisao {
  const base: ResumoRevisao = {
    total: unidades.length,
    NAO_REVISADA: 0,
    REVISADA_CORRETA: 0,
    ERRO_REPORTADO: 0,
    ERRO_CONFIRMADO: 0,
    REPORTE_DESCARTADO: 0,
    LEGADO_SEM_VINCULO: 0,
  };
  for (const u of unidades) base[classificarRevisao(u, idx)] += 1;
  return base;
}

// ------------------------------------------------------------------ acerto

/** Mínimo de saídas revisadas para publicar uma taxa de acerto. */
export const AMOSTRA_MINIMA_ACERTO = 20;

export type AcertoObservado = {
  disponivel: boolean;
  /** Saídas com revisão humana conclusiva. */
  revisadas: number;
  /** Saídas no recorte. */
  total: number;
  /** revisadas / total, em %. */
  cobertura: number;
  acertos: number;
  errosConfirmados: number;
  /** % de acerto entre as revisadas; null quando indisponível. */
  taxaAcerto: number | null;
  motivo?: string;
};

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * Acerto só é calculado sobre itens revisados, com critério explícito:
 * acerto = revisada correta + reporte descartado; erro = erro confirmado.
 * Reporte ainda pendente não conta como acerto nem como erro.
 */
export function calcularAcertoObservado(
  unidades: UnidadeSaida[],
  idx: IndiceRevisao,
  amostraMinima = AMOSTRA_MINIMA_ACERTO,
): AcertoObservado {
  const r = resumirRevisao(unidades, idx);
  const acertos = r.REVISADA_CORRETA + r.REPORTE_DESCARTADO;
  const revisadas = acertos + r.ERRO_CONFIRMADO;
  const base = {
    revisadas,
    total: r.total,
    cobertura: pct(revisadas, r.total),
    acertos,
    errosConfirmados: r.ERRO_CONFIRMADO,
  };
  if (revisadas < amostraMinima) {
    return {
      ...base,
      disponivel: false,
      taxaAcerto: null,
      motivo: `Revisão insuficiente: ${revisadas} de ${amostraMinima} saídas revisadas.`,
    };
  }
  return { ...base, disponivel: true, taxaAcerto: pct(acertos, revisadas) };
}

// ------------------------------------------------ resultados confirmados

/** Prova de agendamento vinda da agenda (não da decisão do motor). */
export type ProvaAgendamento = {
  conversa_id: string | null;
  agendamento_id: string;
  /** true quando o registro foi encontrado na agenda. */
  existeNaAgenda: boolean;
};

/** Prova de transferência vinda do atendimento. */
export type ProvaTransferencia = { conversa_id: string; houveHandoff: boolean };

export type ResultadosConfirmados = {
  /** O motor recomendou transferir (inclui shadow). */
  transferenciasRecomendadas: number;
  /** Recomendações apenas observacionais (shadow) — não são atendimento transferido. */
  transferenciasEmObservacao: number;
  /** Recomendações efetivamente aplicadas pelo runtime. */
  transferenciasAplicadas: number;
  /** Confirmadas pelo serviço de atendimento (handoff registrado). */
  transferenciasConfirmadas: number;
  /** Aplicadas sem prova de execução no atendimento. */
  transferenciasSemProva: number;
  agendamentosConfirmados: number;
  agendamentosSemProva: number;
  /** Falhas operacionais observadas (ferramenta/execução com erro). */
  falhasOperacionais: number;
};

const RECOMENDA_HANDOFF = new Set(["HANDOFF", "transferir", "transferido_para_humano"]);

function recomendouHandoff(l: LinhaSaida): boolean {
  const d = String(l.handoff_decision ?? l.decisao ?? l.acao ?? "");
  return RECOMENDA_HANDOFF.has(d) || d.toUpperCase() === "HANDOFF";
}

export function calcularResultadosConfirmados(
  linhas: LinhaSaida[],
  provasTransferencia: ProvaTransferencia[] = [],
  provasAgendamento: ProvaAgendamento[] = [],
  falhasOperacionais = 0,
): ResultadosConfirmados {
  const handoffPorConversa = new Map(
    provasTransferencia.map((p) => [p.conversa_id, p.houveHandoff]),
  );

  let recomendadas = 0;
  let shadow = 0;
  let aplicadas = 0;
  let confirmadas = 0;

  for (const u of agruparSaidas(linhas)) {
    const l = u.avaliacaoAcao ?? u.avaliacaoResposta;
    if (!l || !recomendouHandoff(l)) continue;
    recomendadas += 1;
    if (ehObservacional(l)) {
      shadow += 1;
      continue;
    }
    aplicadas += 1;
    const provaLinha = l.handoff_ocorreu === true;
    const provaConversa = u.conversaId ? handoffPorConversa.get(u.conversaId) === true : false;
    if (provaLinha || provaConversa) confirmadas += 1;
  }

  const agendamentosConfirmados = provasAgendamento.filter((p) => p.existeNaAgenda).length;

  return {
    transferenciasRecomendadas: recomendadas,
    transferenciasEmObservacao: shadow,
    transferenciasAplicadas: aplicadas,
    transferenciasConfirmadas: confirmadas,
    transferenciasSemProva: aplicadas - confirmadas,
    agendamentosConfirmados,
    agendamentosSemProva: provasAgendamento.length - agendamentosConfirmados,
    falhasOperacionais,
  };
}

// ------------------------------------------------------------ truncamento

export type Amostra = {
  /** Linhas efetivamente lidas. */
  lidas: number;
  /** Teto de leitura aplicado. */
  limite: number;
  /** true quando o recorte é parcial. */
  truncado: boolean;
  /** Mensagens de saída distintas na amostra. */
  mensagensDeSaida: number;
};

export function descreverAmostra(
  lidas: number,
  limite: number,
  mensagensDeSaida: number,
): Amostra {
  return { lidas, limite, truncado: lidas >= limite, mensagensDeSaida };
}
