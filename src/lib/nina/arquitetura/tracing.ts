/**
 * FASE 2 — TRACING DAS EXECUÇÕES DA NINA (parte pura, testável).
 *
 * Objetivo: saber por quais componentes uma mensagem passou, quanto tempo cada
 * etapa levou e o que falhou — sem interferir no atendimento.
 *
 * Princípios inegociáveis:
 *  - nunca bloqueia nem altera a resposta ao paciente;
 *  - nunca guarda segredo (token, chave, senha, cookie, credencial);
 *  - dados pessoais são mascarados;
 *  - conteúdo é truncado e o número de eventos é limitado;
 *  - qualquer erro aqui é engolido: tracing quebrado não derruba atendimento.
 */

export const TIPOS_EVENTO = [
  "started",
  "completed",
  "failed",
  "skipped",
  "retry",
  "cancelled",
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const STATUS_EVENTO = ["running", "ok", "error", "skipped", "cancelled"] as const;
export type StatusEvento = (typeof STATUS_EVENTO)[number];

export type EventoTrace = {
  trace_id: string;
  execution_id: string;
  conversation_id: string | null;
  message_id: string | null;
  cycle_id: number;
  node_id: string;
  event_type: TipoEvento;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: StatusEvento;
  metadata: Record<string, unknown>;
};

/** Limites de segurança para manter o tracing leve. */
export const LIMITES = {
  /** Máximo de eventos por execução; o excedente é descartado. */
  eventos: 300,
  /** Máximo de chaves preservadas em cada metadata. */
  chaves: 20,
  /** Tamanho máximo de cada texto guardado. */
  texto: 240,
  /** Máximo de itens preservados em listas. */
  itens: 20,
  /** Profundidade máxima de objetos aninhados. */
  profundidade: 3,
} as const;

const CHAVES_PROIBIDAS =
  /(senha|password|token|api[_-]?key|apikey|secret|service[_-]?role|authorization|auth|cookie|credential|credencial|bearer|assinatura|signature|private[_-]?key)/i;

const CHAVES_PESSOAIS =
  /(telefone|phone|whatsapp|celular|cpf|email|e[_-]?mail|nascimento|endereco|paciente_nome|nome_paciente|nome_completo)/i;

/** Mascara um valor pessoal preservando apenas o suficiente para conferência. */
export function mascarar(valor: string): string {
  const texto = valor.trim();
  if (!texto) return "";
  if (texto.includes("@")) {
    const [usuario, dominio] = texto.split("@");
    const inicio = usuario.slice(0, 1);
    return `${inicio}${"*".repeat(Math.max(usuario.length - 1, 1))}@${dominio ?? ""}`;
  }
  const somenteDigitos = texto.replace(/\D/g, "");
  if (somenteDigitos.length >= 6) {
    return `***${somenteDigitos.slice(-4)}`;
  }
  if (texto.length <= 2) return "**";
  return `${texto.slice(0, 1)}${"*".repeat(texto.length - 2)}${texto.slice(-1)}`;
}

function truncar(texto: string): string {
  return texto.length > LIMITES.texto ? `${texto.slice(0, LIMITES.texto)}…` : texto;
}

function limpar(valor: unknown, profundidade: number, pessoal: boolean): unknown {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number" || typeof valor === "boolean") return valor;
  if (typeof valor === "string") return pessoal ? mascarar(valor) : truncar(valor);
  if (Array.isArray(valor)) {
    if (profundidade >= LIMITES.profundidade) return `[${valor.length} itens]`;
    return valor
      .slice(0, LIMITES.itens)
      .map((item) => limpar(item, profundidade + 1, pessoal));
  }
  if (typeof valor === "object") {
    if (profundidade >= LIMITES.profundidade) return "[objeto]";
    return sanitizarMetadata(valor as Record<string, unknown>, profundidade + 1);
  }
  // funções, símbolos e afins nunca entram no trace
  return null;
}

/** Remove segredos, mascara dados pessoais e limita tamanho da metadata. */
export function sanitizarMetadata(
  entrada: Record<string, unknown> | undefined | null,
  profundidade = 0,
): Record<string, unknown> {
  if (!entrada || typeof entrada !== "object") return {};
  const saida: Record<string, unknown> = {};
  let usadas = 0;
  for (const [chave, valor] of Object.entries(entrada)) {
    if (usadas >= LIMITES.chaves) break;
    if (CHAVES_PROIBIDAS.test(chave)) {
      saida[chave] = "[removido]";
      usadas += 1;
      continue;
    }
    saida[chave] = limpar(valor, profundidade, CHAVES_PESSOAIS.test(chave));
    usadas += 1;
  }
  return saida;
}

export type IdentificadoresTrace = {
  trace_id: string;
  execution_id: string;
  conversation_id?: string | null;
  message_id?: string | null;
};

export type Rastro = {
  readonly ids: Required<IdentificadoresTrace>;
  /** Ciclo atual (uma rodada modelo → ferramentas → modelo). */
  ciclo(): number;
  /** Abre um novo ciclo e devolve o número dele. */
  novoCiclo(): number;
  iniciar(nodeId: string, metadata?: Record<string, unknown>): void;
  concluir(nodeId: string, metadata?: Record<string, unknown>): void;
  falhar(nodeId: string, erro: unknown, metadata?: Record<string, unknown>): void;
  pular(nodeId: string, motivo: string): void;
  repetir(nodeId: string, tentativa: number, motivo?: string): void;
  cancelar(nodeId: string, motivo: string): void;
  eventos(): EventoTrace[];
  /** Eventos acumulados e limpeza do buffer, para gravação assíncrona. */
  drenar(): EventoTrace[];
  /** Quantos eventos foram descartados por excesso. */
  descartados(): number;
};

export type OpcoesRastro = IdentificadoresTrace & {
  /** Relógio injetável (milissegundos) — usado nos testes. */
  agora?: () => number;
};

/**
 * Cria o coletor de trace de uma execução. Todos os métodos são "à prova de
 * falha": qualquer exceção interna é engolida para não afetar o atendimento.
 */
export function criarRastro(opcoes: OpcoesRastro): Rastro {
  const agora = opcoes.agora ?? (() => Date.now());
  const ids = {
    trace_id: opcoes.trace_id,
    execution_id: opcoes.execution_id,
    conversation_id: opcoes.conversation_id ?? null,
    message_id: opcoes.message_id ?? null,
  };
  let ciclo = 1;
  let perdidos = 0;
  const buffer: EventoTrace[] = [];
  const abertos = new Map<string, number>();

  const chaveAberta = (nodeId: string) => `${ciclo}:${nodeId}`;

  function empurrar(evento: EventoTrace): void {
    if (buffer.length >= LIMITES.eventos) {
      perdidos += 1;
      return;
    }
    buffer.push(evento);
  }

  function base(
    nodeId: string,
    tipo: TipoEvento,
    status: StatusEvento,
    metadata?: Record<string, unknown>,
  ): EventoTrace {
    const inicioMs = abertos.get(chaveAberta(nodeId));
    const fimMs = agora();
    const encerra = tipo !== "started";
    return {
      ...ids,
      cycle_id: ciclo,
      node_id: nodeId,
      event_type: tipo,
      started_at: new Date(inicioMs ?? fimMs).toISOString(),
      finished_at: encerra ? new Date(fimMs).toISOString() : null,
      duration_ms: encerra && inicioMs !== undefined ? Math.max(fimMs - inicioMs, 0) : null,
      status,
      metadata: sanitizarMetadata(metadata),
    };
  }

  function seguro(fn: () => void): void {
    try {
      fn();
    } catch {
      /* tracing nunca interrompe o atendimento */
    }
  }

  return {
    ids,
    ciclo: () => ciclo,
    novoCiclo() {
      ciclo += 1;
      return ciclo;
    },
    iniciar(nodeId, metadata) {
      seguro(() => {
        abertos.set(chaveAberta(nodeId), agora());
        empurrar(base(nodeId, "started", "running", metadata));
      });
    },
    concluir(nodeId, metadata) {
      seguro(() => {
        empurrar(base(nodeId, "completed", "ok", metadata));
        abertos.delete(chaveAberta(nodeId));
      });
    },
    falhar(nodeId, erro, metadata) {
      seguro(() => {
        const mensagem = erro instanceof Error ? erro.message : String(erro ?? "erro");
        empurrar(
          base(nodeId, "failed", "error", { ...(metadata ?? {}), erro: truncar(mensagem) }),
        );
        abertos.delete(chaveAberta(nodeId));
      });
    },
    pular(nodeId, motivo) {
      seguro(() => empurrar(base(nodeId, "skipped", "skipped", { motivo })));
    },
    repetir(nodeId, tentativa, motivo) {
      seguro(() => {
        empurrar(base(nodeId, "retry", "running", { tentativa, motivo: motivo ?? null }));
        abertos.set(chaveAberta(nodeId), agora());
      });
    },
    cancelar(nodeId, motivo) {
      seguro(() => {
        empurrar(base(nodeId, "cancelled", "cancelled", { motivo }));
        abertos.delete(chaveAberta(nodeId));
      });
    },
    eventos: () => [...buffer],
    drenar: () => buffer.splice(0, buffer.length),
    descartados: () => perdidos,
  };
}

// ───────────────────────── Reconstrução do fluxo ─────────────────────────

export type PassoTrace = {
  node_id: string;
  cycle_id: number;
  status: StatusEvento;
  duration_ms: number | null;
  tentativas: number;
  started_at: string;
  finished_at: string | null;
  metadata: Record<string, unknown>;
};

export type FluxoReconstruido = {
  trace_id: string | null;
  execution_id: string | null;
  passos: PassoTrace[];
  /** Sequência de nodes na ordem em que foram percorridos. */
  caminho: string[];
  duracao_total_ms: number;
  falhas: string[];
  cancelados: string[];
  ignorados: string[];
  ciclos: number;
};

/** Reconstrói o caminho real percorrido a partir dos eventos gravados. */
export function reconstruirFluxo(eventos: EventoTrace[]): FluxoReconstruido {
  const ordenados = [...eventos].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const mapa = new Map<string, PassoTrace>();
  const ordem: string[] = [];

  for (const evento of ordenados) {
    const chave = `${evento.cycle_id}:${evento.node_id}`;
    let passo = mapa.get(chave);
    if (!passo) {
      passo = {
        node_id: evento.node_id,
        cycle_id: evento.cycle_id,
        status: evento.status,
        duration_ms: null,
        tentativas: 1,
        started_at: evento.started_at,
        finished_at: null,
        metadata: {},
      };
      mapa.set(chave, passo);
      ordem.push(chave);
    }
    if (evento.event_type === "retry") passo.tentativas += 1;
    if (evento.event_type !== "started") {
      passo.status = evento.status;
      passo.finished_at = evento.finished_at;
      if (evento.duration_ms !== null) {
        passo.duration_ms = (passo.duration_ms ?? 0) + evento.duration_ms;
      }
      passo.metadata = { ...passo.metadata, ...evento.metadata };
    }
  }

  const passos = ordem.map((chave) => mapa.get(chave)!);
  return {
    trace_id: eventos[0]?.trace_id ?? null,
    execution_id: eventos[0]?.execution_id ?? null,
    passos,
    caminho: passos.map((p) => p.node_id),
    duracao_total_ms: passos.reduce((soma, p) => soma + (p.duration_ms ?? 0), 0),
    falhas: passos.filter((p) => p.status === "error").map((p) => p.node_id),
    cancelados: passos.filter((p) => p.status === "cancelled").map((p) => p.node_id),
    ignorados: passos.filter((p) => p.status === "skipped").map((p) => p.node_id),
    ciclos: passos.reduce((maior, p) => Math.max(maior, p.cycle_id), 0),
  };
}

/** Nodes do manifesto que não foram percorridos nesta execução. */
export function nodesNaoUtilizados(eventos: EventoTrace[], todosOsNodes: string[]): string[] {
  const usados = new Set(eventos.map((e) => e.node_id));
  return todosOsNodes.filter((id) => !usados.has(id));
}
