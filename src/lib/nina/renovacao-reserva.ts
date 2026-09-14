/** Heartbeat sem dependência de banco; falha transitória não abandona a renovação de trabalho vivo. */
export function criarRenovacaoReserva(
  renovar: () => Promise<boolean>,
  opcoes: {
    intervaloMs?: number;
    agendar?: (tick: () => void, intervaloMs: number) => unknown;
    cancelar?: (timer: unknown) => void;
  } = {},
) {
  let valida = true;
  let encerrada = false;
  let fila = Promise.resolve();
  const tick = () => {
    if (encerrada) return;
    fila = fila
      .then(async () => {
        if (!encerrada) valida = await renovar();
      })
      .catch(() => {
        valida = false;
      });
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
      await fila;
    },
  };
}
