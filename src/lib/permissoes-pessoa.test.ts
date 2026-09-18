import { describe, expect, it } from "bun:test";
import { aplicarExcecoesDaPessoa, diffDaPessoa, type AcessoCalculado } from "./permissoes-pessoa";
import { moduloPermitido } from "./permissoes-rotas";

function doCargo(
  modulos: Array<[string, "read" | "write"]>,
  configurados: string[] = [],
): AcessoCalculado {
  return {
    allowed: new Set(modulos.map(([m]) => m)),
    nivel: new Map(modulos),
    configured: new Set(configurados),
  };
}

describe("exceção por pessoa sobrepõe o cargo", () => {
  it("sem exceção nenhuma, nada muda", () => {
    const base = doCargo([
      ["agenda", "write"],
      ["clientes", "read"],
    ]);
    aplicarExcecoesDaPessoa(base, []);
    expect([...base.allowed].sort()).toEqual(["agenda", "clientes"]);
    expect(base.nivel.get("agenda")).toBe("write");
    expect(base.configured.size).toBe(0);
  });

  it("abre um módulo que o cargo não dá", () => {
    const base = doCargo([["agenda", "write"]]);
    aplicarExcecoesDaPessoa(base, [{ modulo: "financeiro", acesso: "read" }]);
    expect(base.allowed.has("financeiro")).toBe(true);
    expect(base.nivel.get("financeiro")).toBe("read");
  });

  it("fecha um módulo que o cargo dá", () => {
    const base = doCargo([
      ["agenda", "write"],
      ["caixa", "write"],
    ]);
    aplicarExcecoesDaPessoa(base, [{ modulo: "caixa", acesso: "none" }]);
    expect(base.allowed.has("caixa")).toBe(false);
    expect(base.nivel.has("caixa")).toBe(false);
  });

  it("rebaixa de Edição para Leitura", () => {
    const base = doCargo([["financeiro", "write"]]);
    aplicarExcecoesDaPessoa(base, [{ modulo: "financeiro", acesso: "read" }]);
    expect(base.nivel.get("financeiro")).toBe("read");
    expect(base.allowed.has("financeiro")).toBe(true);
  });

  it("linha malformada não derruba o cálculo", () => {
    const base = doCargo([["agenda", "write"]]);
    aplicarExcecoesDaPessoa(base, [
      { modulo: null, acesso: "write" },
      { modulo: "agenda", acesso: null },
    ]);
    // modulo nulo é ignorado; acesso nulo vale como "sem acesso".
    expect(base.allowed.has("agenda")).toBe(false);
  });

  it("fechar um submódulo para a pessoa não fecha o módulo pai", () => {
    // O gestor tira "Escala e Horários" de uma recepcionista, mas ela
    // continua com a Agenda. O submódulo entra em `configured`, então a
    // herança do pai deixa de valer só para ele.
    const base = doCargo([["agenda", "write"]]);
    aplicarExcecoesDaPessoa(base, [{ modulo: "agenda-escala", acesso: "none" }]);
    expect(moduloPermitido("agenda", base.allowed, base.configured)).toBe(true);
    expect(moduloPermitido("agenda-escala", base.allowed, base.configured)).toBe(false);
  });

  it("submódulo sem exceção continua herdando o pai", () => {
    const base = doCargo([["agenda", "write"]]);
    aplicarExcecoesDaPessoa(base, []);
    expect(moduloPermitido("agenda-escala", base.allowed, base.configured)).toBe(true);
  });
});

describe("o que a tela grava e apaga", () => {
  const MODULOS = ["agenda", "caixa", "financeiro"];
  const CARGO = { agenda: "write", caixa: "write", financeiro: "none" } as const;

  it("grava só o que ficou diferente do cargo", () => {
    const { gravar, apagar } = diffDaPessoa(
      MODULOS,
      CARGO,
      { agenda: "write", caixa: "none", financeiro: "read" },
      [],
    );
    expect(gravar).toEqual([
      { modulo: "caixa", acesso: "none" },
      { modulo: "financeiro", acesso: "read" },
    ]);
    expect(apagar).toEqual([]);
  });

  it("voltar ao padrão do cargo APAGA a linha, não grava valor igual", () => {
    const { gravar, apagar } = diffDaPessoa(MODULOS, CARGO, { ...CARGO }, ["caixa", "financeiro"]);
    expect(gravar).toEqual([]);
    expect(apagar.sort()).toEqual(["caixa", "financeiro"]);
  });

  it("mantém a exceção que continua diferente e apaga só a que voltou", () => {
    const { gravar, apagar } = diffDaPessoa(
      MODULOS,
      CARGO,
      { agenda: "write", caixa: "read", financeiro: "none" },
      ["caixa", "financeiro"],
    );
    expect(gravar).toEqual([{ modulo: "caixa", acesso: "read" }]);
    expect(apagar).toEqual(["financeiro"]);
  });
});
