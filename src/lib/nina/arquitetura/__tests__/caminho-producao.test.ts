import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ETAPAS_CAMINHO, LIGACOES_CAMINHO } from "../caminho-producao";
import {
  ALTURA_ETAPA,
  LARGURA_ETAPA,
  calcularLayoutCaminho,
  escalaParaCaber,
  melhorLayoutCaminho,
} from "../caminho-producao-layout";
import { NODES_ARQUITETURA } from "../manifesto";

const RAIZ = join(import.meta.dir, "../../../../..");
const porId = new Map(ETAPAS_CAMINHO.map((e) => [e.id, e]));

describe("caminho da mensagem em produção", () => {
  it("ids únicos e ligações entre etapas que existem", () => {
    expect(porId.size).toBe(ETAPAS_CAMINHO.length);
    for (const l of LIGACOES_CAMINHO) {
      expect(porId.has(l.de)).toBe(true);
      expect(porId.has(l.para)).toBe(true);
    }
  });

  it("toda etapa aponta para arquivo e função que existem no repositório", () => {
    for (const etapa of ETAPAS_CAMINHO) {
      if (!etapa.arquivo) continue;
      const caminho = join(RAIZ, etapa.arquivo);
      expect(existsSync(caminho), `${etapa.id}: ${etapa.arquivo}`).toBe(true);
      if (etapa.funcao) {
        const fonte = readFileSync(caminho, "utf8");
        expect(
          new RegExp(`\\b${etapa.funcao}\\b`).test(fonte),
          `${etapa.id}: ${etapa.funcao}`,
        ).toBe(true);
      }
    }
  });

  it("só usa componentes de produção do mapa técnico", () => {
    for (const etapa of ETAPAS_CAMINHO) {
      if (!etapa.componente) continue;
      const node = NODES_ARQUITETURA.find((n) => n.id === etapa.componente);
      expect(node, etapa.componente).toBeDefined();
      expect(node!.categoria).not.toBe("HOMOLOGACAO");
    }
  });

  it("tudo parte do webhook (ou do vigia) e só as saídas terminam o caminho", () => {
    const seguintes = new Map<string, string[]>();
    for (const l of LIGACOES_CAMINHO) seguintes.set(l.de, [...(seguintes.get(l.de) ?? []), l.para]);
    const alcancadas = new Set<string>();
    const fila = ["meta", ...ETAPAS_CAMINHO.filter((e) => e.tipo === "rotina").map((e) => e.id)];
    while (fila.length) {
      const id = fila.shift()!;
      if (alcancadas.has(id)) continue;
      alcancadas.add(id);
      fila.push(...(seguintes.get(id) ?? []));
    }
    expect(ETAPAS_CAMINHO.filter((e) => !alcancadas.has(e.id)).map((e) => e.id)).toEqual([]);
    for (const etapa of ETAPAS_CAMINHO) {
      const temSaida = (seguintes.get(etapa.id) ?? []).length > 0;
      expect(temSaida, etapa.id).toBe(etapa.tipo !== "saida");
    }
  });

  it("nenhuma caixa fica por cima de outra", () => {
    const { etapas } = calcularLayoutCaminho(ETAPAS_CAMINHO, LIGACOES_CAMINHO);
    for (let i = 0; i < etapas.length; i++)
      for (let j = i + 1; j < etapas.length; j++) {
        const a = etapas[i]!,
          b = etapas[j]!;
        const sobrepoe =
          a.x < b.x + LARGURA_ETAPA &&
          b.x < a.x + LARGURA_ETAPA &&
          a.y < b.y + ALTURA_ETAPA &&
          b.y < a.y + ALTURA_ETAPA;
        expect(sobrepoe, `${a.etapa.id} × ${b.etapa.id}`).toBe(false);
      }
  });
});

describe("tela cheia: arrumação que cabe na tela", () => {
  it("em 2 colunas nenhuma caixa se sobrepõe e as faixas de colunas diferentes viram marcadores", () => {
    const l = calcularLayoutCaminho(ETAPAS_CAMINHO, LIGACOES_CAMINHO, 2);
    for (let i = 0; i < l.etapas.length; i++)
      for (let j = i + 1; j < l.etapas.length; j++) {
        const a = l.etapas[i]!,
          b = l.etapas[j]!;
        expect(
          a.x < b.x + LARGURA_ETAPA &&
            b.x < a.x + LARGURA_ETAPA &&
            a.y < b.y + ALTURA_ETAPA &&
            b.y < a.y + ALTURA_ETAPA,
          `${a.etapa.id} × ${b.etapa.id}`,
        ).toBe(false);
      }
    expect(l.quebras.map((q) => q.id)).toEqual(["decide->lote"]);
    expect(l.linhas.length + l.quebras.length).toBe(LIGACOES_CAMINHO.length);
  });

  it("tela larga escolhe 2 colunas; tela em pé escolhe empilhado", () => {
    expect(
      melhorLayoutCaminho(ETAPAS_CAMINHO, LIGACOES_CAMINHO, { largura: 1920, altura: 1000 })
        .colunas,
    ).toBe(2);
    expect(
      melhorLayoutCaminho(ETAPAS_CAMINHO, LIGACOES_CAMINHO, { largura: 390, altura: 800 }).colunas,
    ).toBe(1);
  });

  it("em tela larga o desenho inteiro fica maior que empilhado", () => {
    const area = { largura: 1920, altura: 1000 };
    const lado = escalaParaCaber(calcularLayoutCaminho(ETAPAS_CAMINHO, LIGACOES_CAMINHO, 2), area);
    const pilha = escalaParaCaber(calcularLayoutCaminho(ETAPAS_CAMINHO, LIGACOES_CAMINHO, 1), area);
    expect(lado / pilha).toBeGreaterThan(1.4);
  });
});
