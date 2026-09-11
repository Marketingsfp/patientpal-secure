/**
 * FASE 9 — Autoavaliação e melhoria contínua do Confidence Decision Engine.
 *
 * Camada pura (sem banco, sem rede, sem modelo). Cruza:
 *
 *   confidence_score × erro reportado × handoff × agendamento confirmado
 *   × resultado da conversa
 *
 * e devolve indicadores + PROPOSTAS de ajuste da política.
 *
 * REGRA DURA: nada aqui altera política. As propostas são sugestões que só
 * valem depois de aprovadas por uma pessoa no fluxo de revisão. Além disso,
 * nenhuma proposta pode enfraquecer bloqueadores absolutos — a segurança do
 * sistema vem dos bloqueadores objetivos, não do percentual.
 */
import { POLITICA_PADRAO, type PoliticaConfianca } from "./policy";
import { classificarStatusReporte } from "./denominadores";
import { separarAvaliacoes } from "./escopo-metricas";

export type LinhaCalibracao = {
  id: string;
  created_at: string;
  ambiente: string | null;
  conversation_id: string | null;
  message_id: string | null;
  execucao_id: string | null;
  score: number;
  nivel: string | null;
  /** ALLOW | CLARIFY | HANDOFF | BLOCK_ACTION (ou legado responder/transferir). */
  decisao: string | null;
  resultado_final: string | null;
  acao_solicitada: string | null;
  bloqueadores: string[];
  reason_codes: string[];
  categorias: string[];
  validadores: Array<{ validator: string; status: string; reasonCode?: string | null }>;
  /** FASE 7 — versão da política vigente quando a decisão foi tomada. */
  policy_version?: string | null;
  /** FASE 7 — "shadow" = observacional. */
  modo?: string | null;
  /** FASE 7 — answer_confidence (resposta) ou action_safety (ação). */
  avaliacao?: string | null;
  /** FASE 7 — mensagem entregue, usada para não contar a saída duas vezes. */
  outgoing_message_id?: string | null;
};

export type ErroCalibracao = {
  id: string;
  conversa_id: string | null;
  mensagem_id: string | null;
  execucao_id: string | null;
  categoria: string | null;
  created_at: string;
  /** FASE 7 — status do reporte: só o confirmado conta como erro. */
  status?: string | null;
};

/** Resultado observado da conversa (fonte: atendimento). */
export type ResultadoConversa = {
  conversa_id: string;
  status: string | null;
  houveHandoff: boolean;
  /** O backend confirmou o agendamento criado nessa conversa? */
  agendamentoConfirmado: boolean | null;
};

export type FaixaScore = "90_100" | "75_89" | "50_74" | "0_49";

export function faixaDoScore(score: number): FaixaScore {
  if (score >= 90) return "90_100";
  if (score >= 75) return "75_89";
  if (score >= 50) return "50_74";
  return "0_49";
}

export type CorrelacaoFaixa = {
  faixa: FaixaScore;
  decisoes: number;
  liberadas: number;
  handoffs: number;
  esclarecimentos: number;
  comErroReportado: number;
  taxaErro: number;
  agendamentosConfirmados: number;
  agendamentosNaoConfirmados: number;
  conversasResolvidas: number;
};

export type CorrelacaoChave = {
  chave: string;
  decisoes: number;
  comErroReportado: number;
  taxaErro: number;
};

export type TipoProposta =
  | "AJUSTAR_PESO"
  | "AJUSTAR_LIMITE"
  | "REVISAR_VALIDADOR"
  | "NOVO_BLOQUEADOR";

export type PropostaAjuste = {
  tipo: TipoProposta;
  alvo: string;
  valorAtual: number | string | null;
  valorSugerido: number | string | null;
  justificativa: string;
  evidencia: { amostra: number; comErro: number; taxaErro: number };
  /** FASE 7 — o que muda na prática se a proposta for aprovada. */
  efeito: string;
  /** Sempre "pendente": nenhuma proposta entra em vigor sozinha. */
  status: "pendente";
};

export type RelatorioCalibracao = {
  total: number;
  comErroReportado: number;
  taxaErroGeral: number;
  porFaixa: CorrelacaoFaixa[];
  porValidadorQueFalhou: CorrelacaoChave[];
  porBloqueador: CorrelacaoChave[];
  porCategoria: CorrelacaoChave[];
  /** Casos mais graves: score alto, resposta liberada e erro reportado. */
  altaConfiancaComErro: number;
  /** Transferências que a conversa mostrou não serem necessárias. */
  handoffsSemErroPosterior: number;
  /** FASE 7 — bloqueios/transferências sem erro confirmado nem handoff real. */
  bloqueioIndevido: number;
  /** FASE 7 — reportes ainda sem revisão conclusiva (não contam como erro). */
  reportesPendentes: number;
  /** FASE 7 — amostra usada para gerar propostas. */
  amostra: AmostraCalibracao;
  propostas: PropostaAjuste[];
  /** FASE 7 — sem amostra suficiente o resultado é inconclusivo, não "bom". */
  conclusao: ConclusaoCalibracao;
  /** FASE 7 — configuração realmente vigente usada na comparação. */
  politicaAplicada: PoliticaAplicada;
};

export type ConclusaoCalibracao = {
  conclusiva: boolean;
  amostraMinima: number;
  /** Explicação em linguagem direta do porquê. */
  motivo: string;
};

export type PoliticaAplicada = {
  limiteAlta: number;
  limiteIntermediaria: number;
  /** "padrao" | "clinica" | outra origem informada por quem chamou. */
  origem: string;
  configId: string | null;
};

export type AmostraCalibracao = {
  /** Decisões elegíveis depois do filtro de versão da política. */
  elegiveis: number;
  /** Decisões efetivamente usadas nas propostas. */
  usadas: number;
  estratificada: boolean;
  tamanhoPorFaixa: number;
  politicaVersao: string | null;
  porFaixa: Array<{ faixa: FaixaScore; disponiveis: number; usadas: number }>;
};

export type OpcoesCalibracao = {
  /** Restringe a amostra às decisões de uma versão de política. */
  politicaVersao?: string | null;
  /** Máximo de decisões por faixa na amostra estratificada. */
  amostraPorFaixa?: number;
  /** FASE 7 — identidade da configuração efetiva que foi passada em `politica`. */
  origemPolitica?: string;
  configId?: string | null;
};

/** Amostra estratificada e determinística: passo fixo dentro de cada faixa. */
export function amostrarEstratificado(
  decisoes: LinhaCalibracao[],
  tamanhoPorFaixa: number,
): LinhaCalibracao[] {
  const out: LinhaCalibracao[] = [];
  for (const faixa of ["90_100", "75_89", "50_74", "0_49"] as FaixaScore[]) {
    const grupo = decisoes.filter((l) => faixaDoScore(Number(l.score) || 0) === faixa);
    if (grupo.length <= tamanhoPorFaixa) {
      out.push(...grupo);
      continue;
    }
    const passo = grupo.length / tamanhoPorFaixa;
    for (let i = 0; i < tamanhoPorFaixa; i += 1) out.push(grupo[Math.floor(i * passo)]!);
  }
  return out;
}

const LIBERADAS = new Set(["ALLOW", "responder", "resposta_liberada"]);
const HANDOFFS = new Set(["HANDOFF", "BLOCK_ACTION", "transferir", "transferido_para_humano"]);
const ESCLARECE = new Set(["CLARIFY", "esclarecer", "pergunta_de_esclarecimento"]);

function classe(l: LinhaCalibracao): "liberada" | "handoff" | "esclarecimento" | "outro" {
  const d = l.decisao ?? l.resultado_final ?? "";
  if (LIBERADAS.has(d)) return "liberada";
  if (HANDOFFS.has(d)) return "handoff";
  if (ESCLARECE.has(d)) return "esclarecimento";
  return "outro";
}

function taxa(comErro: number, total: number): number {
  return total === 0 ? 0 : Math.round((comErro / total) * 1000) / 10;
}

/** Mínimo de casos para uma proposta ser levada a sério. */
export const AMOSTRA_MINIMA = 20;
/** Acima desta taxa de erro, a faixa está mal calibrada. */
export const TAXA_ERRO_ALERTA = 10;

export function calibrar(
  decisoesEntrada: LinhaCalibracao[],
  errosEntrada: ErroCalibracao[],
  conversas: ResultadoConversa[] = [],
  politica: PoliticaConfianca = POLITICA_PADRAO,
  opcoes: OpcoesCalibracao = {},
): RelatorioCalibracao {
  const politicaVersao = opcoes.politicaVersao ?? null;
  const tamanhoPorFaixa = opcoes.amostraPorFaixa ?? 200;
  // FASE 7 — modo observacional não vale para calibrar decisão aplicada.
  // FASE 7 — a calibração dos limites de confiança olha a avaliação da
  // RESPOSTA. Segurança da ação tem outra escala e não entra aqui. A mesma
  // saída conta uma vez só.
  const semDuplicadas = separarAvaliacoes(
    decisoesEntrada.map((l) => ({ ...l, id: l.id })),
  ).respostas as LinhaCalibracao[];
  const elegiveis = semDuplicadas.filter(
    (l) =>
      String(l.modo ?? "").toLowerCase() !== "shadow" &&
      (!politicaVersao || (l.policy_version ?? null) === politicaVersao),
  );
  const decisoes = amostrarEstratificado(elegiveis, tamanhoPorFaixa);
  const reportesPendentes = errosEntrada.filter(
    (e) => e.status != null && classificarStatusReporte(e.status) !== "ERRO_CONFIRMADO",
  ).length;
  // Só erro confirmado conta como erro observado.
  const erros = errosEntrada.filter(
    (e) => e.status == null || classificarStatusReporte(e.status) === "ERRO_CONFIRMADO",
  );
  const porMensagem = new Set(erros.map((e) => e.mensagem_id).filter(Boolean) as string[]);
  const porExecucao = new Set(erros.map((e) => e.execucao_id).filter(Boolean) as string[]);
  // FASE 6 — o vínculo por conversa só vale para reportes LEGADOS, que não
  // guardaram mensagem nem execução. Um erro pontual não pode contaminar
  // todas as decisões daquela conversa.
  const porConversaLegado = new Set(
    erros
      .filter((e) => !e.mensagem_id && !e.execucao_id)
      .map((e) => e.conversa_id)
      .filter(Boolean) as string[],
  );
  const resultadoDe = new Map(conversas.map((c) => [c.conversa_id, c]));

  const temErro = (l: LinhaCalibracao) =>
    (l.message_id != null && porMensagem.has(l.message_id)) ||
    (l.execucao_id != null && porExecucao.has(l.execucao_id)) ||
    (l.conversation_id != null && porConversaLegado.has(l.conversation_id));

  const faixas: FaixaScore[] = ["90_100", "75_89", "50_74", "0_49"];
  const porFaixa: CorrelacaoFaixa[] = faixas.map((faixa) => {
    const linhas = decisoes.filter((l) => faixaDoScore(Number(l.score) || 0) === faixa);
    const comErro = linhas.filter(temErro).length;
    let agOk = 0;
    let agNok = 0;
    let resolvidas = 0;
    for (const l of linhas) {
      const r = l.conversation_id ? resultadoDe.get(l.conversation_id) : undefined;
      if (!r) continue;
      if (r.agendamentoConfirmado === true) agOk++;
      if (r.agendamentoConfirmado === false) agNok++;
      if ((r.status ?? "").toLowerCase() === "resolvido") resolvidas++;
    }
    return {
      faixa,
      decisoes: linhas.length,
      liberadas: linhas.filter((l) => classe(l) === "liberada").length,
      handoffs: linhas.filter((l) => classe(l) === "handoff").length,
      esclarecimentos: linhas.filter((l) => classe(l) === "esclarecimento").length,
      comErroReportado: comErro,
      taxaErro: taxa(comErro, linhas.length),
      agendamentosConfirmados: agOk,
      agendamentosNaoConfirmados: agNok,
      conversasResolvidas: resolvidas,
    };
  });

  const agrupa = (chaves: (l: LinhaCalibracao) => string[]): CorrelacaoChave[] => {
    const mapa = new Map<string, { total: number; erro: number }>();
    for (const l of decisoes) {
      const erro = temErro(l);
      for (const k of new Set(chaves(l))) {
        const atual = mapa.get(k) ?? { total: 0, erro: 0 };
        atual.total++;
        if (erro) atual.erro++;
        mapa.set(k, atual);
      }
    }
    return [...mapa.entries()]
      .map(([chave, v]) => ({
        chave,
        decisoes: v.total,
        comErroReportado: v.erro,
        taxaErro: taxa(v.erro, v.total),
      }))
      .sort((a, b) => b.comErroReportado - a.comErroReportado || b.decisoes - a.decisoes);
  };

  const porValidadorQueFalhou = agrupa((l) =>
    (l.validadores ?? [])
      .filter((v) => v.status === "FAIL" || v.status === "BLOCK" || v.status === "WARNING")
      .map((v) => v.validator),
  );
  const porBloqueador = agrupa((l) => l.bloqueadores ?? []);
  const porCategoria = agrupa((l) => l.categorias ?? []);

  const altaConfiancaComErro = decisoes.filter(
    (l) => Number(l.score) >= 90 && classe(l) === "liberada" && temErro(l),
  ).length;
  const handoffsSemErroPosterior = decisoes.filter(
    (l) => classe(l) === "handoff" && !temErro(l),
  ).length;
  const bloqueioIndevido = decisoes.filter((l) => {
    if (classe(l) !== "handoff" || temErro(l)) return false;
    const r = l.conversation_id ? resultadoDe.get(l.conversation_id) : undefined;
    return r ? !r.houveHandoff : false;
  }).length;

  const amostra: AmostraCalibracao = {
    elegiveis: elegiveis.length,
    usadas: decisoes.length,
    estratificada: decisoes.length < elegiveis.length,
    tamanhoPorFaixa,
    politicaVersao,
    porFaixa: (["90_100", "75_89", "50_74", "0_49"] as FaixaScore[]).map((faixa) => ({
      faixa,
      disponiveis: elegiveis.filter((l) => faixaDoScore(Number(l.score) || 0) === faixa).length,
      usadas: decisoes.filter((l) => faixaDoScore(Number(l.score) || 0) === faixa).length,
    })),
  };

  return {
    total: decisoes.length,
    comErroReportado: decisoes.filter(temErro).length,
    taxaErroGeral: taxa(decisoes.filter(temErro).length, decisoes.length),
    porFaixa,
    porValidadorQueFalhou,
    porBloqueador,
    porCategoria,
    altaConfiancaComErro,
    handoffsSemErroPosterior,
    bloqueioIndevido,
    reportesPendentes,
    amostra,
    propostas: gerarPropostas(
      { porFaixa, porValidadorQueFalhou, porCategoria, altaConfiancaComErro },
      politica,
    ),
    conclusao:
      decisoes.length >= AMOSTRA_MINIMA
        ? {
            conclusiva: true,
            amostraMinima: AMOSTRA_MINIMA,
            motivo: `Analisadas ${decisoes.length} respostas avaliadas no período.`,
          }
        : {
            conclusiva: false,
            amostraMinima: AMOSTRA_MINIMA,
            motivo:
              decisoes.length === 0
                ? "Nenhuma resposta avaliada no período: não há como afirmar que a calibração está boa nem ruim."
                : `Apenas ${decisoes.length} respostas avaliadas no período (mínimo de ${AMOSTRA_MINIMA}): resultado inconclusivo.`,
          },
    politicaAplicada: {
      limiteAlta: politica.limites.HIGH,
      limiteIntermediaria: politica.limites.MEDIUM,
      origem: opcoes.origemPolitica ?? (politica === POLITICA_PADRAO ? "padrao" : "informada"),
      configId: opcoes.configId ?? null,
    },
  };
}

function gerarPropostas(
  r: {
    porFaixa: CorrelacaoFaixa[];
    porValidadorQueFalhou: CorrelacaoChave[];
    porCategoria: CorrelacaoChave[];
    altaConfiancaComErro: number;
  },
  politica: PoliticaConfianca,
): PropostaAjuste[] {
  const out: PropostaAjuste[] = [];

  // 1) Faixa alta errando: o limite de "alta confiança" está frouxo.
  const alta = r.porFaixa.find((f) => f.faixa === "90_100");
  if (alta && alta.decisoes >= AMOSTRA_MINIMA && alta.taxaErro > TAXA_ERRO_ALERTA) {
    const sugerido = Math.min(98, politica.limites.HIGH + 4);
    // FASE 7 — endurecer é subir o limite que está REALMENTE em vigor. Se o
    // valor sugerido não é maior que o vigente, não há proposta a fazer.
    if (sugerido > politica.limites.HIGH) {
      out.push({
        tipo: "AJUSTAR_LIMITE",
        alvo: "limites.HIGH",
        valorAtual: politica.limites.HIGH,
        valorSugerido: sugerido,
        justificativa:
          "Respostas liberadas com confiança alta estão sendo reportadas como erro acima do aceitável.",
        evidencia: {
          amostra: alta.decisoes,
          comErro: alta.comErroReportado,
          taxaErro: alta.taxaErro,
        },
        efeito: `Passa a exigir ${sugerido} em vez de ${politica.limites.HIGH} para tratar a resposta como de confiança alta: menos respostas liberadas direto.`,
        status: "pendente",
      });
    }
  }

  // 2) Faixa média liberando demais.
  const media = r.porFaixa.find((f) => f.faixa === "75_89");
  const sugeridoMedio = Math.min(politica.limites.HIGH - 1, politica.limites.MEDIUM + 5);
  if (
    media &&
    media.decisoes >= AMOSTRA_MINIMA &&
    media.taxaErro > TAXA_ERRO_ALERTA &&
    sugeridoMedio > politica.limites.MEDIUM
  ) {
    out.push({
      tipo: "AJUSTAR_LIMITE",
      alvo: "limites.MEDIUM",
      valorAtual: politica.limites.MEDIUM,
      valorSugerido: sugeridoMedio,
      justificativa:
        "A faixa intermediária concentra erros reportados; esclarecer ou transferir mais cedo.",
      evidencia: {
        amostra: media.decisoes,
        comErro: media.comErroReportado,
        taxaErro: media.taxaErro,
      },
      efeito: `Passa a exigir ${sugeridoMedio} em vez de ${politica.limites.MEDIUM} para a faixa intermediária: mais esclarecimentos e transferências antes de responder.`,
      status: "pendente",
    });
  }

  // 3) Validador que aparece muito em conversas com erro: peso subestimado.
  for (const v of r.porValidadorQueFalhou) {
    if (v.decisoes < AMOSTRA_MINIMA || v.taxaErro <= TAXA_ERRO_ALERTA) continue;
    const pesoAtual = politica.pesos[v.chave] ?? 0;
    if (pesoAtual <= 0) continue;
    if (Math.min(30, pesoAtual + 5) <= pesoAtual) continue;
    out.push({
      tipo: "AJUSTAR_PESO",
      alvo: `pesos.${v.chave}`,
      valorAtual: pesoAtual,
      valorSugerido: Math.min(30, pesoAtual + 5),
      justificativa: `Quando ${v.chave} não passa, o erro reportado é frequente; o peso atual não está refletindo esse risco.`,
      evidencia: { amostra: v.decisoes, comErro: v.comErroReportado, taxaErro: v.taxaErro },
      efeito: `Peso de ${v.chave} passa de ${pesoAtual} para ${Math.min(30, pesoAtual + 5)}: falhar nessa verificação derruba mais a pontuação.`,
      status: "pendente",
    });
  }

  // 4) Categoria com erro concentrado mesmo sem bloqueador: falta bloqueador objetivo.
  for (const c of r.porCategoria) {
    if (c.decisoes < AMOSTRA_MINIMA || c.taxaErro <= TAXA_ERRO_ALERTA * 2) continue;
    out.push({
      tipo: "NOVO_BLOQUEADOR",
      alvo: `categoria.${c.chave}`,
      valorAtual: null,
      valorSugerido: "exigir_fonte_oficial_confirmada",
      justificativa: `A categoria "${c.chave}" concentra erros reportados; avaliar bloqueador objetivo em vez de depender da pontuação.`,
      evidencia: { amostra: c.decisoes, comErro: c.comErroReportado, taxaErro: c.taxaErro },
      efeito: `Passa a exigir fonte oficial confirmada nas respostas da categoria "${c.chave}", em vez de depender só da pontuação.`,
      status: "pendente",
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Aplicação controlada da política (somente depois de aprovação humana)
// ---------------------------------------------------------------------------

export type AjustePolitica = { alvo: string; valor: number };

export class AjusteRecusado extends Error {}

/**
 * Mescla ajustes APROVADOS na política. Recusa qualquer ajuste que enfraqueça
 * a segurança: bloqueadores absolutos não são negociáveis por esta via, e
 * limites/pesos só podem ir para valores válidos.
 */
export function mesclarPolitica(
  base: PoliticaConfianca,
  ajustes: AjustePolitica[],
): PoliticaConfianca {
  const nova: PoliticaConfianca = {
    ...base,
    pesos: { ...base.pesos },
    limites: { ...base.limites },
    penalidades: { ...base.penalidades },
    minimoPorRisco: { ...base.minimoPorRisco },
    bloqueadoresAbsolutos: { ...base.bloqueadoresAbsolutos },
    acoesDeEscrita: [...base.acoesDeEscrita],
  };

  for (const a of ajustes) {
    const [grupo, chave] = a.alvo.split(".");
    if (!Number.isFinite(a.valor)) throw new AjusteRecusado(`Valor inválido para ${a.alvo}`);
    if (grupo === "limites" && (chave === "HIGH" || chave === "MEDIUM")) {
      if (a.valor < 50 || a.valor > 100) throw new AjusteRecusado(`Limite fora da faixa: ${a.alvo}`);
      nova.limites[chave] = a.valor;
      continue;
    }
    if (grupo === "pesos" && chave && chave in nova.pesos) {
      if (a.valor < 0 || a.valor > 40) throw new AjusteRecusado(`Peso fora da faixa: ${a.alvo}`);
      nova.pesos[chave] = a.valor;
      continue;
    }
    if (grupo === "minimoPorRisco" && chave && chave in nova.minimoPorRisco) {
      if (a.valor < 50 || a.valor > 100) throw new AjusteRecusado(`Mínimo inválido: ${a.alvo}`);
      (nova.minimoPorRisco as Record<string, number>)[chave] = a.valor;
      continue;
    }
    throw new AjusteRecusado(`Ajuste não permitido por esta via: ${a.alvo}`);
  }

  if (nova.limites.MEDIUM >= nova.limites.HIGH) {
    throw new AjusteRecusado("O limite intermediário precisa ficar abaixo do limite alto.");
  }
  // Bloqueadores absolutos preservados: comparação explícita.
  const antes = Object.keys(base.bloqueadoresAbsolutos).sort().join("|");
  const depois = Object.keys(nova.bloqueadoresAbsolutos).sort().join("|");
  if (antes !== depois) throw new AjusteRecusado("Bloqueadores absolutos não podem ser alterados.");
  return nova;
}
