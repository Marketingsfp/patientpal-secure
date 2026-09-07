/**
 * Comparação linha a linha entre duas versões das Instruções da Nina.
 * Puro cálculo de texto — não toca em banco nem no atendimento.
 */
export type LinhaDiff = {
  tipo: "igual" | "adicionada" | "removida" | "alterada";
  antes: string | null;
  depois: string | null;
};

/** Maior subsequência comum de linhas (LCS) — base do diff. */
function lcs(a: string[], b: string[]): number[][] {
  const m = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      m[i]![j] = a[i] === b[j] ? m[i + 1]![j + 1]! + 1 : Math.max(m[i + 1]![j]!, m[i]![j + 1]!);
    }
  }
  return m;
}

export function compararTextos(antes: string, depois: string): LinhaDiff[] {
  const a = antes.split("\n");
  const b = depois.split("\n");
  const m = lcs(a, b);
  const bruto: LinhaDiff[] = [];

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      bruto.push({ tipo: "igual", antes: a[i]!, depois: b[j]! });
      i++;
      j++;
    } else if (m[i + 1]![j]! >= m[i]![j + 1]!) {
      bruto.push({ tipo: "removida", antes: a[i]!, depois: null });
      i++;
    } else {
      bruto.push({ tipo: "adicionada", antes: null, depois: b[j]! });
      j++;
    }
  }
  while (i < a.length) bruto.push({ tipo: "removida", antes: a[i++]!, depois: null });
  while (j < b.length) bruto.push({ tipo: "adicionada", antes: null, depois: b[j++]! });

  // Uma remoção seguida de uma inclusão vira "alterada" (fica mais legível).
  const saida: LinhaDiff[] = [];
  for (let k = 0; k < bruto.length; k++) {
    const atual = bruto[k]!;
    const prox = bruto[k + 1];
    if (atual.tipo === "removida" && prox?.tipo === "adicionada") {
      saida.push({ tipo: "alterada", antes: atual.antes, depois: prox.depois });
      k++;
    } else {
      saida.push(atual);
    }
  }
  return saida;
}

export function resumoDiff(linhas: LinhaDiff[]) {
  return {
    adicionadas: linhas.filter((l) => l.tipo === "adicionada").length,
    removidas: linhas.filter((l) => l.tipo === "removida").length,
    alteradas: linhas.filter((l) => l.tipo === "alterada").length,
  };
}

/** Só as partes que mudaram, com 2 linhas de contexto em volta. */
export function apenasMudancas(linhas: LinhaDiff[], contexto = 2): LinhaDiff[] {
  const manter = new Set<number>();
  linhas.forEach((l, idx) => {
    if (l.tipo === "igual") return;
    for (let k = idx - contexto; k <= idx + contexto; k++) {
      if (k >= 0 && k < linhas.length) manter.add(k);
    }
  });
  return linhas.filter((_, idx) => manter.has(idx));
}
