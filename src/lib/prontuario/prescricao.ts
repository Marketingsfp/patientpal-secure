export type ItemPrescricao = {
  id: string;
  nome: string;
  apresentacao: string;
  posologia: string;
  quantidade: string;
};

export function novoItem(p: Partial<ItemPrescricao> = {}): ItemPrescricao {
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? String(Math.random())).slice(0, 12),
    nome: "",
    apresentacao: "",
    posologia: "",
    quantidade: "",
    ...p,
  };
}

/** Texto que vai para o campo `prescricao` do prontuário e para a impressão. */
export function prescricaoParaTexto(itens: ItemPrescricao[]): string {
  return itens
    .filter((i) => i.nome.trim())
    .map((i, idx) => {
      const linha1 = [i.nome.trim(), i.apresentacao.trim()].filter(Boolean).join(" — ");
      const qtd = i.quantidade.trim() ? ` .......... ${i.quantidade.trim()}` : "";
      const pos = i.posologia.trim() ? `\n   ${i.posologia.trim()}` : "";
      return `${idx + 1}) ${linha1}${qtd}${pos}`;
    })
    .join("\n");
}

/** Reconstrói a lista a partir do texto salvo (best effort). */
export function textoParaPrescricao(texto: string): ItemPrescricao[] {
  const linhas = (texto ?? "").split("\n");
  const itens: ItemPrescricao[] = [];
  for (const raw of linhas) {
    const l = raw.trim();
    if (!l) continue;
    const m = /^\d+\)\s*(.*)$/.exec(l);
    if (m) {
      const [cabecalho, qtd] = m[1].split("..........");
      const [nome, apresentacao] = cabecalho.split(" — ");
      itens.push(
        novoItem({
          nome: (nome ?? "").trim(),
          apresentacao: (apresentacao ?? "").trim(),
          quantidade: (qtd ?? "").trim(),
        }),
      );
    } else if (itens.length) {
      const ultimo = itens[itens.length - 1];
      ultimo.posologia = ultimo.posologia ? `${ultimo.posologia} ${l}` : l;
    } else {
      itens.push(novoItem({ nome: l }));
    }
  }
  return itens;
}

export function mover<T>(lista: T[], de: number, para: number): T[] {
  if (para < 0 || para >= lista.length) return lista;
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}
