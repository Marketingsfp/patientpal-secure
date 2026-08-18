/**
 * Cronômetro de diagnóstico para fluxos que a recepção sente como lentos.
 *
 * Existe porque "está devagar" não é um número: sem medir, a discussão vira
 * palpite entre latência de rede, consulta no banco e renderização da tela.
 * O cronômetro quebra o fluxo em etapas e imprime o tempo de cada uma no
 * console do navegador (F12 › Console), sem aparecer para o usuário e sem
 * mudar nada no comportamento do sistema.
 *
 * Uso:
 *   const crono = iniciarCronometro("abrir tela de pagamento");
 *   ...
 *   crono.marcar("salvar no servidor");
 *   ...
 *   crono.marcar("buscar valores");
 *   crono.encerrar({ servidor_leituras: 120, servidor_gravacao: 80 });
 *
 * A última medição também fica em `window.__perfAgenda`, para poder ser
 * copiada e colada num relato sem precisar transcrever o console à mão.
 */

export type Cronometro = {
  /** Fecha a etapa atual com este nome e começa a próxima. */
  marcar: (etapa: string) => void;
  /**
   * Fecha a medição e imprime o resumo. `extras` são tempos que vieram
   * prontos de outro lugar (por exemplo, medidos dentro do servidor) e que
   * entram no relatório como informação, não como etapas da linha do tempo.
   */
  encerrar: (extras?: Record<string, number | null | undefined>) => number;
  /**
   * Fecha a medição só depois que o navegador realmente pintou a tela.
   * É o que separa "o código terminou" de "o usuário viu" — a resposta para
   * "a renderização está engasgando?".
   */
  encerrarNaProximaPintura: (extras?: Record<string, number | null | undefined>) => void;
};

const agora = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export function iniciarCronometro(rotulo: string): Cronometro {
  const inicio = agora();
  let ultimaMarca = inicio;
  const etapas: Array<{ etapa: string; ms: number }> = [];

  const marcar = (etapa: string) => {
    const t = agora();
    etapas.push({ etapa, ms: Math.round(t - ultimaMarca) });
    ultimaMarca = t;
  };

  const relatar = (extras?: Record<string, number | null | undefined>): number => {
    const total = Math.round(agora() - inicio);
    const limpos: Record<string, number> = {};
    for (const [k, v] of Object.entries(extras ?? {})) {
      if (typeof v === "number" && Number.isFinite(v)) limpos[k] = Math.round(v);
    }
    const resumo = { rotulo, total_ms: total, etapas, informacoes: limpos };
    if (typeof window !== "undefined") {
      (window as unknown as { __perfAgenda?: unknown }).__perfAgenda = resumo;
    }
    const linha = etapas.map((e) => `${e.etapa} ${e.ms}ms`).join("  |  ");
    const extra = Object.entries(limpos)
      .map(([k, v]) => `${k} ${v}ms`)
      .join("  |  ");
    // console.info (e não console.log) para ficar fácil de filtrar no
    // DevTools sem misturar com o ruído normal da aplicação.
    console.info(
      `[perf] ${rotulo} — TOTAL ${total}ms\n        ${linha}${extra ? `\n        (servidor) ${extra}` : ""}`,
    );
    return total;
  };

  return {
    marcar,
    encerrar: relatar,
    encerrarNaProximaPintura: (extras) => {
      if (typeof requestAnimationFrame !== "function") {
        relatar(extras);
        return;
      }
      // Dois quadros: o primeiro roda ANTES da pintura do quadro atual, o
      // segundo só depois que o navegador realmente desenhou. É esse segundo
      // que mede o custo de renderizar a tela.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          marcar("pintar a tela");
          relatar(extras);
        });
      });
    },
  };
}
