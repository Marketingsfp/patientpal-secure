/**
 * CONFIDENCE DECISION ENGINE — serviço central (Fase 1).
 *
 * Puro: sem banco, sem rede, sem modelo. Recebe contexto estruturado, roda
 * validadores, calcula confiança, detecta bloqueadores e devolve decisão com
 * evidências. Quem envia mensagem, transfere ou grava é o runtime.
 *
 * Reutiliza a detecção de afirmações sensíveis já em produção
 * (`../confidence-engine`) em vez de criar uma segunda gramática paralela.
 */
import { detectarCategorias, type CategoriaConfianca } from "../confidence-engine";
import { avaliarGrounding, extrairClaimsDoTexto } from "./claims";
import { hashDoTexto } from "./hash";
import {
  executarValidadoresDeConfianca,
  riscoDaAcao,
  type ConfigValidadores,
} from "./validators";
import {
  aplicarPolitica,
  detectarHardBlockers,
  medirEvidencia,
  nivelDaPontuacao,
  POLITICA_PADRAO,
  type HardBlocker,
  type PoliticaConfianca,
} from "./policy";
import { acaoExecutavel, acaoOuNenhuma, contaContraANota } from "./types";
import type {
  AvaliacaoSegurancaAcao,
  Bloqueador,
  ContextoConfianca,
  DecisaoMotor,
  FonteRecuperada,
  ResultadoConfianca,
  ResultadoFerramenta,
  ResultadoValidador,
  Verificacao,
} from "./types";

/** Faixas da política central (mantidas exportadas por compatibilidade). */
export const LIMITE_HIGH = POLITICA_PADRAO.limites.HIGH;
export const LIMITE_MEDIUM = POLITICA_PADRAO.limites.MEDIUM;

const CAP_CATALOGO = new Set(["searchKnowledgeBase", "listCatalog"]);
const CAP_AGENDA = new Set(["checkAvailability", "createAppointment"]);

function ferramentaOk(f: ResultadoFerramenta): boolean {
  return f.success && !f.erro;
}

function rodouComSucesso(tools: ResultadoFerramenta[], caps: Set<string>): boolean {
  return tools.some((f) => f.capacidade !== null && caps.has(f.capacidade) && ferramentaOk(f));
}

function fonteUtil(f: FonteRecuperada): boolean {
  return f.temConteudo && f.publicado !== false;
}

/**
 * Catálogo publicado é a única fonte oficial: precisa ter rodado a consulta E
 * ter voltado registro publicado.
 */
function temCatalogoPublicado(ctx: ContextoConfianca): boolean {
  const consultou = rodouComSucesso(ctx.toolResults, CAP_CATALOGO);
  const trouxe =
    ctx.toolResults.some(
      (f) => f.capacidade !== null && CAP_CATALOGO.has(f.capacidade) && ferramentaOk(f) && f.temConteudo === true,
    ) || ctx.retrievedSources.some((s) => s.tipo === "catalogo_publicado" && fonteUtil(s));
  return consultou && trouxe;
}

function temConfirmacaoAgenda(ctx: ContextoConfianca): boolean {
  return (
    rodouComSucesso(ctx.toolResults, CAP_AGENDA) ||
    ctx.retrievedSources.some((s) => s.tipo === "agenda" && fonteUtil(s))
  );
}

function camposFaltantes(ctx: ContextoConfianca): string[] {
  const req = ctx.requiredFields ?? [];
  if (req.length === 0) return [];
  const e = ctx.entities ?? {};
  return req.filter((campo) => {
    const v = e[campo];
    return v === undefined || v === null || String(v).trim() === "";
  });
}

/**
 * Categorias que só exigem fonte oficial quando o texto AFIRMA algo daquele
 * tipo. Citar o assunto ("vou verificar o horário") não é afirmar um fato.
 */
const CATEGORIA_POR_CLAIM: Partial<Record<string, CategoriaConfianca[]>> = {
  valor: ["valor"],
  profissional: ["profissional"],
  disponibilidade: ["disponibilidade", "horario"],
  preparo: ["preparo"],
  regra: ["regra"],
  agendamento: ["agendamento"],
};

const CATEGORIAS_QUE_EXIGEM_AFIRMACAO = new Set<CategoriaConfianca>([
  "valor",
  "profissional",
  "disponibilidade",
  "horario",
  "preparo",
  "regra",
  "agendamento",
]);

function filtrarCategoriasAfirmadas(
  detectadas: CategoriaConfianca[],
  texto: string,
): CategoriaConfianca[] {
  const afirmadas = new Set<CategoriaConfianca>();
  for (const c of extrairClaimsDoTexto(texto)) {
    for (const cat of CATEGORIA_POR_CLAIM[c.tipo] ?? []) afirmadas.add(cat);
  }
  return detectadas.filter(
    (c) => !CATEGORIAS_QUE_EXIGEM_AFIRMACAO.has(c) || afirmadas.has(c),
  );
}

/**
 * Categorias sensíveis: vindas do texto (quando houver) somadas à ação
 * pretendida, para que o motor funcione mesmo sem rascunho de resposta.
 */

function categoriasDoContexto(ctx: ContextoConfianca): CategoriaConfianca[] {
  const doTexto = detectarCategorias(ctx.draftText ?? "");
  const porAcao: Partial<Record<string, CategoriaConfianca>> = {
    informar_valor: "valor",
    informar_horario: "horario",
    informar_profissional: "profissional",
    informar_disponibilidade: "disponibilidade",
    informar_preparo: "preparo",
    informar_regra: "regra",
    criar_agendamento: "agendamento",
    cancelar_agendamento: "agendamento",
  };
  // FASE 2 — avaliando a MENSAGEM, as categorias vêm do que o texto afirma.
  // Uma ação pendente não transforma "preciso confirmar seus dados" numa
  // afirmação de agenda que precise de fonte oficial.
  // FASE 3 — e citar o assunto não é afirmar um fato sobre ele. "Esse horário
  // ainda precisa ser confirmado. Vou verificar." fala de horário sem afirmar
  // horário nenhum: só exige fonte oficial a categoria realmente AFIRMADA no
  // texto, medida pela mesma gramática de claims usada no grounding.
  if (ctx.tipoAvaliacao === "answer_confidence") {
    return filtrarCategoriasAfirmadas(doTexto, ctx.draftText ?? "");
  }

  const extra = porAcao[acaoOuNenhuma(ctx.requestedAction)];
  if (extra && !doTexto.includes(extra)) return [...doTexto, extra];
  return doTexto;
}

function check(
  id: string,
  descricao: string,
  aprovado: boolean,
  peso: number,
  bloqueador: Bloqueador | null = null,
  detalhe: string | null = null,
): Verificacao {
  return { id, descricao, aprovado, peso, bloqueador, detalhe };
}

/**
 * Executa os validadores. Cada um é independente e explica a si mesmo —
 * é isso que aparece na auditoria e no painel.
 */
export function executarValidadores(ctx: ContextoConfianca): Verificacao[] {
  const cats = categoriasDoContexto(ctx);
  const catalogo = temCatalogoPublicado(ctx);
  const agenda = temConfirmacaoAgenda(ctx);
  const faltando = camposFaltantes(ctx);
  // FASE 2 — falha REFEITA com sucesso não conta como falha vigente do turno
  // (mesma regra do ToolIntegrityValidator; antes eram duas regras diferentes).
  const ultimoOk = new Map<string, number>();
  ctx.toolResults.forEach((f, i) => {
    if (ferramentaOk(f)) ultimoOk.set(`${f.nome}|${f.capacidade ?? ""}`, i);
  });
  const falhas = ctx.toolResults.filter(
    (f, i) => !ferramentaOk(f) && (ultimoOk.get(`${f.nome}|${f.capacidade ?? ""}`) ?? -1) <= i,
  );
  // FASE 2 — reserva já persistida comprova o horário reservado.
  const reservaPersistida =
    ctx.operationalState?.appointmentCreated === true && Boolean(ctx.operationalState?.appointmentId);

  const checks: Verificacao[] = [];

  checks.push(
    check(
      "ferramentas_sem_falha",
      "Nenhuma consulta ao sistema falhou neste turno",
      falhas.length === 0,
      100,
      "FERRAMENTA_FALHOU",
      falhas.length ? falhas.map((f) => `${f.nome}: ${f.erro ?? "sem resposta"}`).join("; ") : null,
    ),
  );

  if (cats.includes("valor")) {
    checks.push(
      check(
        "valor_no_catalogo",
        "Valor apoiado em registro publicado no catálogo",
        catalogo,
        100,
        "VALOR_SEM_CATALOGO",
      ),
    );
  }

  if (cats.includes("agendamento")) {
    checks.push(
      check(
        "agendamento_confirmado",
        "Agendamento efetivamente gravado e confirmado pelo sistema",
        ctx.businessContext.agendamentoConfirmado,
        100,
        "AGENDA_SEM_CONFIRMACAO",
      ),
    );
  }

  if (cats.includes("disponibilidade") || cats.includes("horario") || cats.includes("profissional")) {
    checks.push(
      check(
        "agenda_ou_catalogo_confirmou",
        "Disponibilidade, horário ou profissional confirmado pela agenda ou pelo catálogo",
        agenda || catalogo || reservaPersistida,
        100,
        "AGENDA_SEM_CONFIRMACAO",
      ),
    );
  }

  if (cats.includes("preparo") || cats.includes("regra")) {
    checks.push(
      check(
        "preparo_com_fonte",
        "Preparo de exame ou regra clínica com fonte publicada",
        catalogo,
        100,
        "PREPARO_SEM_FONTE",
      ),
    );
  }

  // FASE 2 — campo obrigatório só é bloqueio quando existe uma AÇÃO
  // EXECUTÁVEL prestes a acontecer. Numa etapa de coleta, faltar o nome do
  // paciente é o motivo de a Nina estar perguntando — não um defeito.
  if ((ctx.requiredFields ?? []).length > 0 && acaoExecutavel(ctx.requestedAction)) {
    checks.push(
      check(
        "campos_obrigatorios",
        "Campos obrigatórios da ação estão preenchidos",
        faltando.length === 0,
        100,
        "CAMPO_OBRIGATORIO_AUSENTE",
        faltando.length ? `faltam: ${faltando.join(", ")}` : null,
      ),
    );
  }

  // ---- verificações graduais (descontam pontos, não bloqueiam) ----
  checks.push(
    check(
      "consulta_realizada",
      "Houve consulta ao sistema para embasar a afirmação",
      cats.length === 0 ||
        ctx.toolResults.length > 0 ||
        ctx.retrievedSources.some(fonteUtil) ||
        // FASE 2 — a reserva feita em turno anterior já é a consulta que embasa.
        reservaPersistida,
      POLITICA_PADRAO.penalidades["consulta_realizada"] ?? 0,
    ),
  );

  if (cats.includes("clinico_administrativo")) {
    checks.push(
      check(
        "paciente_identificado",
        "Dado do paciente citado com identificação confirmada",
        ctx.businessContext.pacienteIdentificado,
        POLITICA_PADRAO.penalidades["paciente_identificado"] ?? 0,
      ),
    );
  }

  // FASE 5 — REMOVIDA a penalidade "foco_da_resposta". Responder valor +
  // profissional + data + horário + unidade na mesma mensagem é EXATAMENTE o
  // que a Nina deve fazer. Quantidade de fatos nunca reduz confiança; o que
  // reduz é fato SEM evidência, medido claim a claim (ClaimGroundingValidator).

  if (ctx.draftText !== undefined && ctx.draftText !== null) {
    checks.push(check("resposta_nao_vazia", "A resposta tem conteúdo", ctx.draftText.trim().length > 0, POLITICA_PADRAO.penalidades["resposta_nao_vazia"] ?? 0));
  }

  return checks;
}

/**
 * Ponto de entrada do serviço. Nunca lança: qualquer contexto estranho leva
 * ao caminho conservador (transferir para humano).
 */
export function decidirConfianca(
  ctx: ContextoConfianca,
  opcoes: { config?: ConfigValidadores; agora?: Date; politica?: PoliticaConfianca } = {},
): ResultadoConfianca {
  const cats = categoriasDoContexto(ctx);
  const politica = opcoes.politica ?? POLITICA_PADRAO;
  const tipoAvaliacao = ctx.tipoAvaliacao ?? "action_safety";
  const ehResposta = tipoAvaliacao === "answer_confidence";
  const executavel = acaoExecutavel(ctx.requestedAction);
  // FASE 2 — dimensões que dizem "é seguro EXECUTAR?", não "o texto é
  // confiável?". Na avaliação da MENSAGEM elas saem da nota e do bloqueio;
  // continuam valendo integralmente para a segurança da ação.
  const DE_ACAO = new Set([...politica.validadoresDeAcao, "campos_obrigatorios"]);

  const checksBase = executarValidadores(ctx);

  // Validadores da Fase 2: independentes, auditáveis e configuráveis.
  const validators = executarValidadoresDeConfianca({
    ctx,
    categorias: cats as string[],
    ...(opcoes.config ? { config: opcoes.config } : {}),
    ...(opcoes.agora ? { agora: opcoes.agora } : {}),
  });
  const checksTodos = [...checksBase];
  for (const v of validators) {
    // FASE 3 — UNKNOWN não vira "reprovação" nem penalidade: ele aparece na
    // cobertura de evidências, que é o lugar honesto para "não sei".
    // FASE 2 — PENDING também não: é coleta em andamento, não erro.
    if (!contaContraANota(v.status)) continue;
    checksTodos.push(
      check(
        v.validator,
        v.reasonCode,
        false,
        v.peso ?? 0,
        v.blocker ?? null,
        JSON.stringify(v.evidence),
      ),
    );
  }

  // Visão da AÇÃO: enxerga tudo, inclusive as pré-condições de execução.
  const reprovadosAcao = checksTodos.filter((c) => !c.aprovado);
  const blockersAcao = [
    ...new Set(reprovadosAcao.map((c) => c.bloqueador).filter(Boolean)),
  ] as Bloqueador[];

  // Visão da MENSAGEM: pré-condição de ação não derruba a nota do texto.
  const checks = ehResposta ? checksTodos.filter((c) => !DE_ACAO.has(c.id)) : checksTodos;
  const validatorsParaNota = ehResposta
    ? validators.filter((v) => !DE_ACAO.has(v.validator))
    : validators;

  const reprovados = checks.filter((c) => !c.aprovado);
  const blockers = [...new Set(reprovados.map((c) => c.bloqueador).filter(Boolean))] as Bloqueador[];

  const motivos = reprovados.map((c) => (c.detalhe ? `${c.descricao} — ${c.detalhe}` : c.descricao));

  // FASE 3 — nota E cobertura, medidas na mesma passada e reportadas separadas.
  const medida = medirEvidencia(validatorsParaNota, politica);

  const risco = riscoDaAcao(ctx);
  const hardBlockers: HardBlocker[] = detectarHardBlockers(
    { bloqueadores: blockers, validators: validatorsParaNota, risco },
    politica,
  );
  const hardBlockersAcao: HardBlocker[] = ehResposta
    ? detectarHardBlockers({ bloqueadores: blockersAcao, validators, risco }, politica)
    : hardBlockers;

  // Pontuação: validadores ponderados pela política, menos as penalidades
  // graduais (verificações que descontam sem bloquear).
  const penalidade = reprovados
    .filter((c) => !c.bloqueador)
    .reduce((soma, c) => soma + c.peso, 0);

  const { score, level, decision, limitacoes } = aplicarPolitica(
    {
      scoreValidadores: medida.score,
      penalidade,
      bloqueadores: blockers,
      hardBlockers,
      risco,
      acao: acaoOuNenhuma(ctx.requestedAction),
      esclarecimentoUsado: ctx.businessContext.esclarecimentoUsado,
      ambiguidadeResolvivel: apenasAmbiguidade(validators, blockers, hardBlockers),
      cobertura: medida.cobertura,
      semEvidencia: medida.semEvidencia,
      dimensoesDesconhecidas: medida.desconhecidas,
    },
    politica,
  );


  // FASE 4/5 — handoff já pedido pelo runtime deixa de ser atalho cego.
  // TRANSFERIR é uma AÇÃO segura (action_safety), então a decisão pode ser
  // liberada quando não há nenhum bloqueio. Isso NUNCA vale para a avaliação
  // da mensagem final: "vou chamar uma atendente" não torna o restante do
  // texto verdadeiro. A nota e a cobertura seguem sendo as reais em ambos.
  let decisaoFinal = decision;
  if (
    tipoAvaliacao === "action_safety" &&
    ctx.businessContext.handoffSolicitado &&
    blockers.length === 0 &&
    hardBlockers.length === 0
  ) {
    decisaoFinal = "ALLOW";
    motivos.push("handoff já solicitado pelo runtime — transferir é a ação segura");
  }

  // FASE 7 — handoff nunca é sinônimo de certeza factual da MENSAGEM. A ação
  // pode ser segura; a nota da resposta não sobe por causa disso.
  let scoreFinal = score;
  let nivelFinal = level;
  if (tipoAvaliacao === "answer_confidence" && ctx.businessContext.handoffSolicitado) {
    const teto = politica.limites.HIGH;
    if (scoreFinal >= teto) {
      scoreFinal = teto;
      nivelFinal = nivelDaPontuacao(scoreFinal, politica);
      motivos.push("transferência é ação segura, mas não comprova o conteúdo da resposta");
    }
  }

  for (const l of limitacoes) {
    motivos.push(`limitação de cobertura: ${l} (cobertura ${medida.cobertura}%)`);
  }
  if (medida.desconhecidas.length > 0) {
    motivos.push(`dimensões sem evidência: ${medida.desconhecidas.join(", ")}`);
  }
  if (motivos.length === 0) motivos.push("evidências suficientes no sistema");

  const grounding = avaliarGrounding(ctx, ctx.draftText ?? "");

  // FASE 2 — segurança da AÇÃO, calculada à parte da nota do texto.
  // Sem ação executável no turno: NOT_APPLICABLE (nunca bloqueio, nunca 0).
  // FASE 3 — ausência de bloqueador não basta: uma decisão que ainda exige
  // esclarecimento, evidência ou transferência não pode sair como ALLOWED.
  const bloqueada = blockersAcao.length > 0 || hardBlockersAcao.length > 0;
  const validadoresAcaoPendentes = validators
    .filter((v) => v.status === "PENDING")
    .map((v) => v.validator);
  const decisaoExigeMaisAlgo = decisaoFinal !== "ALLOW";
  const motivosPendencia: string[] = [];
  if (!bloqueada && decisaoExigeMaisAlgo)
    motivosPendencia.push(`decisão do motor ainda exige ${decisaoFinal.toLowerCase()}`);
  if (!bloqueada && validadoresAcaoPendentes.length > 0)
    motivosPendencia.push(
      `dimensões sem evidência conclusiva: ${validadoresAcaoPendentes.join(", ")}`,
    );

  const actionSafety: AvaliacaoSegurancaAcao = executavel
    ? {
        status: bloqueada ? "BLOCKED" : motivosPendencia.length > 0 ? "PENDING" : "ALLOWED",
        acao: acaoOuNenhuma(ctx.requestedAction),
        blockers: blockersAcao,
        hardBlockers: hardBlockersAcao,
        motivos: [
          ...reprovadosAcao.map((c) =>
            c.detalhe ? `${c.descricao} — ${c.detalhe}` : c.descricao,
          ),
          ...motivosPendencia,
        ],
      }
    : {
        status: "NOT_APPLICABLE",
        acao: acaoOuNenhuma(ctx.requestedAction),
        blockers: [],
        hardBlockers: [],
        motivos: ["nenhuma ação executável neste turno"],
      };

  return {
    tipoAvaliacao,
    actionSafety,
    // Pendências vêm da lista completa: uma pré-condição de ação segue
    // visível como "ainda será coletada", mesmo fora da nota da mensagem.
    pendingDimensions: validators.filter((v) => v.status === "PENDING").map((v) => v.validator),
    // A amarra com o texto só faz sentido na avaliação da RESPOSTA FINAL:
    // a avaliação de segurança da ação não é a nota de nenhuma mensagem.
    textoAvaliadoHash:
      (ctx.tipoAvaliacao ?? "action_safety") === "answer_confidence"
        ? hashDoTexto(ctx.draftText ?? null)
        : null,
    claims: {
      total: grounding.total,
      suportados: grounding.suportados,
      semEvidencia: grounding.semEvidencia.map((c) => ({
        tipo: c.tipo,
        trecho: c.trecho,
        motivo: c.motivo,
      })),
    },
    score: scoreFinal,
    evidenceCoverage: medida.cobertura,
    unknownDimensions: medida.desconhecidas,
    confidenceInsufficient: medida.semEvidencia,
    level: nivelFinal,
    decision: decisaoFinal,
    blockers,
    hardBlockers,
    checks,
    validators,
    evidence: montarEvidencia(ctx, cats, motivos),
  };
}

/** Só há ambiguidade de intenção/entidade a resolver com o paciente. */
function apenasAmbiguidade(
  validators: ResultadoValidador[],
  blockers: Bloqueador[],
  hardBlockers: HardBlocker[],
): boolean {
  if (blockers.length > 0 || hardBlockers.length > 0) return false;
  const reprovados = validators.filter((v) => contaContraANota(v.status));
  if (reprovados.length === 0) return false;
  const AMBIGUIDADE = new Set(["IntentClarityValidator", "EntityResolutionValidator"]);
  return reprovados.every((v) => AMBIGUIDADE.has(v.validator));
}

function montarEvidencia(ctx: ContextoConfianca, cats: CategoriaConfianca[], motivos: string[]) {
  return {
    categorias: cats as string[],
    fontesUteis: ctx.retrievedSources.filter(fonteUtil).length,
    fontesPublicadas: ctx.retrievedSources.filter((s) => s.publicado === true).length,
    ferramentasExecutadas: ctx.toolResults.length,
    ferramentasComFalha: ctx.toolResults.filter((f) => !ferramentaOk(f)).length,
    camposFaltantes: camposFaltantes(ctx),
    motivos,
  };
}
