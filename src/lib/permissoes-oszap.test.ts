import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  TELAS_OSZAP,
  GRUPOS_PERMISSOES_OSZAP,
  herdarAcessosOsZap,
  moduloTelaOsZap,
  padraoOsZapDaPessoa,
} from "./permissoes-oszap";
import { moduloDaTela, moduloPermitido, nivelDoModulo } from "./permissoes-rotas";
import { aplicarExcecoesDaPessoa, diffDaPessoa } from "./permissoes-pessoa";
import { PRESETS, TODOS_MODULOS } from "./permissoes-presets";

describe("cada opção do OS ZAP tem seu próprio controle", () => {
  it("cobre exatamente as opções reais do menu, com e sem hash", () => {
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    const trecho = shell.slice(
      shell.indexOf('label: "Atendimento",'),
      shell.indexOf("export function AppShell()"),
    );
    const opcoes = [...trecho.matchAll(/to:\s*"([^"]+)"(?:,\s*hash:\s*"([^"]+)")?/g)]
      .map((m) => ({ to: m[1]!, hash: m[2] ?? "" }))
      .filter(
        (m) =>
          m.to.startsWith("/app/nina") ||
          m.to.startsWith("/app/francisco") ||
          m.to === "/app/painel-tv-atendimento",
      );
    expect(opcoes).toHaveLength(24);
    expect(new Set(opcoes.map((t) => moduloTelaOsZap(t.to, t.hash))).size).toBe(24);
    expect(opcoes.map((t) => moduloTelaOsZap(t.to, t.hash)).sort()).toEqual(
      TELAS_OSZAP.map((t) => t.key).sort(),
    );
    expect(shell).toContain("moduloDaTela(location.pathname, location.hash)");
    expect(shell).toContain("leafAllowed(item.to, allowedModules, configuredModules, item.hash)");
  });
  it("todas estão na matriz e no preset administrativo, sem duplicatas", () => {
    const chaves = GRUPOS_PERMISSOES_OSZAP.flatMap((g) => g.modulos.map((m) => m.key));
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const tela of TELAS_OSZAP) {
      expect(chaves).toContain(tela.key);
      expect(TODOS_MODULOS).toContain(tela.key);
      expect(PRESETS.admin[tela.key]).toBe("write");
    }
  });
  for (const tela of TELAS_OSZAP) {
    it(`${tela.nome}: bloqueio próprio prevalece sobre o pai e não bloqueia vizinhos`, () => {
      const permitido = new Set([tela.pai]);
      const configurado = new Set([tela.key]);
      expect(moduloDaTela(tela.to, tela.hash)).toBe(tela.key);
      expect(moduloPermitido(moduloDaTela(tela.to, tela.hash), permitido, configurado)).toBe(false);
      expect(nivelDoModulo(tela.key, permitido, new Map([[tela.pai, "write"]]), configurado)).toBe(
        "none",
      );
      const outra = TELAS_OSZAP.find((t) => t.pai === tela.pai && t.key !== tela.key)!;
      expect(moduloPermitido(outra.key, permitido, configurado)).toBe(true);
    });
    it(`${tela.nome}: leitura própria não herda edição; liberação isolada funciona`, () => {
      expect(
        nivelDoModulo(
          tela.key,
          new Set([tela.pai, tela.key]),
          new Map([
            [tela.pai, "write"],
            [tela.key, "read"],
          ]),
          new Set([tela.key]),
        ),
      ).toBe("read");
      expect(moduloPermitido(tela.key, new Set([tela.key]), new Set([tela.key]))).toBe(true);
      expect(moduloPermitido(tela.pai, new Set([tela.key]), new Set([tela.key]))).toBe(false);
    });
  }
  it("links antigos e fragmentos inválidos exigem a permissão da aba efetivamente aberta", () => {
    for (const hash of ["", "chat", "#chat", "inexistente"])
      expect(moduloDaTela("/app/nina", hash)).toBe("oszap-conversas");
    expect(moduloDaTela("/app/nina/123")).toBe("oszap-conversas");
    expect(moduloDaTela("/app/nina/123", "voz-nina")).toBe("oszap-conversas");
    expect(moduloDaTela("/app/configuracoes/respostas-rapidas")).toBe("oszap-mensagens-prontas");
    expect(moduloDaTela("/app/francisco", "inexistente")).toBe("francisco-visao-geral");
    expect(moduloDaTela("/app/nina-arquitetura", "execucao")).toBe("nina-arquitetura");
  });
  it("a matriz herda o pai salvo, preservando bloqueios explícitos e do preset", () => {
    const valores = {
      nina: "read",
      "nina-homologacao": "none",
      "nina-arquitetura": "none",
    } as Record<string, "none" | "read" | "write">;
    herdarAcessosOsZap(valores, new Set(["nina-homologacao"]), PRESETS.supervisor);
    expect(valores["nina-voz"]).toBe("read");
    expect(valores["nina-homologacao"]).toBe("none");
    expect(valores["nina-arquitetura"]).toBe("none");
  });
  it("exceções da pessoa retiram só a opção indicada e podem liberar só uma opção", () => {
    const base = {
      allowed: new Set(["nina"]),
      nivel: new Map<string, "read" | "write">([["nina", "write"]]),
      configured: new Set<string>(),
    };
    aplicarExcecoesDaPessoa(base, [
      { modulo: "nina-voz", acesso: "none" },
      { modulo: "francisco-homologacao", acesso: "read" },
    ]);
    expect(nivelDoModulo("nina-voz", base.allowed, base.nivel, base.configured)).toBe("none");
    expect(nivelDoModulo("nina-base-conhecimento", base.allowed, base.nivel, base.configured)).toBe(
      "write",
    );
    expect(nivelDoModulo("francisco-homologacao", base.allowed, base.nivel, base.configured)).toBe(
      "read",
    );
    expect(nivelDoModulo("francisco-mensagens", base.allowed, base.nivel, base.configured)).toBe(
      "none",
    );
  });
  it("retornar uma opção ao cargo remove a exceção sem congelar seu acesso", () => {
    expect(
      diffDaPessoa(["nina-voz"], { "nina-voz": "read" }, { "nina-voz": "read" }, ["nina-voz"]),
    ).toEqual({ gravar: [], apagar: ["nina-voz"] });
  });
  it("uma exceção no pai é herdada sem gravar 16 exceções nos filhos", () => {
    const cargo = { nina: "none" } as Record<string, "none" | "read" | "write">;
    herdarAcessosOsZap(cargo, new Set(), {});
    const excecoes = { nina: "write" } as Record<string, "none" | "read" | "write">;
    const padrao = padraoOsZapDaPessoa(cargo, new Set(), {}, excecoes);
    expect(padrao["nina-voz"]).toBe("write");
    expect(diffDaPessoa(Object.keys(padrao), padrao, { ...padrao, ...excecoes }, [])).toEqual({
      gravar: [{ modulo: "nina", acesso: "write" }],
      apagar: [],
    });
    const bloqueioVoz = { ...padrao, ...excecoes, "nina-voz": "none" as const };
    expect(diffDaPessoa(Object.keys(padrao), padrao, bloqueioVoz, []).gravar).toContainEqual({
      modulo: "nina-voz",
      acesso: "none",
    });
    expect(padraoOsZapDaPessoa(cargo, new Set(["nina-voz"]), {}, excecoes)["nina-voz"]).toBe(
      "none",
    );
  });
});
