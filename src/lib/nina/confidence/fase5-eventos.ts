/**
 * FASE 5 — Eventos de auditoria vinculados.
 *
 * Camada pura: define a trilha de eventos de um turno (candidato avaliado,
 * correção do texto, decisão final, operação de fila e saída enviada), em
 * ordem, com conteúdo/hash preservados.
 *
 * REGRAS DURAS:
 *  - trilha é somente-acréscimo: evento gravado não é reescrito;
 *  - snapshot histórico nunca é alterado para "parecer" outro comportamento;
 *    divergência é registrada como evento complementar correlacionado;
 *  - "observação", "aplicação", "ambiente" e "efeito" são campos distintos:
 *    não existe mais um modo fixo "shadow" cobrindo os quatro;
 *  - o efeito final vem da operação confirmada, não da decisão intermediária.
 */

export const VERSAO_EVENTOS = "eventos-auditoria-5";

export type TipoEvento =
  | "candidato_avaliado"
  | "correcao_de_texto"
  | "decisao_final"
  | "operacao_fila"
  | "saida_enviada"
  | "divergencia_registrada";

export type AmbienteEvento = "producao" | "homologacao" | "teste_automatizado";

/** Os quatro campos que antes eram achatados em `modo: "shadow"`. */
export type ModoExecucao = {
  /** Rodou só para observar, sem autoridade sobre o atendimento. */
  observacao: boolean;
  /** A decisão foi aplicada ao fluxo real. */
  aplicacao: boolean;
  ambiente: AmbienteEvento;
  /** Efeito observável: o que de fato aconteceu. */
  efeito: "nenhum" | "resposta_enviada" | "fila_confirmada" | "aviso_enviado" | "falhou";
};

export function descreverModo(m: ModoExecucao): string {
  const partes = [
    m.observacao ? "observação" : "decisão com autoridade",
    m.aplicacao ? "aplicada" : "não aplicada",
    `ambiente=${m.ambiente}`,
    `efeito=${m.efeito}`,
  ];
  return partes.join(" · ");
}

/**
 * Compatibilidade: snapshots antigos gravavam `modo`. A leitura traduz sem
 * reescrever o histórico — e um registro marcado "shadow" que tem efeito real
 * é apontado como inconsistência, não silenciosamente corrigido.
 */
export function lerModoHistorico(
  modo: string | null | undefined,
  efeito: ModoExecucao["efeito"],
  ambiente: AmbienteEvento,
): { modo: ModoExecucao; inconsistente: boolean; observacaoTecnica: string | null } {
  const shadow = String(modo ?? "").toLowerCase() === "shadow";
  const teveEfeito = efeito !== "nenhum" && efeito !== "falhou";
  return {
    modo: {
      observacao: shadow,
      aplicacao: !shadow && teveEfeito,
      ambiente,
      efeito,
    },
    inconsistente: shadow && teveEfeito,
    observacaoTecnica:
      shadow && teveEfeito
        ? "Registro histórico marcado como observação, mas com efeito real. O histórico é preservado; a divergência fica como evento complementar."
        : null,
  };
}

export type EventoAuditoria = {
  id: string;
  sequencia: number;
  tipo: TipoEvento;
  conversaId: string;
  turnoId: string;
  /** Liga todos os eventos do mesmo turno (e as correções posteriores). */
  correlacaoId: string;
  criadoEm: string;
  modo: ModoExecucao;
  /** Conteúdo preservado do evento (texto avaliado, aviso, comprovante…). */
  conteudo: string | null;
  hashConteudo: string | null;
  dados: Record<string, string | number | boolean | null>;
};

export type EntradaEvento = Omit<EventoAuditoria, "id" | "sequencia" | "criadoEm"> & {
  criadoEm?: string;
};

export class TrilhaImutavel extends Error {}

export type Trilha = {
  registrar(e: EntradaEvento): EventoAuditoria;
  eventos(correlacaoId?: string): EventoAuditoria[];
};

/** Trilha em memória (mesma semântica esperada do armazenamento real). */
export function trilhaEmMemoria(): Trilha {
  const lista: EventoAuditoria[] = [];
  const vistos = new Set<string>();
  return {
    registrar(e) {
      const chave = `${e.correlacaoId}|${e.tipo}|${e.hashConteudo ?? ""}`;
      if (vistos.has(chave)) {
        throw new TrilhaImutavel(`evento_ja_registrado:${e.tipo}`);
      }
      vistos.add(chave);
      const evento: EventoAuditoria = {
        ...e,
        id: `${e.correlacaoId}-${lista.length + 1}`,
        sequencia: lista.length + 1,
        criadoEm: e.criadoEm ?? new Date().toISOString(),
      };
      lista.push(Object.freeze(evento));
      return evento;
    },
    eventos(correlacaoId) {
      const itens = correlacaoId ? lista.filter((x) => x.correlacaoId === correlacaoId) : lista;
      return [...itens].sort((a, b) => a.sequencia - b.sequencia);
    },
  };
}

/** Ordem esperada da trilha de um turno. */
export const ORDEM_ESPERADA: TipoEvento[] = [
  "candidato_avaliado",
  "correcao_de_texto",
  "decisao_final",
  "operacao_fila",
  "saida_enviada",
];

export function ordemValida(eventos: EventoAuditoria[]): boolean {
  const pos = (t: TipoEvento) => ORDEM_ESPERADA.indexOf(t);
  let ultimo = -1;
  for (const e of eventos) {
    if (e.tipo === "divergencia_registrada") continue;
    const p = pos(e.tipo);
    if (p < ultimo) return false;
    ultimo = p;
  }
  return true;
}

// --------------------------------------------------- efeito e divergência

export type EfeitoFinal = {
  /** Vem SEMPRE da operação/saída confirmada. */
  efeito: ModoExecucao["efeito"];
  /** Decisões intermediárias registradas, identificadas como tais. */
  intermediarias: Array<{ origem: string; decisao: string }>;
  decisaoFinal: string | null;
  divergente: boolean;
  explicacao: string;
};

export function apurarEfeitoFinal(eventos: EventoAuditoria[]): EfeitoFinal {
  const ordenados = [...eventos].sort((a, b) => a.sequencia - b.sequencia);
  const intermediarias: EfeitoFinal["intermediarias"] = [];
  let decisaoFinal: string | null = null;
  let efeito: ModoExecucao["efeito"] = "nenhum";

  for (const e of ordenados) {
    const decisao = typeof e.dados["decisao"] === "string" ? String(e.dados["decisao"]) : null;
    if (e.tipo === "candidato_avaliado" && decisao) {
      intermediarias.push({ origem: String(e.dados["origem"] ?? "avaliacao"), decisao });
    }
    if (e.tipo === "decisao_final" && decisao) decisaoFinal = decisao;
    if (e.tipo === "operacao_fila" || e.tipo === "saida_enviada") {
      if (e.modo.efeito !== "nenhum") efeito = e.modo.efeito;
    }
  }

  const divergente = intermediarias.some((i) => decisaoFinal != null && i.decisao !== decisaoFinal);
  return {
    efeito,
    intermediarias,
    decisaoFinal,
    divergente,
    explicacao: divergente
      ? "Houve decisão intermediária diferente do destino final. As duas aparecem identificadas; o efeito vale pela operação confirmada."
      : "Efeito apurado pela operação confirmada.",
  };
}

/**
 * Complementa (nunca reescreve) um snapshot histórico divergente. Retorna o
 * evento a acrescentar, correlacionado ao registro original.
 */
export function eventoDeDivergencia(e: {
  conversaId: string;
  turnoId: string;
  correlacaoId: string;
  ambiente: AmbienteEvento;
  snapshotId: string;
  motivo: string;
}): EntradaEvento {
  return {
    tipo: "divergencia_registrada",
    conversaId: e.conversaId,
    turnoId: e.turnoId,
    correlacaoId: e.correlacaoId,
    modo: { observacao: true, aplicacao: false, ambiente: e.ambiente, efeito: "nenhum" },
    conteudo: null,
    hashConteudo: null,
    dados: { snapshot_id: e.snapshotId, motivo: e.motivo, historico_preservado: true },
  };
}
