import { describe, expect, it } from "bun:test";
import {
  HISTORICO_ARQUITETURA,
  comparacaoRecente,
  compararVersoes,
  conexoesDe,
  destaquesDaComparacao,
  diffConexoes,
  precisaNovaVersao,
  versaoAnterior,
  versaoAtual,
  type VersaoArquitetura,
} from "../versoes";
import { MANIFESTO_ARQUITETURA } from "../manifesto";
import { assinaturaAtual, type AssinaturaNode } from "../sync";

const node = (id: string, seguintes: string[] = []): AssinaturaNode => ({
  id,
  categoria: "TOOLS",
  arquivo: "src/x.ts",
  funcao: "f",
  anteriores: [],
  seguintes,
});

const versao = (n: number, snapshot: AssinaturaNode[]): VersaoArquitetura => ({
  versao: n,
  data: "2026-01-01",
  deploy: null,
  commit: null,
  versaoPrompt: null,
  modelo: null,
  quantidadeNodes: snapshot.length,
  quantidadeTools: snapshot.length,
  alteracoes: [],
  snapshot,
});

describe("histórico de versões", () => {
  it("registra ao menos duas versões, a última igual ao manifesto atual", () => {
    expect(HISTORICO_ARQUITETURA.length).toBeGreaterThanOrEqual(2);
    expect(versaoAtual().versao).toBe(MANIFESTO_ARQUITETURA.versao);
    expect(versaoAtual().quantidadeNodes).toBe(assinaturaAtual().length);
    expect(versaoAnterior()?.versao).toBe(versaoAtual().versao - 1);
  });

  it("guarda metadados sem inventar valores", () => {
    for (const v of HISTORICO_ARQUITETURA) {
      expect(v.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.quantidadeTools).toBeLessThanOrEqual(v.quantidadeNodes);
      expect(v.deploy === null || typeof v.deploy === "string").toBe(true);
    }
  });
});

describe("diff de conexões", () => {
  it("lista conexões sem repetição", () => {
    expect(conexoesDe([node("a", ["b", "b"]), node("b")])).toEqual([{ de: "a", para: "b" }]);
  });

  it("detecta ligação nova e ligação removida", () => {
    const d = diffConexoes([node("ia", ["tool_antiga"])], [node("ia", ["tool_nova"])]);
    expect(d.adicionadas).toEqual([{ de: "ia", para: "tool_nova" }]);
    expect(d.removidas).toEqual([{ de: "ia", para: "tool_antiga" }]);
  });
});

describe("comparação entre versões", () => {
  it("classifica adicionado, alterado e removido", () => {
    const antes = [node("a", ["b"]), node("b"), node("velho")];
    const depois = [node("a", ["b", "novo"]), node("b"), node("novo")];
    const c = compararVersoes(versao(1, antes), versao(2, depois));
    expect(c.nodes.adicionados).toContain("novo");
    expect(c.nodes.removidos).toContain("velho");
    expect(c.nodes.alterados.map((m) => m.id)).toContain("a");
    expect(c.semMudanca).toBe(false);
  });

  it("informa arquitetura sincronizada quando nada muda", () => {
    const igual = [node("a", ["b"]), node("b")];
    const c = compararVersoes(versao(1, igual), versao(2, igual));
    expect(c.semMudanca).toBe(true);
    expect(c.resumo).toContain("Arquitetura sincronizada");
  });

  it("marca nodes para o modo Mostrar alterações, inclusive removidos", () => {
    const c = compararVersoes(versao(1, [node("velho")]), versao(2, [node("novo")]));
    const marcas = destaquesDaComparacao(c);
    expect(marcas["novo"]).toBe("adicionado");
    expect(marcas["velho"]).toBe("removido");
    expect(destaquesDaComparacao(null)).toEqual({});
  });

  it("comparação recente usa a versão anterior contra a atual", () => {
    const c = comparacaoRecente();
    expect(c?.de.versao).toBe(versaoAnterior()!.versao);
    expect(c?.para.versao).toBe(versaoAtual().versao);
  });
});

describe("mudança visual não gera versão", () => {
  it("assinatura estrutural igual à atual não pede versão nova", () => {
    expect(precisaNovaVersao(assinaturaAtual())).toBe(false);
  });

  it("mudança estrutural real pede versão nova", () => {
    const alterada = assinaturaAtual().slice(1);
    expect(precisaNovaVersao(alterada)).toBe(true);
  });
});
