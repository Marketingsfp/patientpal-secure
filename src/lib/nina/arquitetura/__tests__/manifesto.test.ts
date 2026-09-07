import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CATEGORIAS_ARQUITETURA,
  NODES_ARQUITETURA,
  nodePorId,
  nodesPorCategoria,
} from "../manifesto";

const RAIZ = resolve(__dirname, "../../../../..");

function conteudo(arquivo: string): string {
  return readFileSync(resolve(RAIZ, arquivo), "utf8");
}

describe("manifesto da arquitetura da Nina", () => {
  it("tem identificadores únicos", () => {
    const ids = NODES_ARQUITETURA.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("usa apenas categorias previstas", () => {
    for (const node of NODES_ARQUITETURA) {
      expect(CATEGORIAS_ARQUITETURA).toContain(node.categoria);
    }
  });

  it("aponta somente para arquivos que existem", () => {
    for (const node of NODES_ARQUITETURA) {
      if (!node.arquivo) continue;
      expect(existsSync(resolve(RAIZ, node.arquivo)), `${node.id}: ${node.arquivo}`).toBe(true);
    }
  });

  it("aponta somente para funções que existem no arquivo indicado", () => {
    for (const node of NODES_ARQUITETURA) {
      if (!node.funcao || !node.arquivo) continue;
      const texto = conteudo(node.arquivo);
      const achou = new RegExp(
        `(function|const)\\s+${node.funcao}\\b`,
      ).test(texto);
      expect(achou, `${node.id}: ${node.funcao} em ${node.arquivo}`).toBe(true);
    }
  });

  it("liga apenas nodes existentes e mantém as conexões coerentes nos dois sentidos", () => {
    for (const node of NODES_ARQUITETURA) {
      for (const proximo of node.seguintes) {
        const alvo = nodePorId(proximo);
        expect(alvo, `${node.id} -> ${proximo}`).toBeDefined();
        expect(alvo!.anteriores, `${proximo} deve declarar ${node.id} como anterior`).toContain(
          node.id,
        );
      }
      for (const anterior of node.anteriores) {
        const origem = nodePorId(anterior);
        expect(origem, `${anterior} -> ${node.id}`).toBeDefined();
        expect(origem!.seguintes, `${anterior} deve declarar ${node.id} como seguinte`).toContain(
          node.id,
        );
      }
    }
  });

  it("descreve entrada, saída, descrição e erros em todos os nodes", () => {
    for (const node of NODES_ARQUITETURA) {
      expect(node.nome.length, node.id).toBeGreaterThan(0);
      expect(node.descricao.length, node.id).toBeGreaterThan(10);
      expect(node.entrada.length, node.id).toBeGreaterThan(0);
      expect(node.saida.length, node.id).toBeGreaterThan(0);
      expect(node.erros.length, node.id).toBeGreaterThan(0);
    }
  });

  it("tem um ponto de entrada e pelo menos um ponto final", () => {
    const entradas = NODES_ARQUITETURA.filter((n) => n.anteriores.length === 0);
    const finais = NODES_ARQUITETURA.filter((n) => n.seguintes.length === 0);
    expect(entradas.map((n) => n.id)).toEqual(["message.inbound", "voice.inbound"]);
    expect(finais.length).toBeGreaterThan(0);
  });

  it("cobre as categorias essenciais do fluxo", () => {
    for (const categoria of [
      "ENTRADA",
      "CONTEXTO",
      "MEMORIA",
      "INSTRUCOES",
      "CONHECIMENTO",
      "IA",
      "TOOLS",
      "VALIDACAO",
      "SAIDA",
      "OBSERVABILIDADE",
      "ERRO_FALLBACK",
    ] as const) {
      expect(nodesPorCategoria(categoria).length, categoria).toBeGreaterThan(0);
    }
  });

  it("não executa lógica de negócio: só descreve a arquitetura", () => {
    const texto = conteudo("src/lib/nina/arquitetura/manifesto.ts");
    expect(texto).not.toMatch(/\bimport\s+.*from\s+["']/);
    expect(texto).not.toMatch(/supabase|createServerFn|fetch\(/i);
  });
});
