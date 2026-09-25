/** Prazo de cada renovação: menor que o intervalo, para nunca haver fila de renovações presas. */
export const PRAZO_RENOVACAO_MS = 15_000;

/**
 * Heartbeat sem dependência de banco; falha transitória não abandona a renovação de trabalho vivo.
 * Cada renovação tem prazo próprio: a chamada sem resposta é cancelada, conta como falha e não
 * segura as seguintes nem a liberação da reserva (Erro Crítico 01).
 */
export function criarRenovacaoReserva(
  renovar: (signal: AbortSignal) => Promise<boolean>,
  opcoes: {
    intervaloMs?: number;
    prazoMs?: number;
    agendar?: (tick: () => void, intervaloMs: number) => unknown;
    cancelar?: (timer: unknown) => void;
  } = {},
) {
  let valida = true;
  let encerrada = false;
  let iniciadas = 0;
  let ultimaAplicada = 0;
  const pendentes = new Set<Promise<void>>();
  const prazoMs = opcoes.prazoMs ?? PRAZO_RENOVACAO_MS;
  const executar = async (ordem: number) => {
    const controlador = new AbortController();
    let prazo: ReturnType<typeof setTimeout> | undefined;
    let resultado = false;
    try {
      resultado = await Promise.race([
        renovar(controlador.signal),
        new Promise<boolean>((resolve) => {
          prazo = setTimeout(() => {
            controlador.abort();
            resolve(false);
          }, prazoMs);
        }),
      ]);
    } catch {
      resultado = false;
    } finally {
      clearTimeout(prazo);
    }
    // Resposta atrasada nunca sobrescreve a de uma renovação mais nova.
    if (ordem > ultimaAplicada) {
      ultimaAplicada = ordem;
      valida = resultado;
    }
  };
  const tick = () => {
    if (encerrada) return;
    const renovacao = Promise.resolve().then(() => {
      if (!encerrada) return executar(++iniciadas);
    });
    pendentes.add(renovacao);
    void renovacao.finally(() => pendentes.delete(renovacao));
  };
  const timer = (opcoes.agendar ?? ((cb, ms) => setInterval(cb, ms)))(
    tick,
    opcoes.intervaloMs ?? 20000,
  );
  return {
    valida: () => valida,
    parar: async () => {
      encerrada = true;
      (opcoes.cancelar ?? ((id) => clearInterval(id as ReturnType<typeof setInterval>)))(timer);
      // Aguarda a renovação já iniciada (limitada pelo prazo) para não renovar após liberar.
      await Promise.all([...pendentes]);
    },
  };
}
