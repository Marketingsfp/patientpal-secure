/**
 * Tempo limite para chamadas de rede que a interface espera de forma bloqueante.
 *
 * POR QUE ISTO EXISTE: as chamadas de apoio à decisão (estruturar prontuário,
 * sugerir CID/exames, resumir histórico, analisar caso) desabilitam o botão e
 * mostram um indicador enquanto rodam, e só liberam a tela no `finally`. Sem
 * tempo limite, uma conexão que trava — o pior caso, pior que cair de vez —
 * deixa o `finally` sem rodar: o médico fica com o botão desabilitado e o
 * indicador girando até o navegador desistir sozinho, o que leva minutos, sem
 * poder cancelar nem tentar de novo.
 *
 * Usamos AbortController de verdade, não uma corrida de promessas: as funções
 * de servidor do TanStack aceitam `signal`, então a requisição é efetivamente
 * cancelada em vez de ficar órfã consumindo conexão.
 */

/** 60s é folgado para os modelos usados hoje (respondem em ~10-20s). */
export const TEMPO_LIMITE_PADRAO_MS = 60_000;

export class TempoLimiteExcedido extends Error {
  constructor(oQue: string) {
    super(`${oQue} demorou demais e foi cancelada. Verifique a conexão e tente novamente.`);
    this.name = "TempoLimiteExcedido";
  }
}

/**
 * Executa uma chamada com tempo limite, repassando o `AbortSignal`.
 *
 * @param executar recebe o signal e devolve a promessa da chamada
 * @param oQue sujeito da mensagem de erro, ex.: "A análise do caso"
 */
export async function comTempoLimite<T>(
  executar: (signal: AbortSignal) => Promise<T>,
  oQue: string,
  ms: number = TEMPO_LIMITE_PADRAO_MS,
): Promise<T> {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), ms);
  try {
    return await executar(controlador.signal);
  } catch (e) {
    // Distingue "estourou o tempo" de "a chamada falhou por outro motivo":
    // quando abortamos, o erro que sobe é um AbortError genérico, que não diz
    // nada de útil para quem está atendendo.
    if (controlador.signal.aborted) throw new TempoLimiteExcedido(oQue);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
