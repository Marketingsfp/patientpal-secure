/**
 * FASE 7 — Linha do tempo, entrada/saída e classificação de erros.
 *
 * Módulo puro: recebe os eventos já gravados no trace e organiza para leitura.
 * Nunca inventa horário, duração ou tentativa que não tenha sido registrada.
 */
import { NODES_ARQUITETURA } from "./manifesto";
import type { EventoTrace, StatusEvento } from "./tracing";
import { metadataSegura } from "./detalhes-ia";

// ───────────────────────────── Timeline ─────────────────────────────

export type MarcoTimeline = {
  /** Horário exatamente como registrado (ISO). */
  instante: string;
  /** Horário formatado; mostra milissegundos apenas quando existem. */
  horaExibida: string;
  nodeId: string;
  nome: string;
  evento: EventoTrace["event_type"];
  status: StatusEvento;
  duracaoMs: number | null;
  ciclo: number;
};

function nomeDoNode(id: string): string {
  return NODES_ARQUITETURA.find((n) => n.id === id)?.nome ?? id;
}

/** Formata o horário sem acrescentar precisão que o registro não tem. */
export function horaDoInstante(iso: string): string {
  const partes = /T(\d{2}:\d{2}:\d{2})(\.\d{1,3})?/.exec(iso);
  if (!partes) return iso;
  return `${partes[1]}${partes[2] ?? ""}`;
}

/** Marcos em ordem cronológica, um por evento realmente registrado. */
export function montarTimeline(eventos: EventoTrace[]): MarcoTimeline[] {
  return eventos
    .map((e) => {
      const instante =
        e.event_type === "started" || e.event_type === "retry"
          ? e.started_at
          : (e.finished_at ?? e.started_at);
      return {
        instante,
        horaExibida: horaDoInstante(instante),
        nodeId: e.node_id,
        nome: nomeDoNode(e.node_id),
        evento: e.event_type,
        status: e.status,
        duracaoMs: e.duration_ms,
        ciclo: e.cycle_id,
      };
    })
    .sort((a, b) => a.instante.localeCompare(b.instante));
}

// ───────────────────────── Entrada e saída ─────────────────────────

export type EtapaJornada = {
  rotulo: string;
  descricao: string;
  ocorreu: boolean;
};

export type EntradaSaida = {
  /** Mensagem do paciente, já mascarada pelo trace. */
  mensagemOriginal: string | null;
  /** Resposta final enviada ao paciente. */
  respostaFinal: string | null;
  /** Sequência PACIENTE → BACKEND → IA → TOOLS → BACKEND → RESPOSTA → PACIENTE. */
  jornada: EtapaJornada[];
  entregue: boolean;
};

const NODES_IA = new Set(["llm.generate", "llm.model_flag"]);

function primeiroTexto(
  eventos: EventoTrace[],
  nodeId: string,
  chaves: string[],
): string | null {
  for (const evento of eventos) {
    if (evento.node_id !== nodeId) continue;
    const m = metadataSegura(evento.metadata);
    for (const chave of chaves) {
      const valor = m[chave];
      if (typeof valor === "string" && valor.trim()) return valor;
    }
  }
  return null;
}

export function montarEntradaSaida(eventos: EventoTrace[]): EntradaSaida {
  const usados = new Set(eventos.map((e) => e.node_id));
  const houveIA = [...usados].some((id) => NODES_IA.has(id));
  const houveTool = [...usados].some((id) => id.startsWith("tool."));
  const enviou = eventos.some(
    (e) => e.node_id === "message.outbound" && e.status === "ok",
  );

  return {
    mensagemOriginal: primeiroTexto(eventos, "message.inbound", ["mensagem", "texto"]),
    respostaFinal: primeiroTexto(eventos, "message.outbound", ["resposta", "texto"]),
    jornada: [
      { rotulo: "Paciente", descricao: "Mensagem recebida", ocorreu: usados.has("message.inbound") },
      {
        rotulo: "Backend",
        descricao: "Registro, conversa e contexto",
        ocorreu: usados.has("message.persist") || usados.has("context.load"),
      },
      { rotulo: "IA", descricao: "Modelo consultado", ocorreu: houveIA },
      { rotulo: "Ferramentas", descricao: "Consultas e ações", ocorreu: houveTool },
      {
        rotulo: "Backend",
        descricao: "Validação e persistência da resposta",
        ocorreu: usados.has("response.validate") || usados.has("message.persist"),
      },
      { rotulo: "Resposta", descricao: "Envio solicitado", ocorreu: usados.has("message.outbound") },
      { rotulo: "Paciente", descricao: "Resposta entregue", ocorreu: enviou },
    ],
    entregue: enviou,
  };
}

// ───────────────────────────── Erros ─────────────────────────────

export const TIPOS_FALHA = [
  "tecnico",
  "integracao",
  "negocio",
  "modelo",
  "cancelamento",
  "timeout",
] as const;
export type TipoFalha = (typeof TIPOS_FALHA)[number];

export const ROTULOS_FALHA: Record<TipoFalha, string> = {
  tecnico: "Erro técnico",
  integracao: "Erro de integração",
  negocio: "Erro de regra de negócio",
  modelo: "Erro do modelo de IA",
  cancelamento: "Cancelamento",
  timeout: "Tempo esgotado",
};

/** Classifica a falha a partir do evento, do node e da mensagem registrada. */
export function classificarFalha(
  nodeId: string,
  status: StatusEvento,
  mensagem: string | null | undefined,
  tipoInformado?: unknown,
): TipoFalha {
  if (typeof tipoInformado === "string") {
    const bruto = tipoInformado.toLowerCase();
    if ((TIPOS_FALHA as readonly string[]).includes(bruto)) return bruto as TipoFalha;
  }
  if (status === "cancelled") return "cancelamento";
  const texto = (mensagem ?? "").toLowerCase();
  if (/timeout|tempo esgotado|timed out|deadline/.test(texto)) return "timeout";
  if (/indispon[ií]vel|conflito|regra|n[aã]o permitido|sem vaga|fora do hor[aá]rio/.test(texto)) {
    return "negocio";
  }
  if (NODES_IA.has(nodeId) || /modelo|gateway|llm|token/.test(texto)) return "modelo";
  if (
    nodeId === "message.outbound" ||
    /meta|whatsapp|http|api|rede|network|fetch|502|503|504/.test(texto)
  ) {
    return "integracao";
  }
  return "tecnico";
}

export type TentativaFalha = {
  ordem: number;
  status: StatusEvento;
  mensagem: string | null;
  instante: string;
};

export type FalhaExecucao = {
  nodeId: string;
  nome: string;
  tipo: TipoFalha;
  rotulo: string;
  /** Mensagem técnica já sanitizada pelo trace. */
  mensagem: string | null;
  tentativas: TentativaFalha[];
  totalTentativas: number;
  /** Node de fallback acionado depois da falha, quando houver. */
  fallback: string | null;
  /** true quando uma tentativa posterior do mesmo node terminou bem. */
  recuperado: boolean;
};

const NODES_FALLBACK = new Set(["audio.fallback", "error.handle"]);

export function levantarFalhas(eventos: EventoTrace[]): FalhaExecucao[] {
  const ordenados = [...eventos].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const porNode = new Map<string, FalhaExecucao>();

  for (const evento of ordenados) {
    const problema = evento.status === "error" || evento.status === "cancelled";
    const m = metadataSegura(evento.metadata);
    const mensagem = typeof m["erro"] === "string" ? m["erro"] : null;

    if (problema) {
      const atual = porNode.get(evento.node_id);
      const tentativa: TentativaFalha = {
        ordem: (atual?.tentativas.length ?? 0) + 1,
        status: evento.status,
        mensagem,
        instante: evento.finished_at ?? evento.started_at,
      };
      if (atual) {
        atual.tentativas.push(tentativa);
        atual.totalTentativas = atual.tentativas.length;
        atual.mensagem = mensagem ?? atual.mensagem;
        atual.recuperado = false;
      } else {
        const tipo = classificarFalha(evento.node_id, evento.status, mensagem, m["tipo_erro"]);
        porNode.set(evento.node_id, {
          nodeId: evento.node_id,
          nome: nomeDoNode(evento.node_id),
          tipo,
          rotulo: ROTULOS_FALHA[tipo],
          mensagem,
          tentativas: [tentativa],
          totalTentativas: 1,
          fallback: null,
          recuperado: false,
        });
      }
      continue;
    }

    if (evento.status === "ok" && porNode.has(evento.node_id)) {
      porNode.get(evento.node_id)!.recuperado = true;
    }
    if (NODES_FALLBACK.has(evento.node_id)) {
      for (const falha of porNode.values()) {
        if (!falha.fallback) falha.fallback = nomeDoNode(evento.node_id);
      }
    }
  }

  return [...porNode.values()];
}

// ─────────────────────────── Diagnóstico ───────────────────────────

export type DiagnosticoExecucao = {
  timeline: MarcoTimeline[];
  entradaSaida: EntradaSaida;
  falhas: FalhaExecucao[];
  /** Atendimento concluído mesmo tendo havido falha no meio do caminho. */
  sucessoComFalhaIntermediaria: boolean;
  /** Resultado final da execução, do ponto de vista do paciente. */
  resultadoFinal: "entregue" | "sem_resposta" | "cancelado";
  duracaoTotalMs: number | null;
};

export function diagnosticarExecucao(eventos: EventoTrace[]): DiagnosticoExecucao {
  const timeline = montarTimeline(eventos);
  const entradaSaida = montarEntradaSaida(eventos);
  const falhas = levantarFalhas(eventos);
  const cancelado = falhas.some((f) => f.tipo === "cancelamento");

  let duracao: number | null = null;
  if (timeline.length >= 2) {
    const inicio = Date.parse(timeline[0]!.instante);
    const fim = Date.parse(timeline[timeline.length - 1]!.instante);
    if (Number.isFinite(inicio) && Number.isFinite(fim)) duracao = Math.max(fim - inicio, 0);
  }

  return {
    timeline,
    entradaSaida,
    falhas,
    sucessoComFalhaIntermediaria: entradaSaida.entregue && falhas.length > 0,
    resultadoFinal: entradaSaida.entregue ? "entregue" : cancelado ? "cancelado" : "sem_resposta",
    duracaoTotalMs: duracao,
  };
}
