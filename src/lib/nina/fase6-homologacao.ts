/**
 * FASE 6 — Homologação do agrupamento de mensagens quebradas.
 *
 * Simulador determinístico (relógio virtual) que reproduz a semântica REAL do
 * pipeline já implementado:
 *
 *   FASE 2 — lote por conversa (`nina_message_batches`, quiet/max window);
 *   FASE 3 — lock persistente por conversa (`nina_conversa_locks`);
 *   FASE 4 — revisão monotônica + stale response guard;
 *   FASE 5 — o lote é UM turno lógico (intenção, estado, memória, Confidence).
 *
 * Nada aqui toca produção, WhatsApp, banco ou prompt: é infraestrutura de
 * homologação para medir latência e provar os gates da FASE 6.
 */
import {
  MAX_BURST_WINDOW_MS,
  QUIET_WINDOW_MS,
  decidirEspera,
  montarTurnoPaciente,
  type StatusLoteNina,
} from "@/lib/nina/burst";
import { decidirEnvio, ehFerramentaCritica, estaObsoleta } from "@/lib/nina/revisao";

export type MensagemSimulada = {
  /** Conversa (uma por paciente). */
  conversa: string;
  id: string;
  texto: string;
  /** Instante de chegada no webhook, em ms do relógio virtual. */
  emMs: number;
};

export type ExecucaoNina = {
  batchId: string;
  conversa: string;
  /** IDs físicos das mensagens que originaram a resposta. */
  mensagens: string[];
  /** Turno lógico entregue ao modelo. */
  texto: string;
  revisaoProcessada: number;
  /** Instante em que o processamento começou (claim do lote). */
  inicioMs: number;
  /** Instante em que a resposta ficou pronta. */
  fimMs: number;
  /** Chegada da última mensagem do lote. */
  ultimaMensagemMs: number;
  enviada: boolean;
  motivoDescarte: "SUPERSEDED" | null;
  statusLote: StatusLoteNina;
  /** Ferramenta crítica efetivamente executada nesta geração. */
  ferramenta: string | null;
  ferramentaBloqueada: string | null;
};

export type MetricasHomologacao = {
  mensagensFisicas: number;
  batchesCriados: number;
  execucoes: number;
  respostasEnviadas: number;
  mediaMensagensPorBatch: number;
  /** Execuções do modelo evitadas frente ao comportamento antigo (1 por mensagem). */
  chamadasModeloEvitadas: number;
  batchesSuperseded: number;
  respostasStaleBloqueadas: number;
  /** Latência adicional do agrupador: última mensagem do lote → início Nina. */
  latenciaAgrupadorMs: { p50: number; p95: number; max: number };
  /** Última mensagem do lote → resposta pronta. */
  latenciaRespostaMs: { p50: number; p95: number; max: number };
  ferramentasCriticasExecutadas: number;
};

export type ConfigSimulacao = {
  quietMs?: number;
  maxMs?: number;
  /** Duração da geração da Nina (modelo + ferramentas), em ms virtuais. */
  geracaoMs?: number;
  /** Ferramenta crítica que o turno consolidado pediria, por conversa. */
  ferramentaPorConversa?: (texto: string) => string | null;
};

// ---------------------------------------------------------------------------
// Estado persistente simulado (mesma semântica das RPCs)
// ---------------------------------------------------------------------------

type Lote = {
  id: string;
  conversa: string;
  status: StatusLoteNina;
  revision: number;
  firstMs: number;
  mensagens: string[];
  ultimaMs: number;
};

class BancoSimulado {
  lotes: Lote[] = [];
  /** Revisão monotônica por conversa (FASE 4). */
  revisoes = new Map<string, number>();
  /** Lock por conversa (FASE 3): guarda o batch dono. */
  locks = new Map<string, string>();
  private seq = 0;

  registrar(conversa: string, mensagemId: string, agoraMs: number) {
    this.revisoes.set(conversa, (this.revisoes.get(conversa) ?? 0) + 1);
    let lote = this.lotes.find((l) => l.conversa === conversa && l.status === "COLLECTING");
    if (!lote) {
      lote = {
        id: `batch-${++this.seq}`,
        conversa,
        status: "COLLECTING",
        revision: 0,
        firstMs: agoraMs,
        mensagens: [],
        ultimaMs: agoraMs,
      };
      this.lotes.push(lote);
    }
    lote.revision += 1;
    lote.ultimaMs = agoraMs;
    if (!lote.mensagens.includes(mensagemId)) lote.mensagens.push(mensagemId);
    return { batchId: lote.id, revision: lote.revision, firstMs: lote.firstMs };
  }

  reivindicar(batchId: string, revision: number, forcar: boolean) {
    const lote = this.lotes.find((l) => l.id === batchId);
    if (!lote || lote.status !== "COLLECTING" || (!forcar && lote.revision !== revision)) {
      return null;
    }
    lote.status = "PROCESSING";
    return lote;
  }

  concluir(batchId: string, status: "PROCESSED" | "SUPERSEDED") {
    const lote = this.lotes.find((l) => l.id === batchId);
    if (lote) lote.status = status;
  }

  adquirirLock(conversa: string, batchId: string): boolean {
    if (this.locks.has(conversa)) return false;
    this.locks.set(conversa, batchId);
    return true;
  }

  liberarLock(conversa: string, batchId: string) {
    if (this.locks.get(conversa) === batchId) this.locks.delete(conversa);
  }

  revisao(conversa: string): number {
    return this.revisoes.get(conversa) ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Simulação
// ---------------------------------------------------------------------------

type Evento =
  | { t: number; ordem: number; tipo: "chegada"; msg: MensagemSimulada }
  | { t: number; ordem: number; tipo: "acorda"; conversa: string; batchId: string; revision: number; forcar: boolean }
  | { t: number; ordem: number; tipo: "fim"; execucao: ExecucaoNina };

export type ResultadoSimulacao = {
  execucoes: ExecucaoNina[];
  enviadas: ExecucaoNina[];
  batches: number;
  metricas: MetricasHomologacao;
};

export function simularConversas(
  mensagens: MensagemSimulada[],
  cfg: ConfigSimulacao = {},
): ResultadoSimulacao {
  const quietMs = cfg.quietMs ?? QUIET_WINDOW_MS;
  const maxMs = cfg.maxMs ?? MAX_BURST_WINDOW_MS;
  const geracaoMs = cfg.geracaoMs ?? 800;
  const banco = new BancoSimulado();
  const textos = new Map(mensagens.map((m) => [m.id, m.texto]));
  const execucoes: ExecucaoNina[] = [];

  let ordem = 0;
  const fila: Evento[] = mensagens
    .slice()
    .sort((a, b) => a.emMs - b.emMs)
    .map((msg) => ({ t: msg.emMs, ordem: ordem++, tipo: "chegada" as const, msg }));

  const empilhar = (ev: Omit<Evento, "ordem">) => {
    fila.push({ ...(ev as Evento), ordem: ordem++ });
  };

  const proximo = (): Evento | undefined => {
    if (!fila.length) return undefined;
    let idx = 0;
    for (let i = 1; i < fila.length; i++) {
      const a = fila[i]!;
      const b = fila[idx]!;
      if (a.t < b.t || (a.t === b.t && a.ordem < b.ordem)) idx = i;
    }
    return fila.splice(idx, 1)[0];
  };

  for (let ev = proximo(); ev; ev = proximo()) {
    if (ev.tipo === "chegada") {
      // Persistência + Realtime acontecem AQUI, imediatamente: a bolha do
      // paciente aparece sem esperar o agrupador.
      const { batchId, revision, firstMs } = banco.registrar(ev.msg.conversa, ev.msg.id, ev.t);
      const { esperaMs, forcar } = decidirEspera(ev.t, firstMs, { quietMs, maxMs });
      empilhar({
        t: ev.t + esperaMs,
        tipo: "acorda",
        conversa: ev.msg.conversa,
        batchId,
        revision,
        forcar,
      });
      continue;
    }

    if (ev.tipo === "acorda") {
      const lote = banco.reivindicar(ev.batchId, ev.revision, ev.forcar);
      if (!lote) continue; // mensagem mais nova assume o turno
      if (!banco.adquirirLock(ev.conversa, ev.batchId)) {
        // Conversa ocupada: reprograma em vez de rodar em paralelo.
        empilhar({ t: ev.t + 100, tipo: "acorda", conversa: ev.conversa, batchId: ev.batchId, revision: lote.revision, forcar: true });
        lote.status = "COLLECTING";
        continue;
      }
      const textoTurno = montarTurnoPaciente(lote.mensagens.map((id) => textos.get(id) ?? ""));
      const execucao: ExecucaoNina = {
        batchId: lote.id,
        conversa: lote.conversa,
        mensagens: [...lote.mensagens],
        texto: textoTurno,
        revisaoProcessada: banco.revisao(lote.conversa),
        inicioMs: ev.t,
        fimMs: ev.t + geracaoMs,
        ultimaMensagemMs: lote.ultimaMs,
        enviada: false,
        motivoDescarte: null,
        statusLote: "PROCESSING",
        ferramenta: null,
        ferramentaBloqueada: null,
      };
      empilhar({ t: execucao.fimMs, tipo: "fim", execucao });
      continue;
    }

    // Fim da geração: stale guard antes de qualquer ação crítica e do envio.
    const exec = ev.execucao;
    const atual = banco.revisao(exec.conversa);
    const obsoleta = estaObsoleta(exec.revisaoProcessada, atual);
    const pedida = cfg.ferramentaPorConversa?.(exec.texto) ?? null;
    if (pedida && ehFerramentaCritica(pedida)) {
      if (obsoleta) exec.ferramentaBloqueada = pedida;
      else exec.ferramenta = pedida;
    }
    const decisao = decidirEnvio({ processada: exec.revisaoProcessada, atual });
    exec.enviada = decisao.enviar;
    exec.motivoDescarte = decisao.enviar ? null : "SUPERSEDED";
    exec.statusLote = decisao.enviar ? "PROCESSED" : "SUPERSEDED";
    banco.concluir(exec.batchId, exec.statusLote);
    banco.liberarLock(exec.conversa, exec.batchId);
    execucoes.push(exec);
  }

  const enviadas = execucoes.filter((e) => e.enviada);
  return {
    execucoes,
    enviadas,
    batches: banco.lotes.length,
    metricas: calcularMetricas(mensagens.length, banco.lotes.length, execucoes),
  };
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

function percentil(valores: number[], p: number): number {
  if (!valores.length) return 0;
  const ord = [...valores].sort((a, b) => a - b);
  const idx = Math.min(ord.length - 1, Math.ceil((p / 100) * ord.length) - 1);
  return ord[Math.max(0, idx)]!;
}

export function calcularMetricas(
  mensagensFisicas: number,
  batchesCriados: number,
  execucoes: ExecucaoNina[],
): MetricasHomologacao {
  const agrupador = execucoes.map((e) => e.inicioMs - e.ultimaMensagemMs);
  const resposta = execucoes.filter((e) => e.enviada).map((e) => e.fimMs - e.ultimaMensagemMs);
  const superseded = execucoes.filter((e) => e.statusLote === "SUPERSEDED").length;
  return {
    mensagensFisicas,
    batchesCriados,
    execucoes: execucoes.length,
    respostasEnviadas: execucoes.filter((e) => e.enviada).length,
    mediaMensagensPorBatch: batchesCriados ? mensagensFisicas / batchesCriados : 0,
    // Antes: 1 execução do modelo por mensagem física.
    chamadasModeloEvitadas: Math.max(0, mensagensFisicas - execucoes.length),
    batchesSuperseded: superseded,
    respostasStaleBloqueadas: superseded,
    latenciaAgrupadorMs: {
      p50: percentil(agrupador, 50),
      p95: percentil(agrupador, 95),
      max: agrupador.length ? Math.max(...agrupador) : 0,
    },
    latenciaRespostaMs: {
      p50: percentil(resposta, 50),
      p95: percentil(resposta, 95),
      max: resposta.length ? Math.max(...resposta) : 0,
    },
    ferramentasCriticasExecutadas: execucoes.filter((e) => e.ferramenta).length,
  };
}
