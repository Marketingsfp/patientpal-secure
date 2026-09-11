/**
 * PRECEDÊNCIA DO TURNO NO ATENDIMENTO NORMAL.
 *
 * O resolvedor de precedência já existia, mas só era usado na verificação
 * especial de fonte. Aqui ele passa a valer no fluxo comum da Nina:
 *
 *   1. lê as regras da versão PUBLICADA (mesma representação verificável usada
 *      pelo motor de confiabilidade);
 *   2. seleciona as que se aplicam a ESTA mensagem, neste ambiente e neste
 *      estado de sessão;
 *   3. resolve o conflito com a regra geral de apresentação;
 *   4. reúne, no MESMO contrato, as instruções adicionais do turno
 *      (esclarecimento, correção), cada uma com origem, prioridade e motivo.
 *
 * Regras que valem aqui:
 * - Só uma exceção PUBLICADA aplicável dispensa a apresentação. Texto do
 *   paciente, fato do fluxo ou instrução interna não dispensam nada.
 * - Nenhuma exceção desliga item inegociável (privacidade, autorização,
 *   comprovação de operação, baixa confiabilidade): a tentativa é registrada
 *   e descartada pelo resolvedor.
 * - Regra publicada que não pôde ser interpretada com segurança não vira
 *   exceção: fica registrada como limitação.
 *
 * Módulo PURO: sem banco, sem rede, sem modelo.
 */
import {
  extrairRegrasPublicadas,
  regraSeAplica,
  type RegraPublicada,
} from "@/lib/nina/confidence/regras-publicadas";
import {
  REGRA_SAUDACAO,
  resolverPrecedencia,
  resumoPrecedencia,
  saudacaoObrigatoriaEfetiva,
  textoContratoPrecedencia,
  type EventoDeTurno,
  type NivelPrecedencia,
  type ResultadoPrecedencia,
  type RestricaoEstruturada,
} from "@/lib/nina/prompt/precedencia";

/** Regra geral publicada de apresentação — o caso comum do atendimento. */
export const REGRA_GERAL_APRESENTACAO: RestricaoEstruturada = {
  codigo: REGRA_SAUDACAO,
  nivel: "regra_geral",
  origem: "comportamento publicado",
  descricao: "apresentação obrigatória na primeira resposta da sessão",
  texto:
    "Na primeira resposta desta sessão, apresente-se conforme o comportamento publicado.",
};

/**
 * Instrução adicional do turno (esclarecimento, correção de rota, etc.).
 * Passa a viajar no mesmo contrato, com origem, prioridade e motivo — nunca
 * mais como um bloco solto ou como falsa mensagem do paciente.
 */
export type InstrucaoAdicionalTurno = {
  codigo: string;
  origem: string;
  motivo: string;
  texto: string;
  /** Prioridade dentro do contrato. Padrão: regra geral. */
  nivel?: NivelPrecedencia;
};

export type EntradaPrecedenciaTurno = {
  /** Texto da versão publicada usada NESTE turno. */
  textoPublicado?: string | null;
  escopo: string;
  hash?: string | null;
  versao?: string | null;
  versaoId?: string | null;
  publicadoEm?: string | null;
  mensagemPaciente?: string | null;
  ambiente: string;
  /** Estado da sessão: a apresentação seria exigida neste turno? */
  saudacaoObrigatoria: boolean;
  instrucoesAdicionais?: readonly InstrucaoAdicionalTurno[];
  eventos?: readonly EventoDeTurno[];
};

export type PrecedenciaTurno = {
  /** Regras publicadas aplicáveis a esta mensagem/ambiente. */
  regrasAplicaveis: RegraPublicada[];
  resultado: ResultadoPrecedencia;
  /** A apresentação continua obrigatória depois da precedência? */
  saudacaoObrigatoria: boolean;
  /** Código da exceção que dispensou a apresentação (quando houver). */
  saudacaoDispensadaPor: string | null;
  /** Bloco de contrato para o system prompt (vazio quando não há restrição). */
  contrato: string;
  /** Resumo auditável, sem PII. */
  resumo: ReturnType<typeof resumoPrecedencia> & { limitacoes: string[] };
};

/** A regra publicada proíbe apresentação/saudação nesta resposta? */
function proibeSaudacao(r: RegraPublicada): boolean {
  return r.proibicoes.includes("saudacao");
}

/**
 * Uma regra publicada vira EXCEÇÃO do turno quando é condicional (vale só em
 * certas mensagens) — regra que vale sempre é o caso comum, não exceção.
 */
function nivelDaRegra(r: RegraPublicada): NivelPrecedencia {
  return r.condicao.tipo === "sempre" ? "regra_geral" : "excecao_publicada";
}

function restricaoDaRegra(r: RegraPublicada, suprimeApresentacao: boolean): RestricaoEstruturada {
  return {
    codigo: `REGRA_PUBLICADA_${r.ordem}`,
    nivel: nivelDaRegra(r),
    origem: `instruções publicadas (${r.escopo}${r.versao ? ` v${r.versao}` : ""})`,
    descricao: r.descricao.slice(0, 300),
    motivo:
      r.condicao.tipo === "sempre"
        ? "regra publicada aplicável a qualquer turno"
        : `condição atendida neste turno (${r.condicao.tipo})`,
    ...(suprimeApresentacao ? { suprime: [REGRA_SAUDACAO] } : {}),
    texto: r.trecho,
  };
}

/**
 * Determina, ANTES de chamar o modelo, o que vale neste turno.
 */
export function resolverPrecedenciaDoTurno(e: EntradaPrecedenciaTurno): PrecedenciaTurno {
  const extracao = extrairRegrasPublicadas(e.textoPublicado ?? "", {
    escopo: e.escopo,
    hash: e.hash ?? null,
    versao: e.versao ?? null,
    versaoId: e.versaoId ?? null,
    publicadoEm: e.publicadoEm ?? null,
  });

  const aplicaveis = extracao.regras.filter((r) =>
    regraSeAplica(r, {
      mensagemPaciente: e.mensagemPaciente ?? null,
      ambiente: e.ambiente ?? null,
    }),
  );

  // Regra não interpretada não vira exceção: só limitação registrada.
  const interpretadas = aplicaveis.filter((r) => r.interpretada);
  const limitacoes = [...extracao.limitacoes];
  if (aplicaveis.some((r) => !r.interpretada) && !limitacoes.includes("REGRA_APLICAVEL_NAO_INTERPRETADA")) {
    limitacoes.push("REGRA_APLICAVEL_NAO_INTERPRETADA");
  }

  // A apresentação só é dispensada quando uma regra CONDICIONAL aplicável
  // proíbe saudação nesta resposta.
  const dispensa = interpretadas.find((r) => proibeSaudacao(r) && r.condicao.tipo !== "sempre");

  const excecoes: RestricaoEstruturada[] = [];
  const regrasGerais: RestricaoEstruturada[] = [REGRA_GERAL_APRESENTACAO];

  for (const r of interpretadas) {
    const restricao = restricaoDaRegra(r, r === dispensa);
    if (restricao.nivel === "excecao_publicada") excecoes.push(restricao);
    else regrasGerais.push(restricao);
  }

  for (const a of e.instrucoesAdicionais ?? []) {
    if (!a.texto.trim()) continue;
    const restricao: RestricaoEstruturada = {
      codigo: a.codigo,
      nivel: a.nivel ?? "regra_geral",
      origem: a.origem,
      motivo: a.motivo,
      descricao: a.motivo,
      texto: a.texto,
    };
    if (restricao.nivel === "excecao_publicada" || restricao.nivel === "inegociavel") {
      excecoes.push(restricao);
    } else {
      regrasGerais.push(restricao);
    }
  }

  const resultado = resolverPrecedencia({
    regrasGerais,
    excecoes,
    eventos: e.eventos ?? [],
  });

  const obrigatoria = saudacaoObrigatoriaEfetiva(e.saudacaoObrigatoria, resultado);

  return {
    regrasAplicaveis: aplicaveis,
    resultado,
    saudacaoObrigatoria: obrigatoria,
    saudacaoDispensadaPor:
      e.saudacaoObrigatoria && !obrigatoria && dispensa ? `REGRA_PUBLICADA_${dispensa.ordem}` : null,
    contrato: textoContratoPrecedencia(resultado),
    resumo: { ...resumoPrecedencia(resultado), limitacoes },
  };
}
