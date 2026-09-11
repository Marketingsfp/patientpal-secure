/**
 * FASE 1 (MOTOR DE CONFIABILIDADE) — CONTEXTO DE AVALIAÇÃO.
 *
 * O motor já tinha validadores; o que faltava era ENTREGAR a eles os dados
 * reais do turno. Este módulo deriva, a partir do que realmente aconteceu
 * (fatos extraídos das ferramentas, consultas, ação do turno e instruções
 * publicadas), os campos que os validadores esperam:
 *
 * - fontes recuperadas, com publicação/vigência quando a origem informa;
 * - conflitos entre fatos do mesmo campo e escopo;
 * - candidatos de entidade (ambiguidade real, medida nos fatos);
 * - campos obrigatórios da ação aplicável.
 *
 * Regras que valem aqui:
 * - Ausência de evidência não vira evidência. Campo que a origem não informou
 *   fica ausente; quem decide o que fazer com isso é o validador.
 * - Instrução publicada é conteúdo CONFIÁVEL; mensagem do paciente e retorno
 *   de ferramenta continuam sendo DADO a verificar.
 * - Nada aqui consulta banco, rede ou modelo: é função pura e testável.
 */
import { detectarConflitosEntreFatos, normalizarTexto } from "./evidencia";
import type { FatoRecuperado } from "./evidencia";
import type {
  AcaoSolicitada,
  ConflitoDeFonte,
  ContextoConfianca,
  FonteRecuperada,
  InstrucoesDoTurno,
} from "./types";

// --------------------------------------------------------------- fontes

/** Origens consultadas em tempo real: o retorno é, por definição, o vigente. */
const FONTES_EM_TEMPO_REAL = new Set(["agenda", "crm", "atendimento"]);

/**
 * Traduz os fatos do turno em fontes recuperadas. Uma fonte por
 * origem + registro, com o sinal de vigência que a origem realmente forneceu.
 */
export function fontesDosFatos(fatos: FatoRecuperado[]): FonteRecuperada[] {
  const porChave = new Map<string, FonteRecuperada>();
  for (const f of fatos) {
    const referencia = f.registro ?? f.versao ?? null;
    const chave = `${f.fonte}|${referencia ?? ""}`;
    const atual = porChave.get(chave);
    const fonte: FonteRecuperada = {
      tipo: f.fonte,
      referencia,
      temConteudo: f.valor !== null && String(f.valor).trim() !== "",
      // Catálogo é lido SEMPRE na versão publicada (rascunho não é devolvido).
      ...(f.fonte === "catalogo_publicado" ? { publicado: true } : {}),
      ...(FONTES_EM_TEMPO_REAL.has(f.fonte) ? { ativo: true } : {}),
      ...(f.vigenteAte ? { expiraEm: f.vigenteAte } : {}),
    };
    if (!atual) porChave.set(chave, fonte);
    else if (!atual.temConteudo && fonte.temConteudo) porChave.set(chave, fonte);
  }
  return [...porChave.values()];
}

// ------------------------------------------------------------- candidatos

/** Campos de entidade cuja ambiguidade importa para a decisão. */
const CANDIDATOS_POR_CAMPO: Array<[string, (f: FatoRecuperado) => string | null | undefined]> = [
  ["procedimento", (f) => f.chave?.procedimento],
  ["medico", (f) => f.chave?.medicoNome],
  ["especialidade", (f) => f.chave?.especialidade],
];

/**
 * Candidatos observados nos fatos do turno. Dois procedimentos distintos
 * devolvidos para o mesmo pedido é ambiguidade REAL, não suposição.
 */
export function candidatosDeEntidade(fatos: FatoRecuperado[]): Record<string, string[]> {
  const saida: Record<string, string[]> = {};
  for (const [campo, ler] of CANDIDATOS_POR_CAMPO) {
    const vistos = new Map<string, string>();
    for (const f of fatos) {
      const v = ler(f);
      if (v === null || v === undefined || String(v).trim() === "") continue;
      const k = normalizarTexto(v);
      if (!vistos.has(k)) vistos.set(k, String(v).trim());
    }
    if (vistos.size > 0) saida[campo] = [...vistos.values()];
  }
  return saida;
}

// -------------------------------------------------------- campos obrigatórios

/**
 * Campos exigidos por ação. Mesma lista usada na validação imediatamente
 * antes de gravar o agendamento — não é uma segunda regra de negócio.
 */
export const CAMPOS_OBRIGATORIOS_POR_ACAO: Partial<Record<AcaoSolicitada, string[]>> = {
  criar_agendamento: ["medico_id", "inicio", "fim", "procedimento"],
  cancelar_agendamento: ["appointment_id"],
};

/** `null` = esta ação não tem lista declarada (não é "não precisa de dado"). */
export function camposObrigatoriosDaAcao(acao: AcaoSolicitada | null | undefined): string[] | null {
  if (!acao) return null;
  return CAMPOS_OBRIGATORIOS_POR_ACAO[acao] ?? null;
}

// ------------------------------------------------------------- instruções

/**
 * Obrigações explícitas do texto publicado, em texto simples.
 *
 * Agora é uma VISTA da representação estruturada (`extrairRegrasPublicadas`):
 * a mesma leitura que preserva blocos de várias linhas, condição e proibição.
 * Sem limite de quantidade e sem cortar texto — regra não some em silêncio.
 */
export function obrigacoesDoPrompt(texto: string | null | undefined, escopo = "whatsapp"): string[] {
  const { regras } = extrairRegrasPublicadas(texto, { escopo });
  const unicas: string[] = [];
  for (const r of regras) {
    if (!unicas.some((u) => normalizarTexto(u) === normalizarTexto(r.descricao))) {
      unicas.push(r.descricao);
    }
  }
  return unicas;
}

export type EntradaInstrucoesDoTurno = {
  escopo: string;
  versao?: string | null;
  versaoId?: string | null;
  publicadoEm?: string | null;
  origem?: string | null;
  hash?: string | null;
  /** Texto publicado usado NESTA execução (snapshot), quando disponível. */
  texto?: string | null;
};

export function montarInstrucoesDoTurno(e: EntradaInstrucoesDoTurno): InstrucoesDoTurno {
  // Texto e representação verificável vêm da MESMA publicação: o hash usado
  // aqui é o do texto avaliado, então alterar o texto invalida a
  // representação anterior (ver `regrasValidasParaPublicacao`).
  const hash = e.hash ?? hashDoTexto(e.texto ?? null);
  const { regras, limitacoes } = extrairRegrasPublicadas(e.texto ?? null, {
    escopo: e.escopo,
    versao: e.versao ?? null,
    versaoId: e.versaoId ?? null,
    hash,
  });
  return {
    escopo: e.escopo,
    versao: e.versao ?? null,
    versaoId: e.versaoId ?? null,
    publicadoEm: e.publicadoEm ?? null,
    origem: e.origem ?? null,
    hash,
    obrigacoes: regras.map((r) => r.descricao),
    regras,
    limitacoes,
  };
}

// ---------------------------------------------------------------- enriquecimento

/**
 * Completa o contexto com o que já existe no turno, sem sobrescrever nada que
 * o chamador tenha informado explicitamente.
 */
export function enriquecerContextoAvaliacao(ctx: ContextoConfianca): ContextoConfianca {
  const fatos = ctx.fatos ?? [];
  const fontes: FonteRecuperada[] =
    ctx.retrievedSources && ctx.retrievedSources.length > 0
      ? ctx.retrievedSources
      : fontesDosFatos(fatos);

  const detectados = detectarConflitosEntreFatos(fatos);
  const informados = ctx.conflitos ?? [];
  const conflitos: ConflitoDeFonte[] = [...informados];
  for (const c of detectados) {
    if (!conflitos.some((x) => x.campo === c.campo)) conflitos.push(c);
  }

  const candidatos =
    ctx.entityCandidates && Object.keys(ctx.entityCandidates).length > 0
      ? ctx.entityCandidates
      : candidatosDeEntidade(fatos);

  const obrigatorios =
    ctx.requiredFields && ctx.requiredFields.length > 0
      ? ctx.requiredFields
      : (camposObrigatoriosDaAcao(ctx.requestedAction) ?? undefined);

  return {
    ...ctx,
    retrievedSources: fontes,
    ...(conflitos.length > 0 ? { conflitos } : {}),
    ...(Object.keys(candidatos).length > 0 ? { entityCandidates: candidatos } : {}),
    ...(obrigatorios ? { requiredFields: obrigatorios } : {}),
  };
}
