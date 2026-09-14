/** Limita leituras de auditoria no navegador; cancelar uma tela retira suas leituras da fila. */
export function criarLimiteLeituraSaidas(limite = 3) {
  if (!Number.isInteger(limite) || limite < 1) throw new Error("Limite de leitura inválido.");
  let ativas = 0;
  const fila: Array<() => void> = [];
  function proxima() {
    while (ativas < limite && fila.length) fila.shift()!();
  }
  return function executar<T>(ler: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const abortar = () => {
        const indice = fila.indexOf(iniciar);
        if (indice >= 0) fila.splice(indice, 1);
        reject(new DOMException("Leitura cancelada", "AbortError"));
      };
      const iniciar = () => {
        signal?.removeEventListener("abort", abortar);
        if (signal?.aborted) {
          abortar();
          return;
        }
        ativas++;
        void Promise.resolve()
          .then(ler)
          .then(resolve, reject)
          .finally(() => {
            ativas--;
            proxima();
          });
      };
      if (signal?.aborted) {
        abortar();
        return;
      }
      signal?.addEventListener("abort", abortar, { once: true });
      fila.push(iniciar);
      proxima();
    });
  };
}
