/**
 * FASE 5 — CONTRATO COMUM DE RESULTADO DE RESPOSTA DA NINA (módulo puro).
 *
 * POR QUE EXISTE: hoje o texto que chega ao paciente pode nascer em cinco
 * lugares diferentes (modelo, gate de identificação, handoff, mídia não
 * suportada, erro técnico e encerramento). Cada um escrevia por conta própria,
 * então a mesma clínica tinha estilos diferentes e não dava para dizer, olhando
 * a mensagem entregue, qual configuração a produziu.
 *
 * Aqui fica APENAS a descrição do resultado: de onde veio, o que já está
 * comprovado, o que ainda falta e o que é proibido afirmar. Nada de banco, rede
 * ou relógio. Decisões operacionais protegidas (gravar agendamento, transferir
 * para humano, resolver conversa) continuam onde sempre estiveram — este módulo
 * não executa nada.
 */

/** Camada que produziu o resultado. */
export const ORIGENS_RESULTADO = [
  "modelo",
  "gate",
  "handoff",
  "midia",
  "erro",
  "encerramento",
] as const;
export type OrigemResultado = (typeof ORIGENS_RESULTADO)[number];

export const ROTULO_ORIGEM_RESULTADO: Record<OrigemResultado, string> = {
  modelo: "Comportamento do modelo",
  gate: "Regra técnica protegida (coleta e agendamento)",
  handoff: "Mensagem automática de transferência",
  midia: "Mensagem automática de mídia",
  erro: "Mensagem automática de falha",
  encerramento: "Mensagem automática de despedida",
};

/** O que fazer com o texto. */
export type EstadoResultado =
  /** Texto aprovado para entrega. */
  | "entregar"
  /** Nada deve ser enviado neste turno. */
  | "descartar"
  /** Há bloqueio: o texto não pode ser entregue como está. */
  | "pendente";

/**
 * Ação real concluída no turno. `confirmada` só é verdadeira quando o backend
 * devolveu evidência de gravação (por exemplo o `appointment_id`).
 */
export type AcaoConcluida = {
  acao: string;
  /** Chave de idempotência: a mesma ação nunca é executada duas vezes. */
  idempotencia: string;
  confirmada: boolean;
  /** Prova objetiva devolvida pelo backend (id gravado, protocolo). */
  evidencia: string | null;
};

export type ResultadoRespostaNina = {
  origem: OrigemResultado;
  estado: EstadoResultado;
  /** Texto conversacional já resolvido (padrão ou template publicado). */
  texto: string;
  /** Chave do template determinístico, quando o texto não veio do modelo. */
  chaveTemplate: string | null;
  /** Variáveis usadas para renderizar o template. */
  variaveis: Record<string, string>;
  /** Fatos que o texto pode afirmar porque há fonte/evidência. */
  fatosConfirmados: string[];
  acoesConcluidas: AcaoConcluida[];
  /** Dados que ainda faltam ao paciente informar. */
  camposPendentes: string[];
  /** Proibições que valem para este texto. */
  restricoes: string[];
};

export function criarResultado(
  parcial: Partial<ResultadoRespostaNina> & Pick<ResultadoRespostaNina, "origem" | "texto">,
): ResultadoRespostaNina {
  return {
    estado: "entregar",
    chaveTemplate: null,
    variaveis: {},
    fatosConfirmados: [],
    acoesConcluidas: [],
    camposPendentes: [],
    restricoes: [],
    ...parcial,
  };
}

/** Uma consulta só pode ser dada como marcada com evidência real de gravação. */
export function agendamentoComprovado(r: ResultadoRespostaNina): boolean {
  return r.acoesConcluidas.some(
    (a) => a.acao === "agendar" && a.confirmada && Boolean(a.evidencia),
  );
}

const AFIRMA_AGENDADO =
  /\b(agendad[oa]|agendamento (foi )?(realizad|confirmad)|marcad[oa] (com sucesso|para)|consulta (est[áa] )?(marcad|confirmad)|reservad[oa] para voc[êe])/i;

/** O texto afirma que a consulta existe? Usado para bloquear promessa sem prova. */
export function afirmaAgendamento(texto: string): boolean {
  return AFIRMA_AGENDADO.test(texto ?? "");
}

export type Verificacao = {
  ok: boolean;
  restricoes: string[];
};

/**
 * Confere o resultado contra as suas próprias evidências.
 * Em caminhos determinísticos (nossos textos) uma promessa sem prova é erro de
 * código e precisa ser barrada. Em texto do modelo o achado é registrado como
 * restrição — quem decide o bloqueio é o Confidence Engine, que já existe.
 */
export function verificarResultado(r: ResultadoRespostaNina): Verificacao {
  const restricoes: string[] = [];
  if (afirmaAgendamento(r.texto) && !agendamentoComprovado(r)) {
    restricoes.push("confirmacao_de_agendamento_sem_evidencia_de_gravacao");
  }
  const duplicadas = new Set<string>();
  for (const a of r.acoesConcluidas) {
    if (duplicadas.has(a.idempotencia)) restricoes.push(`acao_repetida:${a.acao}`);
    duplicadas.add(a.idempotencia);
  }
  return { ok: restricoes.length === 0, restricoes };
}
