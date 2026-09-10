/**
 * FASE 1 — TIPO DO TURNO (turnType) E MATRIZ DE APLICABILIDADE.
 *
 * O Confidence Engine avaliava todo turno como se fosse uma resposta factual:
 * um "oi" caía em INTENCAO_AMBIGUA / NECESSIDADE_DE_FONTE_INDETERMINADA /
 * SEM_CONSULTA_PARA_ACAO_QUE_EXIGE_DADO e derrubava a nota. Isso é um falso
 * negativo: uma saudação não tem fonte a consultar, ferramenta a executar nem
 * ação a proteger.
 *
 * Este módulo classifica a NATUREZA do turno e centraliza, em UM único lugar,
 * quais dimensões são exigíveis. Nenhum validador implementa `if saudacao`.
 *
 * Ele é puro: não fala com banco, modelo, prompt ou ferramentas. O Prompt de
 * Comportamento continua vindo exclusivamente de Arquitetura → Instruções da
 * Nina; nada aqui gera texto para o paciente.
 */
import type { IntencaoNina } from "../atendimento-fase1";
import { normalizar } from "@/lib/nina-especialidade";
import type { AcaoSolicitada } from "./types";

/** Natureza do turno atual. */
export type TipoTurno =
  /** Só cumprimento: "oi", "bom dia". Nada a pesquisar nem executar. */
  | "SAUDACAO"
  /** Pedido ainda sem detalhes suficientes: "quero marcar", "uma informação". */
  | "ESCLARECIMENTO"
  /** Pergunta factual específica: "qual o valor da ressonância?". */
  | "INFORMACAO"
  /** Operação real prestes a acontecer (agendar/cancelar). */
  | "OPERACAO"
  /** Transferência para atendimento humano. */
  | "HANDOFF";

/** Quais dimensões o turno realmente exige. Fonte única da verdade. */
export type AplicabilidadeTurno = {
  /** Exige fonte oficial (catálogo publicado) para o que afirma. */
  requiresSource: boolean;
  /** Exige que alguma ferramenta tenha sido consultada. */
  requiresTool: boolean;
  /** Exige confirmação da agenda. */
  requiresSchedule: boolean;
  /** Exige avaliação de segurança da ação (action_safety). */
  requiresActionSafety: boolean;
};

/**
 * MATRIZ CENTRAL. Alterar exigência de validador é alterar esta tabela —
 * nunca espalhar exceções pelos validadores.
 */
export const MATRIZ_APLICABILIDADE: Record<TipoTurno, AplicabilidadeTurno> = {
  SAUDACAO: {
    requiresSource: false,
    requiresTool: false,
    requiresSchedule: false,
    requiresActionSafety: false,
  },
  ESCLARECIMENTO: {
    // Se a própria resposta afirmar um fato, o grounding por claim continua
    // valendo — isso é medido pelo texto, não pelo tipo do turno.
    requiresSource: false,
    requiresTool: false,
    requiresSchedule: false,
    requiresActionSafety: false,
  },
  INFORMACAO: {
    requiresSource: true,
    requiresTool: true,
    requiresSchedule: false,
    requiresActionSafety: false,
  },
  OPERACAO: {
    requiresSource: true,
    requiresTool: true,
    requiresSchedule: true,
    requiresActionSafety: true,
  },
  HANDOFF: {
    requiresSource: false,
    requiresTool: false,
    requiresSchedule: false,
    requiresActionSafety: true,
  },
};

/** Turno não classificado: conservador (tudo exigível), nunca otimista. */
export const APLICABILIDADE_DESCONHECIDA: AplicabilidadeTurno = {
  requiresSource: true,
  requiresTool: true,
  requiresSchedule: false,
  requiresActionSafety: true,
};

export function aplicabilidadeDoTurno(tipo?: TipoTurno | null): AplicabilidadeTurno {
  return tipo ? MATRIZ_APLICABILIDADE[tipo] : APLICABILIDADE_DESCONHECIDA;
}

const SAUDACOES =
  /^(oi+|ola+|opa|eae|e ai|alo+|bom dia|boa tarde|boa noite|boa madrugada|tudo bem|tudo bom|hey|hi|hello)$/;

/** Mensagem que é APENAS um cumprimento (com ou sem pontuação/emoji). */
export function ehSaudacaoPura(mensagem: string): boolean {
  const texto = normalizar(mensagem ?? "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!texto) return false;
  if (SAUDACOES.test(texto)) return true;
  // "oi bom dia", "ola boa tarde" — composições de cumprimentos.
  const partes = texto.split(" ");
  if (partes.length > 4) return false;
  const combinacoes = [
    texto,
    partes.join(" "),
  ];
  if (combinacoes.some((c) => SAUDACOES.test(c))) return true;
  const tokens = new Set(["oi", "ola", "opa", "bom", "boa", "dia", "tarde", "noite", "alo", "tudo", "bem", "bom"]);
  return partes.every((p) => tokens.has(p));
}

/** Intenções que representam pergunta factual específica. */
const INTENCOES_INFORMATIVAS: IntencaoNina[] = [
  "valor",
  "financeiro",
  "horario",
  "endereco",
  "preparo",
  "documentos",
  "disponibilidade",
  "medico",
];

export type EntradaTipoTurno = {
  mensagem: string;
  intencoes: IntencaoNina[];
  /** Ação executável já autorizada pelo fluxo real, quando houver. */
  acao?: AcaoSolicitada | null;
  intentAmbiguo?: boolean;
};

/**
 * Classifica o turno. Ordem: operação real > handoff > saudação >
 * informação factual > esclarecimento.
 */
export function classificarTipoTurno(e: EntradaTipoTurno): TipoTurno {
  const acao = e.acao ?? null;
  if (acao === "criar_agendamento" || acao === "cancelar_agendamento") return "OPERACAO";
  if (acao === "transferir_humano" || e.intencoes.includes("falar_humano")) return "HANDOFF";
  if (ehSaudacaoPura(e.mensagem)) return "SAUDACAO";
  if (e.intencoes.some((i) => INTENCOES_INFORMATIVAS.includes(i)) && e.intentAmbiguo !== true) {
    return "INFORMACAO";
  }
  return "ESCLARECIMENTO";
}

/**
 * "Nenhuma ação" ≠ "ação desconhecida".
 *
 * `null` = este turno legitimamente não tem ação executável (saudação,
 * esclarecimento). `"desconhecida"` = o sistema não conseguiu entender o
 * pedido — continua contando contra a confiança.
 */
export function acaoDoTipoDeTurno(
  tipo: TipoTurno,
  acaoCalculada: AcaoSolicitada,
  mensagem = "",
): AcaoSolicitada | null {
  if (tipo === "SAUDACAO") return null;
  if (acaoCalculada === "nenhuma") return null;
  if (tipo === "ESCLARECIMENTO") {
    // Assunto solto ("preciso fazer um exame") ainda não é ação executável.
    if (acaoCalculada === "responder_informacao") return null;
    if (acaoCalculada === "desconhecida" && pedidoLegivelDeEsclarecimento(mensagem)) return null;
  }
  return acaoCalculada;
}

/**
 * A pessoa disse o que quer em termos gerais ("queria uma informação"), só
 * não deu detalhes. Isso é esclarecimento normal — não é pedido ilegível.
 */
export function pedidoLegivelDeEsclarecimento(mensagem: string): boolean {
  const texto = normalizar(mensagem ?? "").trim();
  if (!texto) return false;
  return /\b(informacao|informacoes|duvida|duvidas|pergunta|saber|ajuda|ajudar|preciso|queria|gostaria|quero|pode me)\b/.test(
    texto,
  );
}
