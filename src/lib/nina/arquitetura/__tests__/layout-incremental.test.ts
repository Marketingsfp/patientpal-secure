/**
 * FASE 5 — Atualização incremental do desenho e status da arquitetura.
 * Testes puros: nenhum acesso a banco, rede ou fluxo de atendimento.
 */
import { describe, expect, test } from "bun:test";
import { NODES_ARQUITETURA, type NodeArquitetura } from "../manifesto";
import { assinaturaAtual, calcularDiffArquitetura, diffPendente } from "../sync";
import {
  ESTADO_LAYOUT_VAZIO,
  aplicarDiffIncremental,
  mudancaGrande,
  posicoesEfetivas,
  statusArquitetura,
  subgrafoAfetado,
  verificarIntegridade,
  type EstadoLayout,
} from "../layout-incremental";

function clonar(nodes: NodeArquitetura[]): NodeArquitetura[] {
  return nodes.map((n) => ({ ...n, anteriores: [...n.anteriores], seguintes: [...n.seguintes] }));
}

function estadoInicial(nodes = NODES_ARQUITETURA): EstadoLayout {
  const resultado = aplicarDiffIncremental(nodes, ESTADO_LAYOUT_VAZIO);
  return { assinatura: assinaturaAtual(nodes), canonical: resultado.canonical, overrides: {} };
}

describe("layout incremental", () => {
  test("primeiro cálculo posiciona todos os componentes", () => {
    const resultado = aplicarDiffIncremental(NODES_ARQUITETURA, ESTADO_LAYOUT_VAZIO);
    expect(resultado.global).toBe(true);
    expect(Object.keys(resultado.canonical).length).toBe(NODES_ARQUITETURA.length);
  });

  test("sem mudança, nada é recalculado e as posições continuam iguais", () => {
    const antes = estadoInicial();
    const resultado = aplicarDiffIncremental(NODES_ARQUITETURA, antes);
    expect(resultado.global).toBe(false);
    expect(resultado.afetados).toHaveLength(0);
    expect(resultado.canonical).toEqual(antes.canonical);
  });

  test("node novo fica perto dos componentes relacionados, não no canto", () => {
    const antes = estadoInicial();
    const agenda = NODES_ARQUITETURA.find((n) => n.categoria === "TOOLS")!;
    const nodes = clonar(NODES_ARQUITETURA);
    const novo: NodeArquitetura = {
      id: "tool.calendar.reschedule",
      nome: "Remarcar consulta",
      categoria: "TOOLS",
      descricao: "Ferramenta hipotética usada apenas neste teste.",
      anteriores: [agenda.id],
      seguintes: [],
      entrada: "teste",
      saida: "teste",
      erros: [],
    };
    nodes.find((n) => n.id === agenda.id)!.seguintes.push(novo.id);
    nodes.push(novo);

    const diff = calcularDiffArquitetura(antes.assinatura, assinaturaAtual(nodes));
    expect(diff.adicionados).toContain(novo.id);

    const resultado = aplicarDiffIncremental(nodes, antes, diff);
    expect(resultado.global).toBe(false);

    const posNovo = resultado.canonical[novo.id]!;
    const posAgenda = resultado.canonical[agenda.id]!;
    expect(Math.abs(posNovo.x - posAgenda.x)).toBeLessThanOrEqual(600);
    expect(Math.abs(posNovo.y - posAgenda.y)).toBeLessThanOrEqual(600);

    // Componentes distantes do novo mantêm exatamente a posição anterior.
    const distantes = Object.keys(antes.canonical).filter(
      (id) => !resultado.afetados.includes(id),
    );
    expect(distantes.length).toBeGreaterThan(0);
    for (const id of distantes) expect(resultado.canonical[id]).toEqual(antes.canonical[id]!);
  });

  test("node removido sai do desenho e move só a região afetada", () => {
    const antes = estadoInicial();
    const alvo = NODES_ARQUITETURA.find(
      (n) => n.anteriores.length > 0 && n.seguintes.length === 0,
    )!;
    const nodes = clonar(NODES_ARQUITETURA).filter((n) => n.id !== alvo.id);
    for (const node of nodes) {
      node.anteriores = node.anteriores.filter((id) => id !== alvo.id);
      node.seguintes = node.seguintes.filter((id) => id !== alvo.id);
    }

    const diff = calcularDiffArquitetura(antes.assinatura, assinaturaAtual(nodes));
    expect(diff.removidos).toContain(alvo.id);

    const resultado = aplicarDiffIncremental(nodes, antes, diff);
    expect(resultado.canonical[alvo.id]).toBeUndefined();
    expect(resultado.afetados.length).toBeLessThan(nodes.length);
  });

  test("mudança só de propriedade interna preserva a posição", () => {
    const antes = estadoInicial();
    const nodes = clonar(NODES_ARQUITETURA);
    nodes[3]!.descricao = "descrição revisada";
    const resultado = aplicarDiffIncremental(nodes, antes);
    expect(resultado.afetados).toHaveLength(0);
    expect(resultado.canonical[nodes[3]!.id]).toEqual(antes.canonical[nodes[3]!.id]!);
  });

  test("mudança estrutural grande libera reorganização global", () => {
    const antes = estadoInicial();
    const nodes = clonar(NODES_ARQUITETURA).slice(0, 20);
    const ids = new Set(nodes.map((n) => n.id));
    for (const node of nodes) {
      node.anteriores = node.anteriores.filter((id) => ids.has(id));
      node.seguintes = node.seguintes.filter((id) => ids.has(id));
    }
    const diff = calcularDiffArquitetura(antes.assinatura, assinaturaAtual(nodes));
    expect(mudancaGrande(nodes, diff, subgrafoAfetado(nodes, diff))).toBe(true);
    expect(aplicarDiffIncremental(nodes, antes, diff).global).toBe(true);
  });

  test("movimentação manual sobrevive a uma atualização pequena", () => {
    const base = estadoInicial();
    const manual = NODES_ARQUITETURA[NODES_ARQUITETURA.length - 1]!.id;
    const antes: EstadoLayout = {
      ...base,
      overrides: { [manual]: { x: 12_000, y: 4_000 } },
    };
    const nodes = clonar(NODES_ARQUITETURA);
    nodes[2]!.descricao = "ajuste interno";
    const resultado = aplicarDiffIncremental(nodes, antes);
    expect(resultado.overrides[manual]).toEqual({ x: 12_000, y: 4_000 });
    expect(resultado.posicoes[manual]).toEqual({ x: 12_000, y: 4_000 });
  });

  test("override que passa a sobrepor outro componente é descartado", () => {
    const criar = (id: string, anteriores: string[], seguintes: string[]): NodeArquitetura => ({
      id,
      nome: id,
      categoria: "TOOLS",
      descricao: "somente teste",
      anteriores,
      seguintes,
      entrada: "teste",
      saida: "teste",
      erros: [],
    });
    // Cadeia longa: assim a mudança é pequena e o recálculo é local.
    const total = 20;
    const cadeia = (extra: boolean): NodeArquitetura[] =>
      Array.from({ length: total }, (_, i) => {
        const seguintes = i < total - 1 ? [`n${i + 1}`] : [];
        if (extra && i === 5) seguintes.push("n8");
        return criar(
          `n${i}`,
          i > 0 ? [`n${i - 1}`] : [],
          seguintes,
        );
      }).map((node, i, lista) => {
        if (extra && node.id === "n8" && !node.anteriores.includes("n5")) {
          return { ...node, anteriores: [...node.anteriores, "n5"] };
        }
        void lista;
        void i;
        return node;
      });

    const antesNodes = cadeia(false);
    const inicial = aplicarDiffIncremental(antesNodes, ESTADO_LAYOUT_VAZIO);
    const estado: EstadoLayout = {
      assinatura: assinaturaAtual(antesNodes),
      canonical: inicial.canonical,
      // Movimentação manual colocada exatamente em cima de outro componente.
      overrides: { n5: { ...inicial.canonical["n12"]! } },
    };

    const resultado = aplicarDiffIncremental(cadeia(true), estado);
    expect(resultado.global).toBe(false);
    expect(resultado.overridesDescartados).toContain("n5");
    expect(resultado.overrides["n5"]).toBeUndefined();
  });

  test("override de componente removido não sobrevive", () => {
    const base = estadoInicial();
    const alvo = NODES_ARQUITETURA.find(
      (n) => n.anteriores.length > 0 && n.seguintes.length === 0,
    )!;
    const antes: EstadoLayout = { ...base, overrides: { [alvo.id]: { x: 10, y: 10 } } };
    const nodes = clonar(NODES_ARQUITETURA).filter((n) => n.id !== alvo.id);
    for (const node of nodes) {
      node.seguintes = node.seguintes.filter((id) => id !== alvo.id);
      node.anteriores = node.anteriores.filter((id) => id !== alvo.id);
    }
    const resultado = aplicarDiffIncremental(nodes, antes);
    expect(resultado.overridesDescartados).toContain(alvo.id);
    expect(resultado.posicoes[alvo.id]).toBeUndefined();
  });

  test("posições efetivas dão prioridade ao ajuste manual", () => {
    const estado: EstadoLayout = {
      assinatura: [],
      canonical: { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } },
      overrides: { b: { x: 99, y: 99 } },
    };
    expect(posicoesEfetivas(estado)).toEqual({ a: { x: 0, y: 0 }, b: { x: 99, y: 99 } });
  });

  test("nenhum componente fica sobreposto após a atualização", () => {
    const antes = estadoInicial();
    const nodes = clonar(NODES_ARQUITETURA);
    const alvo = nodes.find((n) => n.categoria === "TOOLS")!;
    const novo: NodeArquitetura = {
      id: "tool.teste.novo",
      nome: "Ferramenta de teste",
      categoria: "TOOLS",
      descricao: "somente teste",
      anteriores: [alvo.id],
      seguintes: [],
      entrada: "teste",
      saida: "teste",
      erros: [],
    };
    alvo.seguintes.push(novo.id);
    nodes.push(novo);
    const posicoes = Object.values(aplicarDiffIncremental(nodes, antes).canonical);
    for (let i = 0; i < posicoes.length; i += 1) {
      for (let j = i + 1; j < posicoes.length; j += 1) {
        const a = posicoes[i]!;
        const b = posicoes[j]!;
        expect(a.x !== b.x || a.y !== b.y).toBe(true);
      }
    }
  });
});

describe("status da arquitetura", () => {
  test("manifesto real não tem problema de integridade", () => {
    expect(verificarIntegridade(NODES_ARQUITETURA)).toEqual([]);
  });

  test("manifesto na versão já sincronizada mostra verde", () => {
    const status = statusArquitetura(NODES_ARQUITETURA, diffPendente());
    expect(status.cor).toBe("verde");
    expect(status.titulo).toBe("Arquitetura sincronizada");
  });

  test("versão nova sem registro mostra amarelo", () => {
    const status = statusArquitetura(NODES_ARQUITETURA, diffPendente(99));
    expect(status.cor).toBe("amarelo");
  });

  test("referência quebrada mostra vermelho, nunca verde", () => {
    const nodes = clonar(NODES_ARQUITETURA);
    nodes[0]!.seguintes.push("componente.que.nao.existe");
    const status = statusArquitetura(nodes, diffPendente());
    expect(status.cor).toBe("vermelho");
    expect(status.problemas.length).toBeGreaterThan(0);
  });

  test("conexão só de um lado é inconsistência", () => {
    const nodes = clonar(NODES_ARQUITETURA);
    const alvo = nodes.find((n) => n.seguintes.length > 0)!;
    const destino = nodes.find((n) => n.id === alvo.seguintes[0])!;
    destino.anteriores = destino.anteriores.filter((id) => id !== alvo.id);
    expect(verificarIntegridade(nodes).length).toBeGreaterThan(0);
  });
});
