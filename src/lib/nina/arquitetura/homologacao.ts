/**
 * FASE 10 — Leitura da execução de HOMOLOGAÇÃO na aba Arquitetura.
 *
 * Módulo PURO: recebe eventos já gravados no trace (e amostras já lidas do
 * teste de carga) e organiza para leitura. Não executa nada do atendimento,
 * não lê banco e nunca inventa etapa que não tenha sido registrada.
 *
 * Duas regras de representação, iguais às do backend real:
 *  - a avaliação do GPT Sol acontece DEPOIS da conversa e NÃO faz parte do
 *    caminho de geração da resposta;
 *  - o teste de carga (Luna) é mostrado agregado (execução → leads →
 *    mensagens), nunca como centenas de componentes.
 */
import type { EventoTrace, StatusEvento } from "./tracing";

/** Uma execução veio da homologação quando a entrada foi marcada assim. */
export function ehExecucaoHomologacao(eventos: EventoTrace[]): boolean {
  return eventos.some(
    (e) => e.node_id === "message.inbound" && e.metadata?.["origem"] === "homologacao",
  );
}

export type FaseHomologacao = {
  id: string;
  rotulo: string;
  descricao: string;
  /** `true` quando existe evento registrado para esta fase. */
  ocorreu: boolean;
  status: StatusEvento | null;
  /** `posterior` = fora do caminho de geração da resposta. */
  momento: "geracao" | "posterior";
};

const NODES_POR_FASE: Record<string, string[]> = {
  entrada: ["message.inbound"],
  contexto: ["context.load", "session.resolve", "flow.state"],
  prompt: ["prompt.compose", "instructions.published"],
  conhecimento: ["tool.knowledge.lookup", "tool.catalog.lookup", "tool.catalog.list"],
  modelo: ["llm.generate", "llm.model_flag"],
  resposta: ["response.validate", "message.outbound", "message.persist"],
};

function estadoDaFase(
  eventos: EventoTrace[],
  nodes: string[],
): { ocorreu: boolean; status: StatusEvento | null } {
  const doGrupo = eventos.filter((e) => nodes.includes(e.node_id));
  if (doGrupo.length === 0) return { ocorreu: false, status: null };
  if (doGrupo.some((e) => e.status === "error")) return { ocorreu: true, status: "error" };
  const ultimo = doGrupo[doGrupo.length - 1]!;
  return { ocorreu: true, status: ultimo.status };
}

/** Ferramentas realmente chamadas nesta execução (node `tool.*`). */
export function ferramentasDaExecucao(eventos: EventoTrace[]): string[] {
  const ids = eventos.filter((e) => e.node_id.startsWith("tool.")).map((e) => e.node_id);
  return [...new Set(ids)];
}

export type PipelineHomologacao = {
  /** Quem originou a mensagem, quando o trace registrou. */
  origem: "homologacao" | "whatsapp" | "desconhecida";
  fases: FaseHomologacao[];
  ferramentas: string[];
};

/**
 * Pipeline real de uma mensagem de homologação. `avaliacaoSol` só é marcada
 * como ocorrida quando a avaliação já existe — ela nunca participa da geração.
 */
export function montarPipelineHomologacao(
  eventos: EventoTrace[],
  opcoes?: { avaliacaoSol?: boolean },
): PipelineHomologacao {
  const entrada = eventos.find((e) => e.node_id === "message.inbound");
  const origemBruta = entrada?.metadata?.["origem"];
  const origem =
    origemBruta === "homologacao" || origemBruta === "whatsapp" ? origemBruta : "desconhecida";

  const fases: FaseHomologacao[] = [
    ["entrada", "Mensagem de teste", "Fala do paciente de teste recebida pelo núcleo da Nina"],
    ["contexto", "Contexto", "Clínica, conversa e histórico do ciclo de teste"],
    ["prompt", "Prompt", "Instruções publicadas e montagem do prompt principal"],
    ["conhecimento", "Conhecimento (RAG)", "Consultas ao catálogo e à base de conhecimento"],
    ["modelo", "Modelo", "Chamada ao modelo que gera a resposta"],
    ["resposta", "Resposta", "Validação, envio e registro da resposta"],
  ].map(([id, rotulo, descricao]) => {
    const estado = estadoDaFase(eventos, NODES_POR_FASE[id as string] ?? []);
    return {
      id: id as string,
      rotulo: rotulo as string,
      descricao: descricao as string,
      momento: "geracao" as const,
      ...estado,
    };
  });

  const ferramentas = ferramentasDaExecucao(eventos);
  if (ferramentas.length > 0) {
    // Ferramentas ficam entre modelo e resposta, como no fluxo real.
    fases.splice(5, 0, {
      id: "tools",
      rotulo: "Ferramentas",
      descricao: "Agenda, catálogo, paciente e transferência no ambiente de teste",
      ocorreu: true,
      status: eventos.some((e) => e.node_id.startsWith("tool.") && e.status === "error")
        ? "error"
        : "ok",
      momento: "geracao",
    });
  }

  fases.push({
    id: "avaliacao",
    rotulo: "Avaliação (GPT Sol)",
    descricao: "Executada depois da conversa; não influencia a resposta gerada",
    ocorreu: Boolean(opcoes?.avaliacaoSol),
    status: opcoes?.avaliacaoSol ? "ok" : null,
    momento: "posterior",
  });

  return { origem, fases, ferramentas };
}

// ─────────────────── Teste de carga (Luna): visão agregada ───────────────────

export type AmostraCarga = {
  indice: number;
  lead_indice: number;
  cenario?: string | null;
  mensagem?: string | null;
  status: string;
  latencia_ms?: number | null;
  ferramentas?: number | null;
  erro?: string | null;
  created_at?: string | null;
};

export type LeadAgregado = {
  leadIndice: number;
  mensagens: number;
  ok: number;
  erros: number;
  /** Latência média apenas das mensagens concluídas com sucesso. */
  latenciaMediaMs: number | null;
  amostras: AmostraCarga[];
};

export type CargaAgregada = {
  totalMensagens: number;
  leads: number;
  ok: number;
  erros: number;
  porLead: LeadAgregado[];
};

/** Execução de carga → leads → mensagens (com detalhe sob demanda). */
export function agregarCargaLuna(amostras: AmostraCarga[]): CargaAgregada {
  const mapa = new Map<number, LeadAgregado>();
  for (const a of amostras) {
    const atual =
      mapa.get(a.lead_indice) ??
      { leadIndice: a.lead_indice, mensagens: 0, ok: 0, erros: 0, latenciaMediaMs: null, amostras: [] };
    atual.mensagens += 1;
    if (a.status === "ok") atual.ok += 1;
    else atual.erros += 1;
    atual.amostras.push(a);
    mapa.set(a.lead_indice, atual);
  }

  const porLead = [...mapa.values()]
    .map((lead) => {
      const latencias = lead.amostras
        .filter((a) => a.status === "ok" && typeof a.latencia_ms === "number")
        .map((a) => a.latencia_ms as number);
      return {
        ...lead,
        latenciaMediaMs: latencias.length
          ? Math.round(latencias.reduce((s, v) => s + v, 0) / latencias.length)
          : null,
      };
    })
    .sort((a, b) => a.leadIndice - b.leadIndice);

  return {
    totalMensagens: amostras.length,
    leads: porLead.length,
    ok: porLead.reduce((s, l) => s + l.ok, 0),
    erros: porLead.reduce((s, l) => s + l.erros, 0),
    porLead,
  };
}
