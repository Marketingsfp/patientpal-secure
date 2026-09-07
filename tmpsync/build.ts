import { readFileSync, writeFileSync } from "node:fs";
const snap = readFileSync("tmpsync/snap.json", "utf8").trim();
const head = `/**
 * FASE 1 — ARCHITECTURE SYNC (comparação backend ↔ manifesto ↔ canvas).
 *
 * Módulo PURO de auditoria: guarda a foto da versão anterior do manifesto e
 * calcula o diff estrutural contra a versão atual. Não executa nada do fluxo
 * da Nina, não lê banco e não é importado pelo atendimento.
 */
import { NODES_ARQUITETURA, type NodeArquitetura } from "./manifesto";

export type AssinaturaNode = {
  id: string;
  categoria: string;
  arquivo: string | null;
  funcao: string | null;
  anteriores: string[];
  seguintes: string[];
};

export type MudancaNode = {
  id: string;
  campos: string[];
  de: Partial<AssinaturaNode>;
  para: Partial<AssinaturaNode>;
};

export type DiffArquitetura = {
  adicionados: string[];
  alterados: MudancaNode[];
  removidos: string[];
  inalterados: string[];
  resumo: string;
};

/** Foto do manifesto na versão 1 (antes desta sincronização). */
export const SNAPSHOT_ANTERIOR: AssinaturaNode[] = ${snap};

export function assinaturaDe(node: NodeArquitetura): AssinaturaNode {
  return {
    id: node.id,
    categoria: node.categoria,
    arquivo: node.arquivo ?? null,
    funcao: node.funcao ?? null,
    anteriores: [...node.anteriores].sort(),
    seguintes: [...node.seguintes].sort(),
  };
}

/** Assinatura atual do manifesto, base para o canvas e para o diff. */
export function assinaturaAtual(nodes: NodeArquitetura[] = NODES_ARQUITETURA): AssinaturaNode[] {
  return nodes.map(assinaturaDe);
}

const iguais = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function calcularDiffArquitetura(
  anterior: AssinaturaNode[] = SNAPSHOT_ANTERIOR,
  atual: AssinaturaNode[] = assinaturaAtual(),
): DiffArquitetura {
  const antes = new Map(anterior.map((n) => [n.id, n]));
  const depois = new Map(atual.map((n) => [n.id, n]));

  const adicionados = atual.filter((n) => !antes.has(n.id)).map((n) => n.id);
  const removidos = anterior.filter((n) => !depois.has(n.id)).map((n) => n.id);
  const alterados: MudancaNode[] = [];
  const inalterados: string[] = [];

  for (const node of atual) {
    const velho = antes.get(node.id);
    if (!velho) continue;
    const campos: string[] = [];
    if (velho.categoria !== node.categoria) campos.push("categoria");
    // Trocar apenas o caminho do arquivo não conta como mudança arquitetural
    // quando a função e as conexões continuam as mesmas.
    if (velho.funcao !== node.funcao) campos.push("funcao");
    if (!iguais(velho.anteriores, node.anteriores)) campos.push("anteriores");
    if (!iguais(velho.seguintes, node.seguintes)) campos.push("seguintes");
    if (campos.length === 0) inalterados.push(node.id);
    else
      alterados.push({
        id: node.id,
        campos,
        de: { categoria: velho.categoria, funcao: velho.funcao, anteriores: velho.anteriores, seguintes: velho.seguintes },
        para: { categoria: node.categoria, funcao: node.funcao, anteriores: node.anteriores, seguintes: node.seguintes },
      });
  }

  const semMudanca = adicionados.length === 0 && removidos.length === 0 && alterados.length === 0;

  return {
    adicionados,
    alterados,
    removidos,
    inalterados,
    resumo: semMudanca
      ? "Arquitetura sincronizada — nenhuma alteração estrutural detectada."
      : \`+\${adicionados.length} adicionado(s), ~\${alterados.length} alterado(s), -\${removidos.length} removido(s), \${inalterados.length} inalterado(s).\`,
  };
}

/** Diff em texto, no formato +/~/- usado no registro da sincronização. */
export function diffEmTexto(diff: DiffArquitetura = calcularDiffArquitetura()): string {
  const linhas: string[] = [];
  for (const id of diff.adicionados) linhas.push(\`+ \${id}\`);
  for (const m of diff.alterados) linhas.push(\`~ \${m.id} (\${m.campos.join(", ")})\`);
  for (const id of diff.removidos) linhas.push(\`- \${id}\`);
  return linhas.length > 0 ? linhas.join("\\n") : diff.resumo;
}
`;
writeFileSync("src/lib/nina/arquitetura/sync.ts", head);
