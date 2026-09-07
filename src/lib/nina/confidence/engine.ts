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
import type {
  Bloqueador,
  ContextoConfianca,
  DecisaoMotor,
  FonteRecuperada,
  NivelConfianca,
  ResultadoConfianca,
  ResultadoFerramenta,
  Verificacao,
} from "./types";

export const LIMITE_HIGH = 80;
export const LIMITE_MEDIUM = 50;

/** Ações que gravam algo de verdade — bloqueio nelas é BLOCK_ACTION. */
const ACOES_DE_ESCRITA = new Set(["criar_agendamento", "cancelar_agendamento"]);

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
  const extra = porAcao[ctx.requestedAction];
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
  const falhas = ctx.toolResults.filter((f) => !ferramentaOk(f));

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
        agenda || catalogo,
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

  if ((ctx.requiredFields ?? []).length > 0) {
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
      cats.length === 0 || ctx.toolResults.length > 0 || ctx.retrievedSources.some(fonteUtil),
      45,
    ),
  );

  if (cats.includes("clinico_administrativo")) {
    checks.push(
      check(
        "paciente_identificado",
        "Dado do paciente citado com identificação confirmada",
        ctx.businessContext.pacienteIdentificado,
        30,
      ),
    );
  }

  checks.push(
    check(
      "foco_da_resposta",
      "Resposta não acumula afirmações sensíveis demais",
      cats.length < 3,
      15,
    ),
  );

  if (ctx.draftText !== undefined && ctx.draftText !== null) {
    checks.push(check("resposta_nao_vazia", "A resposta tem conteúdo", ctx.draftText.trim().length > 0, 60));
  }

  return checks;
}

function nivel(score: number): NivelConfianca {
  if (score >= LIMITE_HIGH) return "HIGH";
  if (score >= LIMITE_MEDIUM) return "MEDIUM";
  return "LOW";
}

/**
 * Ponto de entrada do serviço. Nunca lança: qualquer contexto estranho leva
 * ao caminho conservador (transferir para humano).
 */
export function decidirConfianca(ctx: ContextoConfianca): ResultadoConfianca {
  const cats = categoriasDoContexto(ctx);
  const checks = executarValidadores(ctx);
  const reprovados = checks.filter((c) => !c.aprovado);
  const blockers = [...new Set(reprovados.map((c) => c.bloqueador).filter(Boolean))] as Bloqueador[];

  const desconto = reprovados
    .filter((c) => !c.bloqueador)
    .reduce((soma, c) => soma + c.peso, 0);
  let score = blockers.length > 0 ? 0 : Math.max(0, Math.min(100, 100 - desconto));

  const motivos = reprovados.map((c) => (c.detalhe ? `${c.descricao} — ${c.detalhe}` : c.descricao));

  // Handoff já pedido pelo modelo: o pipeline de transferência assume o turno.
  if (ctx.businessContext.handoffSolicitado) {
    score = 100;
    return {
      score,
      level: "HIGH",
      decision: "ALLOW",
      blockers: [],
      checks,
      evidence: montarEvidencia(ctx, cats, ["handoff já solicitado pelo runtime"]),
    };
  }

  let decision: DecisaoMotor;
  if (blockers.length > 0) {
    decision = ACOES_DE_ESCRITA.has(ctx.requestedAction) ? "BLOCK_ACTION" : "HANDOFF";
  } else {
    const nv = nivel(score);
    if (nv === "HIGH") decision = "ALLOW";
    else if (nv === "MEDIUM") decision = ctx.businessContext.esclarecimentoUsado ? "HANDOFF" : "CLARIFY";
    else decision = "HANDOFF";
  }

  if (motivos.length === 0) motivos.push("evidências suficientes no sistema");

  return {
    score,
    level: nivel(score),
    decision,
    blockers,
    checks,
    evidence: montarEvidencia(ctx, cats, motivos),
  };
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
