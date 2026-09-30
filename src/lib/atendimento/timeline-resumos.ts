/**
 * Resumo da Nina DENTRO da conversa (regra pura).
 *
 * Cada resumo é um item da linha do tempo, no ponto em que a Nina concluiu o atendimento: logo
 * depois do aviso de encaminhamento daquela transferência. Quando não há aviso próximo (por
 * exemplo, conclusão por agendamento), entra pela hora da conclusão. Nada fica fixo no topo.
 */
import type { ResumoNaConversa } from "./resumo-retencao";

export type ItemTimelineResumo = { kind: "resumo"; at: number; resumo: ResumoNaConversa };

/** Distância máxima entre a conclusão e o aviso de encaminhamento para considerá-los a mesma coisa. */
export const JANELA_AVISO_RESUMO_MS = 10 * 60_000;

export function inserirResumosNaTimeline<T extends { at: number }>(
  itens: readonly T[],
  resumos: readonly ResumoNaConversa[],
  ehAvisoDeEncaminhamento: (item: T) => boolean,
): Array<T | ItemTimelineResumo> {
  const saida: Array<T | ItemTimelineResumo> = [...itens];
  for (const resumo of resumos) {
    const em = Date.parse(resumo.handoff_em);
    if (!Number.isFinite(em)) continue;
    const novo: ItemTimelineResumo = { kind: "resumo", at: em, resumo };
    let melhor = -1;
    let distancia = Infinity;
    saida.forEach((item, i) => {
      if ((item as { kind?: string }).kind === "resumo" || !ehAvisoDeEncaminhamento(item as T)) return;
      const d = Math.abs(item.at - em);
      if (d <= JANELA_AVISO_RESUMO_MS && d < distancia) {
        melhor = i;
        distancia = d;
      }
    });
    if (melhor >= 0) {
      // Depois do aviso e de qualquer resumo já colocado logo abaixo dele.
      let pos = melhor + 1;
      while (pos < saida.length && (saida[pos] as { kind?: string }).kind === "resumo") pos++;
      saida.splice(pos, 0, novo);
      continue;
    }
    const pos = saida.findIndex((item) => (item as { kind?: string }).kind !== "resumo" && item.at > em);
    saida.splice(pos < 0 ? saida.length : pos, 0, novo);
  }
  return saida;
}

/**
 * Casa cada resumo com o aviso de encaminhamento da mesma transferencia, para os dois serem UM so
 * cartao. Um aviso recebe no maximo um resumo; o que nao encontra aviso proximo volta em `soltos`
 * (por exemplo, conclusao por agendamento) e entra na conversa como cartao proprio.
 */
export function casarResumosComAvisos<T extends { at: number }>(
  itens: readonly T[],
  resumos: readonly ResumoNaConversa[],
  ehAvisoDeEncaminhamento: (item: T) => boolean,
): { anexos: Map<T, ResumoNaConversa>; soltos: ResumoNaConversa[] } {
  const anexos = new Map<T, ResumoNaConversa>();
  const soltos: ResumoNaConversa[] = [];
  for (const resumo of resumos) {
    const em = Date.parse(resumo.handoff_em);
    let melhor: T | null = null;
    let distancia = Infinity;
    for (const item of itens) {
      if (anexos.has(item) || !ehAvisoDeEncaminhamento(item)) continue;
      const d = Math.abs(item.at - em);
      if (d <= JANELA_AVISO_RESUMO_MS && d < distancia) {
        melhor = item;
        distancia = d;
      }
    }
    if (melhor) anexos.set(melhor, resumo);
    else soltos.push(resumo);
  }
  return { anexos, soltos };
}
