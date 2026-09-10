/**
 * FASE 1 — ARCHITECTURE SYNC (comparação backend ↔ manifesto ↔ canvas).
 *
 * Módulo PURO de auditoria: guarda a foto da versão anterior do manifesto e
 * calcula o diff estrutural contra a versão atual. Não executa nada do fluxo
 * da Nina, não lê banco e não é importado pelo atendimento.
 */
import { MANIFESTO_ARQUITETURA, NODES_ARQUITETURA, type NodeArquitetura } from "./manifesto";

export type AssinaturaNode = {
  id: string;
  categoria: string;
  arquivo: string | null;
  funcao: string | null;
  anteriores: string[];
  seguintes: string[];
};

export type MudancaNode = {
  id: string;
  campos: string[];
  de: Partial<AssinaturaNode>;
  para: Partial<AssinaturaNode>;
};

export type DiffArquitetura = {
  adicionados: string[];
  alterados: MudancaNode[];
  removidos: string[];
  inalterados: string[];
  resumo: string;
};

/** Foto do manifesto na versão 1 (antes desta sincronização). */
export const SNAPSHOT_ANTERIOR: AssinaturaNode[] = [
  {
    "id": "message.inbound",
    "categoria": "ENTRADA",
    "arquivo": "src/routes/api/public/whatsapp.$clinicaId.ts",
    "funcao": "Route",
    "anteriores": [],
    "seguintes": [
      "message.log_raw"
    ]
  },
  {
    "id": "message.log_raw",
    "categoria": "OBSERVABILIDADE",
    "arquivo": "src/routes/api/public/whatsapp.$clinicaId.ts",
    "funcao": "registrarLogWebhook",
    "anteriores": [
      "message.inbound"
    ],
    "seguintes": [
      "message.validate"
    ]
  },
  {
    "id": "message.validate",
    "categoria": "VALIDACAO",
    "arquivo": "src/routes/api/public/whatsapp.$clinicaId.ts",
    "funcao": "verifySignature",
    "anteriores": [
      "message.log_raw"
    ],
    "seguintes": [
      "message.deduplicate",
      "status.update"
    ]
  },
  {
    "id": "status.update",
    "categoria": "OBSERVABILIDADE",
    "arquivo": "src/routes/api/public/whatsapp.$clinicaId.ts",
    "funcao": "registrarStatusWhatsapp",
    "anteriores": [
      "message.validate"
    ],
    "seguintes": []
  },
  {
    "id": "message.deduplicate",
    "categoria": "PROCESSAMENTO",
    "arquivo": "src/lib/whatsapp.server.ts",
    "funcao": "gerarRespostaNina",
    "anteriores": [
      "message.validate"
    ],
    "seguintes": [
      "conversation.ensure"
    ]
  },
  {
    "id": "conversation.ensure",
    "categoria": "PROCESSAMENTO",
    "arquivo": "src/lib/whatsapp.server.ts",
    "funcao": "carregarEstadoIdentidade",
    "anteriores": [
      "message.deduplicate"
    ],
    "seguintes": [
      "conversation.reopen",
      "routing.decide"
    ]
  },
  {
    "id": "conversation.reopen",
    "categoria": "PROCESSAMENTO",
    "arquivo": "src/lib/atendimento/handoff.server.ts",
    "funcao": "reabrirConversaPorMensagemPaciente",
    "anteriores": [
      "conversation.ensure"
    ],
    "seguintes": [
      "routing.decide"
    ]
  },
  {
    "id": "routing.decide",
    "categoria": "PROCESSAMENTO",
    "arquivo": "src/lib/atendimento/handoff.server.ts",
    "funcao": "ninaPodeResponder",
    "anteriores": [
      "conversation.ensure",
      "conversation.reopen"
    ],
    "seguintes": [
      "handoff.queue",
      "session.resolve"
    ]
  },
  {
    "id": "session.resolve",
    "categoria": "MEMORIA",
    "arquivo": "src/lib/nina/sessao.server.ts",
    "funcao": "resolverSessao",
    "anteriores": [
      "routing.decide"
    ],
    "seguintes": [
      "context.load"
    ]
  },
  {
    "id": "context.load",
    "categoria": "CONTEXTO",
    "arquivo": "src/lib/nina-contexto.server.ts",
    "funcao": "contextoClinicaTexto",
    "anteriores": [
      "session.resolve"
    ],
    "seguintes": [
      "instructions.catalog",
      "instructions.learnings",
      "prompt.compose"
    ]
  },
  {
    "id": "instructions.catalog",
    "categoria": "INSTRUCOES",
    "arquivo": "src/lib/nina/catalogo-prompt.server.ts",
    "funcao": "blocoPromptCatalogo",
    "anteriores": [
      "context.load"
    ],
    "seguintes": [
      "prompt.compose"
    ]
  },
  {
    "id": "instructions.learnings",
    "categoria": "INSTRUCOES",
    "arquivo": "src/lib/nina/aprendizado.server.ts",
    "funcao": null,
    "anteriores": [
      "context.load"
    ],
    "seguintes": [
      "prompt.compose"
    ]
  },
  {
    "id": "prompt.compose",
    "categoria": "INSTRUCOES",
    "arquivo": "src/lib/nina-contexto.server.ts",
    "funcao": "systemPromptNina",
    "anteriores": [
      "context.load",
      "instructions.catalog",
      "instructions.learnings"
    ],
    "seguintes": [
      "llm.generate",
      "llm.model_flag"
    ]
  },
  {
    "id": "llm.generate",
    "categoria": "IA",
    "arquivo": "src/lib/nina/ai-gateway.server.ts",
    "funcao": "ninaAIGateway",
    "anteriores": [
      "llm.model_flag",
      "prompt.compose",
      "tool.business_hours",
      "tool.catalog.lookup",
      "tool.execute",
      "tool.knowledge.lookup",
      "tool.patient.lookup",
      "tool.schedule.availability",
      "tool.schedule.book"
    ],
    "seguintes": [
      "error.handle",
      "response.validate",
      "tool.execute"
    ]
  },
  {
    "id": "llm.model_flag",
    "categoria": "IA",
    "arquivo": "src/lib/nina/modelo-flag.server.ts",
    "funcao": null,
    "anteriores": [
      "prompt.compose"
    ],
    "seguintes": [
      "llm.generate"
    ]
  },
  {
    "id": "tool.execute",
    "categoria": "TOOLS",
    "arquivo": "src/lib/nina/tool-broker.server.ts",
    "funcao": "criarToolBroker",
    "anteriores": [
      "llm.generate"
    ],
    "seguintes": [
      "llm.generate",
      "tool.business_hours",
      "tool.catalog.lookup",
      "tool.handoff",
      "tool.knowledge.lookup",
      "tool.patient.lookup",
      "tool.schedule.availability",
      "tool.schedule.book"
    ]
  },
  {
    "id": "tool.catalog.lookup",
    "categoria": "CONHECIMENTO",
    "arquivo": "src/lib/nina/catalogo-retrieval.server.ts",
    "funcao": "buscarNoCatalogo",
    "anteriores": [
      "tool.execute"
    ],
    "seguintes": [
      "llm.generate"
    ]
  },
  {
    "id": "tool.knowledge.lookup",
    "categoria": "CONHECIMENTO",
    "arquivo": "src/lib/nina/knowledge.server.ts",
    "funcao": "searchKnowledgeBase",
    "anteriores": [
      "tool.execute"
    ],
    "seguintes": [
      "llm.generate"
    ]
  },
  {
    "id": "tool.business_hours",
    "categoria": "CONHECIMENTO",
    "arquivo": "src/lib/nina/horario-oficial.ts",
    "funcao": "horarioOficialDoDia",
    "anteriores": [
      "tool.execute"
    ],
    "seguintes": [
      "llm.generate"
    ]
  },
  {
    "id": "tool.schedule.availability",
    "categoria": "TOOLS",
    "arquivo": "src/lib/nina/paciente-tools.server.ts",
    "funcao": "consultarDisponibilidadeCore",
    "anteriores": [
      "tool.execute"
    ],
    "seguintes": [
      "llm.generate"
    ]
  },
  {
    "id": "tool.schedule.book",
    "categoria": "TOOLS",
    "arquivo": "src/lib/nina/paciente-tools.server.ts",
    "funcao": "executarFerramentaPaciente",
    "anteriores": [
      "tool.execute"
    ],
    "seguintes": [
      "llm.generate"
    ]
  },
  {
    "id": "tool.patient.lookup",
    "categoria": "TOOLS",
    "arquivo": "src/lib/whatsapp.server.ts",
    "funcao": "identificarPaciente",
    "anteriores": [
      "tool.execute"
    ],
    "seguintes": [
      "llm.generate"
    ]
  },
  {
    "id": "tool.handoff",
    "categoria": "TOOLS",
    "arquivo": "src/lib/nina/handoff-tool.server.ts",
    "funcao": "executarHandoffTool",
    "anteriores": [
      "tool.execute"
    ],
    "seguintes": [
      "handoff.queue"
    ]
  },
  {
    "id": "handoff.queue",
    "categoria": "PROCESSAMENTO",
    "arquivo": "src/lib/atendimento/handoff.server.ts",
    "funcao": "encaminharParaHumano",
    "anteriores": [
      "routing.decide",
      "tool.handoff",
      "wait.timeout"
    ],
    "seguintes": [
      "handoff.assign",
      "handoff.summary"
    ]
  },
  {
    "id": "handoff.summary",
    "categoria": "PROCESSAMENTO",
    "arquivo": "src/lib/atendimento/handoff-resumo.server.ts",
    "funcao": null,
    "anteriores": [
      "handoff.queue"
    ],
    "seguintes": []
  },
  {
    "id": "handoff.assign",
    "categoria": "PROCESSAMENTO",
    "arquivo": "src/lib/atendimento/handoff.server.ts",
    "funcao": "atribuirAtendenteOnline",
    "anteriores": [
      "handoff.queue"
    ],
    "seguintes": [
      "protocol.generate"
    ]
  },
  {
    "id": "protocol.generate",
    "categoria": "PROCESSAMENTO",
    "arquivo": "src/lib/atendimento/protocolo-atendimento.server.ts",
    "funcao": "protocoloAoAtribuirHumano",
    "anteriores": [
      "handoff.assign"
    ],
    "seguintes": []
  },
  {
    "id": "response.validate",
    "categoria": "VALIDACAO",
    "arquivo": "src/lib/whatsapp.server.ts",
    "funcao": "gerarRespostaNinaInterno",
    "anteriores": [
      "llm.generate"
    ],
    "seguintes": [
      "message.outbound"
    ]
  },
  {
    "id": "message.outbound",
    "categoria": "SAIDA",
    "arquivo": "src/lib/whatsapp.server.ts",
    "funcao": "metaSendText",
    "anteriores": [
      "response.validate"
    ],
    "seguintes": [
      "audio.fallback",
      "message.persist"
    ]
  },
  {
    "id": "audio.fallback",
    "categoria": "ERRO_FALLBACK",
    "arquivo": "src/lib/whatsapp.server.ts",
    "funcao": "metaSendAudio",
    "anteriores": [
      "message.outbound"
    ],
    "seguintes": [
      "message.persist"
    ]
  },
  {
    "id": "message.persist",
    "categoria": "SAIDA",
    "arquivo": "src/lib/whatsapp.server.ts",
    "funcao": "gerarRespostaNinaInterno",
    "anteriores": [
      "audio.fallback",
      "message.outbound"
    ],
    "seguintes": [
      "conversation.close",
      "metrics.record",
      "wait.start"
    ]
  },
  {
    "id": "wait.start",
    "categoria": "PROCESSAMENTO",
    "arquivo": "src/lib/nina/espera-paciente.server.ts",
    "funcao": null,
    "anteriores": [
      "message.persist"
    ],
    "seguintes": [
      "wait.timeout"
    ]
  },
  {
    "id": "wait.timeout",
    "categoria": "PROCESSAMENTO",
    "arquivo": "src/lib/nina/espera-timeout.server.ts",
    "funcao": "processarTimeoutsEsperaPaciente",
    "anteriores": [
      "wait.start"
    ],
    "seguintes": [
      "conversation.close",
      "handoff.queue"
    ]
  },
  {
    "id": "conversation.close",
    "categoria": "PROCESSAMENTO",
    "arquivo": "src/lib/nina/encerramento-automatico.server.ts",
    "funcao": "avaliarEncerramentoAutomatico",
    "anteriores": [
      "message.persist",
      "wait.timeout"
    ],
    "seguintes": [
      "metrics.record"
    ]
  },
  {
    "id": "metrics.record",
    "categoria": "OBSERVABILIDADE",
    "arquivo": "src/lib/nina/telemetria.server.ts",
    "funcao": "registrarExecucao",
    "anteriores": [
      "conversation.close",
      "message.persist"
    ],
    "seguintes": [
      "evidence.record"
    ]
  },
  {
    "id": "evidence.record",
    "categoria": "OBSERVABILIDADE",
    "arquivo": "src/lib/nina/evidencias.server.ts",
    "funcao": "gravarEvidencias",
    "anteriores": [
      "metrics.record"
    ],
    "seguintes": [
      "metrics.period"
    ]
  },
  {
    "id": "metrics.period",
    "categoria": "OBSERVABILIDADE",
    "arquivo": "src/lib/nina/desempenho-periodo.ts",
    "funcao": null,
    "anteriores": [
      "evidence.record"
    ],
    "seguintes": []
  },
  {
    "id": "error.handle",
    "categoria": "ERRO_FALLBACK",
    "arquivo": "src/routes/api/public/whatsapp.$clinicaId.ts",
    "funcao": "marcarResultado",
    "anteriores": [
      "llm.generate"
    ],
    "seguintes": []
  }
];

export function assinaturaDe(node: NodeArquitetura): AssinaturaNode {
  return {
    id: node.id,
    categoria: node.categoria,
    arquivo: node.arquivo ?? null,
    funcao: node.funcao ?? null,
    anteriores: [...node.anteriores].sort(),
    seguintes: [...node.seguintes].sort(),
  };
}

/** Assinatura atual do manifesto, base para o canvas e para o diff. */
export function assinaturaAtual(nodes: NodeArquitetura[] = NODES_ARQUITETURA): AssinaturaNode[] {
  return nodes.map(assinaturaDe);
}

const iguais = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function calcularDiffArquitetura(
  anterior: AssinaturaNode[] = SNAPSHOT_ANTERIOR,
  atual: AssinaturaNode[] = assinaturaAtual(),
): DiffArquitetura {
  const antes = new Map(anterior.map((n) => [n.id, n]));
  const depois = new Map(atual.map((n) => [n.id, n]));

  const adicionados = atual.filter((n) => !antes.has(n.id)).map((n) => n.id);
  const removidos = anterior.filter((n) => !depois.has(n.id)).map((n) => n.id);
  const alterados: MudancaNode[] = [];
  const inalterados: string[] = [];

  for (const node of atual) {
    const velho = antes.get(node.id);
    if (!velho) continue;
    const campos: string[] = [];
    if (velho.categoria !== node.categoria) campos.push("categoria");
    // Trocar apenas o caminho do arquivo não conta como mudança arquitetural
    // quando a função e as conexões continuam as mesmas.
    if (velho.funcao !== node.funcao) campos.push("funcao");
    if (!iguais(velho.anteriores, node.anteriores)) campos.push("anteriores");
    if (!iguais(velho.seguintes, node.seguintes)) campos.push("seguintes");
    if (campos.length === 0) inalterados.push(node.id);
    else
      alterados.push({
        id: node.id,
        campos,
        de: { categoria: velho.categoria, funcao: velho.funcao, anteriores: velho.anteriores, seguintes: velho.seguintes },
        para: { categoria: node.categoria, funcao: node.funcao, anteriores: node.anteriores, seguintes: node.seguintes },
      });
  }

  const semMudanca = adicionados.length === 0 && removidos.length === 0 && alterados.length === 0;

  return {
    adicionados,
    alterados,
    removidos,
    inalterados,
    resumo: semMudanca
      ? "Arquitetura sincronizada — nenhuma alteração estrutural detectada."
      : `+${adicionados.length} adicionado(s), ~${alterados.length} alterado(s), -${removidos.length} removido(s), ${inalterados.length} inalterado(s).`,
  };
}

/** Diff em texto, no formato +/~/- usado no registro da sincronização. */
export function diffEmTexto(diff: DiffArquitetura = calcularDiffArquitetura()): string {
  const linhas: string[] = [];
  for (const id of diff.adicionados) linhas.push(`+ ${id}`);
  for (const m of diff.alterados) linhas.push(`~ ${m.id} (${m.campos.join(", ")})`);
  for (const id of diff.removidos) linhas.push(`- ${id}`);
  return linhas.length > 0 ? linhas.join("\n") : diff.resumo;
}

/**
 * Versão do manifesto cuja sincronização já foi registrada no
 * Architecture Diff (`docs/nina/arquitetura-diff-2026-09-08.md`). Quando o
 * manifesto avançar de versão sem novo registro, o status da página deixa de
 * ficar verde e passa a indicar alterações pendentes.
 */
export const VERSAO_SINCRONIZADA = 5;

/**
 * FASE 5 — Publicar uma nova versão das Instruções da Nina é mudança de
 * CONFIGURAÇÃO, não de estrutura: o Architecture Sync apenas atualiza os
 * metadados do node "Montagem do prompt" e registra a troca de versão.
 * O canvas não é reorganizado e nenhuma versão da arquitetura é criada.
 */
export type MudancaConfiguracaoPrompt = {
  nodeId: "prompt.compose";
  estrutural: false;
  de: number | null;
  para: number;
  resumo: string;
};

export function mudancaConfiguracaoPrompt(
  de: number | null,
  para: number,
): MudancaConfiguracaoPrompt {
  return {
    nodeId: "prompt.compose",
    estrutural: false,
    de,
    para,
    resumo: `Prompt principal: ${de ? `v${de} → ` : ""}v${para}`,
  };
}


const DIFF_VAZIO: DiffArquitetura = {
  adicionados: [],
  alterados: [],
  removidos: [],
  inalterados: [],
  resumo: "Arquitetura sincronizada — nenhuma alteração estrutural detectada.",
};

/** Diff ainda não registrado: vazio quando a versão atual já foi sincronizada. */
export function diffPendente(
  versao: number = MANIFESTO_ARQUITETURA.versao,
  nodes: NodeArquitetura[] = NODES_ARQUITETURA,
): DiffArquitetura {
  if (versao === VERSAO_SINCRONIZADA) {
    return { ...DIFF_VAZIO, inalterados: nodes.map((n) => n.id) };
  }
  return calcularDiffArquitetura(SNAPSHOT_ANTERIOR, assinaturaAtual(nodes));
}
