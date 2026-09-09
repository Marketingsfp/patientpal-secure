/**
 * FASE 2 — reconciliação ao retomar a tela.
 *
 * O tempo real continua sendo o caminho principal. Isto aqui é a rede de
 * segurança: quando a aba volta do segundo plano, ganha foco ou a internet
 * volta, a tela confere de novo o estado real no servidor — porque o navegador
 * pode ter suspendido a execução enquanto a conexão ainda parecia ativa.
 *
 * Nada de consulta repetida em intervalo curto: `focus` e `visibilitychange`
 * costumam disparar quase juntos, então a conferência sai UMA vez por janela.
 *
 * Módulo puro (sem rede e sem tela), para ser testável.
 */

export type MotivoRetomada = "focus" | "visibility" | "online";

export type ReconciliadorRetomada = {
  /** Pede uma conferência; dentro da janela curta, executa só uma vez. */
  solicitar: (motivo: MotivoRetomada) => boolean;
  /** Motivos que caíram na mesma janela (diagnóstico). */
  motivos: () => MotivoRetomada[];
  cancelar: () => void;
};

export function criarReconciliadorRetomada(opcoes: {
  executar: (motivo: MotivoRetomada) => void;
  /** Janela de agrupamento em milissegundos. */
  janelaMs?: number;
  agora?: () => number;
}): ReconciliadorRetomada {
  const janela = opcoes.janelaMs ?? 1500;
  const agora = opcoes.agora ?? (() => Date.now());

  let ultimaExecucao: number | null = null;
  let motivosDaJanela: MotivoRetomada[] = [];

  return {
    solicitar(motivo) {
      const t = agora();
      if (ultimaExecucao !== null && t - ultimaExecucao < janela) {
        motivosDaJanela.push(motivo);
        return false;
      }
      ultimaExecucao = t;
      motivosDaJanela = [motivo];
      opcoes.executar(motivo);
      return true;
    },
    motivos: () => [...motivosDaJanela],
    cancelar() {
      ultimaExecucao = null;
      motivosDaJanela = [];
    },
  };
}

/**
 * O evento do navegador merece conferência? Só interessa a aba voltando a
 * ficar visível — ir para segundo plano não recarrega nada.
 */
export function motivoDeRetomada(
  tipo: "focus" | "visibilitychange" | "online",
  visibilidade: string,
): MotivoRetomada | null {
  if (tipo === "online") return "online";
  if (tipo === "focus") return visibilidade === "hidden" ? null : "focus";
  return visibilidade === "visible" ? "visibility" : null;
}
