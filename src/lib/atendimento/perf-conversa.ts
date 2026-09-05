/**
 * Medição do tempo de abertura de uma conversa (Fase 4).
 *
 * Etapas medidas: clique → início da busca → dados recebidos → tela desenhada
 * → scroll posicionado no fim. Fica desligado por padrão; para investigar,
 * ligue no navegador com: localStorage.setItem("nina:perf", "1").
 */

export type EtapaConversa = "click" | "request" | "dados" | "render" | "scroll";

export type MedidorConversa = {
  marcar: (etapa: EtapaConversa) => void;
  resumo: () => Record<string, number>;
  ativo: () => boolean;
};

function agora(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function medicaoLigada(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("nina:perf") === "1";
  } catch {
    return false;
  }
}

/** Calcula as durações entre etapas consecutivas, em milissegundos. */
export function calcularEtapas(marcas: Partial<Record<EtapaConversa, number>>) {
  const d = (a: EtapaConversa, b: EtapaConversa) => {
    const ini = marcas[a];
    const fim = marcas[b];
    if (ini == null || fim == null) return null;
    return Math.max(0, Math.round(fim - ini));
  };
  const out: Record<string, number> = {};
  const pares: [EtapaConversa, EtapaConversa, string][] = [
    ["click", "request", "click_ate_request"],
    ["request", "dados", "request_ate_dados"],
    ["dados", "render", "dados_ate_render"],
    ["render", "scroll", "render_ate_scroll"],
    ["click", "scroll", "total"],
  ];
  for (const [a, b, nome] of pares) {
    const v = d(a, b);
    if (v != null) out[nome] = v;
  }
  return out;
}

export function criarMedidorConversa(rotulo: string, ligado = medicaoLigada()): MedidorConversa {
  const marcas: Partial<Record<EtapaConversa, number>> = {};
  return {
    ativo: () => ligado,
    marcar(etapa) {
      if (!ligado) return;
      marcas[etapa] = agora();
      if (etapa === "scroll") {
        // eslint-disable-next-line no-console
        console.info(`[nina:perf] ${rotulo}`, calcularEtapas(marcas));
      }
    },
    resumo: () => calcularEtapas(marcas),
  };
}
