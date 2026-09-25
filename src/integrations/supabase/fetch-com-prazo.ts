/**
 * Prazo para as requisições do cliente do servidor ao banco (tabelas e RPC).
 *
 * POR QUE ISTO EXISTE: sem prazo, uma conexão que para de responder deixa quem
 * espera parado para sempre — foi o que pôde congelar o turno da Nina no
 * Erro Crítico 01 (24/09). Com o prazo, a chamada é cancelada de verdade e
 * volta como erro comum, que o código já sabe tratar.
 *
 * 60 s = maior `statement_timeout` usado pelas funções do banco: nenhuma
 * consulta legítima é cortada antes do próprio banco desistir. Storage e Auth
 * ficam de fora (upload grande pode demorar mais). Um prazo próprio de quem
 * chama (`.abortSignal()`) continua valendo junto com este.
 */
export const PRAZO_REQUISICAO_BANCO_MS = 60_000;

export function criarFetchComPrazo(prazoMs = PRAZO_REQUISICAO_BANCO_MS): typeof fetch {
  return ((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    if (!url.includes("/rest/v1/")) return fetch(entrada, init);
    const prazo = new AbortController();
    const timer = setTimeout(
      () =>
        prazo.abort(new DOMException("Consulta ao banco sem resposta no prazo", "TimeoutError")),
      prazoMs,
    );
    // Prazo próprio de quem chama também cancela (sem depender de AbortSignal.any no runtime).
    const proprio = init?.signal ?? (entrada instanceof Request ? entrada.signal : undefined);
    if (proprio?.aborted) prazo.abort(proprio.reason);
    else proprio?.addEventListener("abort", () => prazo.abort(proprio.reason), { once: true });
    // O prazo cobre a espera pela resposta — o caso da conexão presa; depois dela, é desligado.
    return fetch(entrada, { ...init, signal: prazo.signal }).finally(() => clearTimeout(timer));
  }) as typeof fetch;
}
