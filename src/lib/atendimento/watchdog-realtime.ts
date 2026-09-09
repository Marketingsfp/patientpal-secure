/**
 * FASE 3 — vigia da conexão e rede de segurança da Inbox.
 *
 * O tempo real continua sendo o caminho principal. Este módulo só decide,
 * de forma pura (sem rede e sem tela):
 *
 *  - quando ligar uma conferência periódica temporária (canal com problema);
 *  - quando desligá-la (canal confirmado de novo);
 *  - e guarda marcas técnicas de diagnóstico: quando chegou o último aviso,
 *    quando a lista foi conferida pela última vez e qual é o estado do canal.
 *
 * Privacidade: aqui não entra nome, telefone, texto de mensagem nem dado
 * clínico — apenas horários, estado e motivo técnico.
 */
import type { EstadoConexao } from "./realtime-conexao";

export type MotivoSincronizacao =
  | "inicial"
  | "realtime"
  | "reconnect"
  | "visibility"
  | "fallback";

export type DecisaoWatchdog = {
  /** O que fazer com a conferência periódica temporária. */
  fallback: "ativar" | "parar" | "manter";
  /** Conferir uma última vez ao sair do modo degradado. */
  reconciliar: boolean;
};

export type SnapshotWatchdog = {
  status: EstadoConexao;
  ultimoEventoEm: number | null;
  ultimaSincronizacaoEm: number | null;
  ultimoMotivo: MotivoSincronizacao | null;
  fallbackAtivo: boolean;
};

export const INTERVALO_FALLBACK_MS = 12_000;

export function criarWatchdog(opcoes: { agora?: () => number } = {}) {
  const agora = opcoes.agora ?? (() => Date.now());

  let status: EstadoConexao = "CONNECTING";
  let ultimoEventoEm: number | null = null;
  let ultimaSincronizacaoEm: number | null = null;
  let ultimoMotivo: MotivoSincronizacao | null = null;
  let fallbackAtivo = false;

  return {
    aoEstado(novo: EstadoConexao): DecisaoWatchdog {
      status = novo;
      if (novo === "DEGRADED" || novo === "DISCONNECTED") {
        if (fallbackAtivo) return { fallback: "manter", reconciliar: false };
        fallbackAtivo = true;
        return { fallback: "ativar", reconciliar: false };
      }
      if (novo === "SUBSCRIBED" && fallbackAtivo) {
        fallbackAtivo = false;
        // Ao voltar: para a conferência periódica e confere uma última vez.
        return { fallback: "parar", reconciliar: true };
      }
      return { fallback: "manter", reconciliar: false };
    },
    aoEvento() {
      ultimoEventoEm = agora();
    },
    aoSincronizar(motivo: MotivoSincronizacao) {
      ultimaSincronizacaoEm = agora();
      ultimoMotivo = motivo;
    },
    snapshot(): SnapshotWatchdog {
      return { status, ultimoEventoEm, ultimaSincronizacaoEm, ultimoMotivo, fallbackAtivo };
    },
  };
}

export type Watchdog = ReturnType<typeof criarWatchdog>;

/**
 * Registro técnico só em modo de diagnóstico (localStorage
 * "atendimento:debug" = "1"). Nunca inclui dado de paciente.
 */
export function registrarDiagnostico(escopo: string, campos: Record<string, unknown>): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem("atendimento:debug") !== "1") return;
  } catch {
    return;
  }
  const partes = Object.entries(campos)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  console.info(`[${escopo}] ${partes}`);
}
