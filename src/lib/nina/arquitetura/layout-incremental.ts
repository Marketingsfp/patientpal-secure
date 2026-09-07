/**
 * FASE 5 — Atualização incremental do desenho da arquitetura da Nina.
 *
 * Camada pura (sem React, sem banco, sem nada do fluxo de atendimento).
 * Quando o Architecture Manifest muda, este módulo recalcula apenas a região
 * afetada do desenho e preserva o restante — inclusive as posições que a
 * pessoa moveu à mão (User Layout Override), separadas do layout calculado
 * automaticamente (Canonical Layout).
 */
import type { NodeArquitetura } from "./manifesto";
import { CATEGORIAS_ARQUITETURA } from "./manifesto";
import {
  ALTURA_NODE,
  LARGURA_NODE,
  VAO_COLUNA,
  VAO_LINHA,
  calcularLayout,
  type Posicao,
} from "./layout";
import {
  assinaturaAtual,
  calcularDiffArquitetura,
  type AssinaturaNode,
  type DiffArquitetura,
} from "./sync";

const ESPACO_COLUNA = LARGURA_NODE + VAO_COLUNA;
const ESPACO_LINHA = ALTURA_NODE + VAO_LINHA;

/** Layout guardado: o calculado automaticamente e o movido manualmente. */
export type EstadoLayout = {
  /** Assinatura do manifesto que gerou o layout canônico guardado. */
  assinatura: AssinaturaNode[];
  /** Canonical Layout — posições calculadas pelo algoritmo. */
  canonical: Record<string, Posicao>;
  /** User Layout Override — posições movidas manualmente. */
  overrides: Record<string, Posicao>;
};

export type ResultadoIncremental = {
  canonical: Record<string, Posicao>;
  overrides: Record<string, Posicao>;
  /** Canonical + overrides válidos: é isto que o canvas desenha. */
  posicoes: Record<string, Posicao>;
  /** Nodes cuja posição foi recalculada nesta atualização. */
  afetados: string[];
  /** Overrides descartados por conflito de legibilidade. */
  overridesDescartados: string[];
  /** true = mudança estrutural grande, layout refeito por inteiro. */
  global: boolean;
  motivo: string;
};

export const ESTADO_LAYOUT_VAZIO: EstadoLayout = {
  assinatura: [],
  canonical: {},
  overrides: {},
};

/** Posições efetivas: o override manual vence o canônico, quando existir. */
export function posicoesEfetivas(estado: EstadoLayout): Record<string, Posicao> {
  return { ...estado.canonical, ...estado.overrides };
}

/**
 * Subgrafo afetado pelo diff: componentes novos, componentes cujas conexões
 * mudaram, vizinhos de componentes removidos e os vizinhos imediatos de todos
 * eles (raio 1). Mudança só de propriedade interna não entra aqui.
 */
export function subgrafoAfetado(
  nodes: NodeArquitetura[],
  diff: DiffArquitetura,
): Set<string> {
  const existentes = new Set(nodes.map((n) => n.id));
  const vizinhos = new Map<string, Set<string>>();
  for (const node of nodes) vizinhos.set(node.id, new Set());
  for (const node of nodes) {
    for (const outro of [...node.anteriores, ...node.seguintes]) {
      if (!existentes.has(outro)) continue;
      vizinhos.get(node.id)!.add(outro);
      vizinhos.get(outro)!.add(node.id);
    }
  }

  const semente = new Set<string>();
  for (const id of diff.adicionados) if (existentes.has(id)) semente.add(id);
  for (const mudanca of diff.alterados) {
    const mudouConexao =
      mudanca.campos.includes("anteriores") || mudanca.campos.includes("seguintes");
    if (mudouConexao && existentes.has(mudanca.id)) semente.add(mudanca.id);
  }
  // Removidos deixam um buraco: recalcula quem estava ligado a eles.
  for (const removido of diff.removidos) {
    for (const node of nodes) {
      if (node.anteriores.includes(removido) || node.seguintes.includes(removido)) {
        semente.add(node.id);
      }
    }
  }

  const afetados = new Set(semente);
  for (const id of semente) {
    for (const vizinho of vizinhos.get(id) ?? []) afetados.add(vizinho);
  }
  return afetados;
}

/** Mudança estrutural grande: aí sim vale reorganizar o desenho inteiro. */
export function mudancaGrande(
  nodes: NodeArquitetura[],
  diff: DiffArquitetura,
  afetados: Set<string>,
): boolean {
  const total = Math.max(nodes.length, 1);
  const estruturais = diff.adicionados.length + diff.removidos.length;
  return afetados.size / total > 0.4 || estruturais / total > 0.25;
}

function colide(a: Posicao, b: Posicao) {
  return (
    Math.abs(a.x - b.x) < LARGURA_NODE + VAO_COLUNA * 0.4 &&
    Math.abs(a.y - b.y) < ALTURA_NODE + VAO_LINHA * 0.5
  );
}

/** Empurra verticalmente até o node não sobrepor nenhum outro já colocado. */
function acomodar(posicao: Posicao, ocupadas: Posicao[]): Posicao {
  let candidata = { ...posicao };
  let passo = 1;
  let seguranca = 0;
  while (ocupadas.some((o) => colide(candidata, o)) && seguranca < 200) {
    const deslocamento = Math.ceil(passo / 2) * ESPACO_LINHA;
    candidata = {
      x: posicao.x,
      y: posicao.y + (passo % 2 === 1 ? deslocamento : -deslocamento),
    };
    passo += 1;
    seguranca += 1;
  }
  return candidata;
}

/**
 * Aplica o diff ao layout guardado.
 *
 * Nada aqui muda backend, conexões ou ordem de execução: só coordenadas x/y.
 */
export function aplicarDiffIncremental(
  nodes: NodeArquitetura[],
  estadoAnterior: EstadoLayout = ESTADO_LAYOUT_VAZIO,
  diff: DiffArquitetura = calcularDiffArquitetura(estadoAnterior.assinatura, assinaturaAtual(nodes)),
): ResultadoIncremental {
  const base = calcularLayout(nodes);
  const basePos = new Map(base.nodes.map((n) => [n.node.id, { x: n.x, y: n.y }]));
  const existentes = new Set(nodes.map((n) => n.id));
  const semLayoutAnterior = Object.keys(estadoAnterior.canonical).length === 0;

  const afetados = subgrafoAfetado(nodes, diff);
  const global = semLayoutAnterior || mudancaGrande(nodes, diff, afetados);

  const canonical: Record<string, Posicao> = {};
  const overridesDescartados: string[] = [];

  if (global) {
    for (const node of nodes) canonical[node.id] = basePos.get(node.id)!;
  } else {
    // 1. Preserva quem não foi afetado.
    for (const node of nodes) {
      const anterior = estadoAnterior.canonical[node.id];
      if (anterior && !afetados.has(node.id)) canonical[node.id] = anterior;
    }

    // 2. Recoloca a região afetada perto de quem já está no lugar.
    const ocupadas = () => Object.values(canonical);
    const pendentes = nodes.filter((n) => canonical[n.id] == null);
    // Coloca primeiro quem tem mais vizinhos já posicionados.
    pendentes.sort((a, b) => referencia(b, canonical).qtd - referencia(a, canonical).qtd);
    for (const node of pendentes) {
      const { x, y, qtd } = referencia(node, canonical);
      const alvo =
        qtd > 0
          ? { x: Math.round(x), y: Math.round(y) }
          : (estadoAnterior.canonical[node.id] ?? basePos.get(node.id)!);
      canonical[node.id] = acomodar(alvo, ocupadas());
    }
  }

  // 3. Overrides: preservados por padrão; descartados só quando o componente
  //    saiu da arquitetura ou quando a posição manual passou a atropelar
  //    outro node (integridade e legibilidade do grafo vêm primeiro).
  const overrides: Record<string, Posicao> = {};
  for (const [id, posicao] of Object.entries(estadoAnterior.overrides)) {
    if (!existentes.has(id)) {
      overridesDescartados.push(id);
      continue;
    }
    const outros = nodes
      .filter((n) => n.id !== id)
      .map((n) => estadoAnterior.overrides[n.id] ?? canonical[n.id])
      .filter((p): p is Posicao => !!p);
    if (afetados.has(id) && outros.some((o) => colide(posicao, o))) {
      overridesDescartados.push(id);
      continue;
    }
    overrides[id] = posicao;
  }

  const motivo = global
    ? semLayoutAnterior
      ? "Primeiro cálculo do desenho."
      : "Mudança estrutural grande — desenho reorganizado por inteiro."
    : afetados.size === 0
      ? "Arquitetura sincronizada — nenhuma posição recalculada."
      : `Recalculada apenas a região afetada (${afetados.size} componente(s)).`;

  return {
    canonical,
    overrides,
    posicoes: { ...canonical, ...overrides },
    afetados: [...afetados],
    overridesDescartados,
    global,
    motivo,
  };
}

/** Média das posições dos vizinhos já colocados, deslocada pelo sentido do fluxo. */
function referencia(
  node: NodeArquitetura,
  colocadas: Record<string, Posicao>,
): { x: number; y: number; qtd: number } {
  const antes = node.anteriores.map((id) => colocadas[id]).filter((p): p is Posicao => !!p);
  const depois = node.seguintes.map((id) => colocadas[id]).filter((p): p is Posicao => !!p);
  const qtd = antes.length + depois.length;
  if (qtd === 0) return { x: 0, y: 0, qtd: 0 };

  const medias = (lista: Posicao[]) => ({
    x: lista.reduce((s, p) => s + p.x, 0) / lista.length,
    y: lista.reduce((s, p) => s + p.y, 0) / lista.length,
  });

  if (antes.length > 0 && depois.length > 0) {
    const a = medias(antes);
    const d = medias(depois);
    const x = d.x - a.x >= ESPACO_COLUNA ? (a.x + d.x) / 2 : a.x + ESPACO_COLUNA;
    return { x, y: (a.y + d.y) / 2, qtd };
  }
  if (antes.length > 0) {
    const a = medias(antes);
    return { x: a.x + ESPACO_COLUNA, y: a.y, qtd };
  }
  const d = medias(depois);
  return { x: d.x - ESPACO_COLUNA, y: d.y, qtd };
}

/* ------------------------------------------------------------------ */
/* Status da arquitetura                                               */
/* ------------------------------------------------------------------ */

export type ProblemaIntegridade = { id: string; problema: string };

/**
 * Integridade estrutural do manifesto: referências quebradas, conexões que
 * só existem de um lado, categoria fora da lista e componentes soltos.
 */
export function verificarIntegridade(nodes: NodeArquitetura[]): ProblemaIntegridade[] {
  const mapa = new Map(nodes.map((n) => [n.id, n]));
  const problemas: ProblemaIntegridade[] = [];
  const categorias = new Set<string>(CATEGORIAS_ARQUITETURA);

  const vistos = new Set<string>();
  for (const node of nodes) {
    if (vistos.has(node.id)) problemas.push({ id: node.id, problema: "componente repetido" });
    vistos.add(node.id);

    if (!categorias.has(node.categoria)) {
      problemas.push({ id: node.id, problema: `categoria desconhecida (${node.categoria})` });
    }
    for (const seguinte of node.seguintes) {
      const alvo = mapa.get(seguinte);
      if (!alvo) {
        problemas.push({ id: node.id, problema: `aponta para componente inexistente (${seguinte})` });
        continue;
      }
      if (!alvo.anteriores.includes(node.id)) {
        problemas.push({ id: node.id, problema: `conexão não recíproca com ${seguinte}` });
      }
    }
    for (const anterior of node.anteriores) {
      const origem = mapa.get(anterior);
      if (!origem) {
        problemas.push({ id: node.id, problema: `recebe de componente inexistente (${anterior})` });
        continue;
      }
      if (!origem.seguintes.includes(node.id)) {
        problemas.push({ id: node.id, problema: `conexão não recíproca com ${anterior}` });
      }
    }
    if (nodes.length > 1 && node.anteriores.length === 0 && node.seguintes.length === 0) {
      problemas.push({ id: node.id, problema: "componente sem nenhuma conexão" });
    }
  }

  return problemas;
}

export type StatusArquitetura = {
  nivel: "sincronizada" | "alteracoes" | "inconsistente";
  cor: "verde" | "amarelo" | "vermelho";
  titulo: string;
  detalhe: string;
  problemas: ProblemaIntegridade[];
  diff: DiffArquitetura;
};

/**
 * Status mostrado na página. Nunca fica verde com o manifesto divergente:
 * qualquer inconsistência estrutural vira vermelho e qualquer diferença em
 * relação à última sincronização vira amarelo.
 */
export function statusArquitetura(
  nodes: NodeArquitetura[],
  diff: DiffArquitetura = calcularDiffArquitetura(),
): StatusArquitetura {
  const problemas = verificarIntegridade(nodes);
  if (problemas.length > 0) {
    return {
      nivel: "inconsistente",
      cor: "vermelho",
      titulo: "Inconsistência na arquitetura",
      detalhe: `${problemas.length} problema(s) estrutural(is) no mapa: ${problemas
        .slice(0, 3)
        .map((p) => `${p.id} — ${p.problema}`)
        .join("; ")}${problemas.length > 3 ? "…" : ""}`,
      problemas,
      diff,
    };
  }

  const mudou =
    diff.adicionados.length > 0 || diff.removidos.length > 0 || diff.alterados.length > 0;
  if (mudou) {
    return {
      nivel: "alteracoes",
      cor: "amarelo",
      titulo: "Alterações detectadas — reorganização disponível",
      detalhe: diff.resumo,
      problemas,
      diff,
    };
  }

  return {
    nivel: "sincronizada",
    cor: "verde",
    titulo: "Arquitetura sincronizada",
    detalhe: "Nenhuma alteração estrutural detectada desde a última sincronização.",
    problemas,
    diff,
  };
}
