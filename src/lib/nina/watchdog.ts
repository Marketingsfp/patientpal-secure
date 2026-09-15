/** Contrato de processamento. O lote existente continua sendo a única fila. */
export const POLITICA_WATCHDOG = Object.freeze({
  maxTentativas: 3,
  leaseSegundos: 90,
  heartbeatMs: 20_000,
  heartbeatExpiradoSegundos: 60,
  processamentoMaxSegundos: 300,
  modeloTimeoutMs: 60_000,
  entregaTimeoutMs: 30_000,
  filaMaxSegundos: 30,
  intervaloSegundos: 60,
  backoffBaseMs: 2_000,
  backoffMaxMs: 30_000,
  // Cada requisição recupera um único turno; dez gerações derrubaram o worker por memória.
  paralelismo: 1,
});

export type EstadoProcessamentoNina =
  | "received"
  | "queued"
  | "processing"
  | "retry_pending"
  | "completed"
  | "failed"
  | "handoff";
export const ESTADOS_TERMINAIS_NINA = new Set(["completed", "failed", "handoff"]);

export function esperaRetryWatchdog(tentativa: number, aleatorio = Math.random): number {
  const teto = Math.min(
    POLITICA_WATCHDOG.backoffMaxMs,
    POLITICA_WATCHDOG.backoffBaseMs * 2 ** Math.max(0, tentativa - 1),
  );
  return Math.min(
    POLITICA_WATCHDOG.backoffMaxMs,
    Math.round(teto * (0.75 + Math.max(0, Math.min(1, aleatorio())) * 0.5)),
  );
}

export type AmostraProcessamentoNina = {
  id: string;
  nina_status: EstadoProcessamentoNina | null;
  nina_batch_id?: string | null;
};

/** Conta entradas físicas, inclusive as agrupadas, nunca quantidade de inferências. */
export function conciliarProcessamentoNina(
  idsRecebidos: string[],
  linhas: AmostraProcessamentoNina[],
) {
  const ids = [...new Set(idsRecebidos)];
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const contagem = {
    received: 0,
    queued: 0,
    processing: 0,
    retry_pending: 0,
    completed: 0,
    failed: 0,
    handoff: 0,
    ausentes: 0,
  };
  for (const id of ids) {
    const estado = porId.get(id)?.nina_status;
    if (!estado) contagem.ausentes++;
    else contagem[estado]++;
  }
  const terminais = contagem.completed + contagem.failed + contagem.handoff;
  return {
    recebidas: ids.length,
    ...contagem,
    terminais,
    pendentes: ids.length - terminais,
    integridade: terminais === ids.length,
    // Chegar a failed é contabilizado, mas nunca vira sucesso funcional do teste.
    aprovado: terminais === ids.length && contagem.failed === 0,
  };
}

export function percentil(valores: number[], quantil: number): number | null {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.max(0, Math.ceil(quantil * ordenados.length) - 1)]!;
}
