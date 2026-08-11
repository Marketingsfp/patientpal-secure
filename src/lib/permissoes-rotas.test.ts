import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { moduloDaRota, rotaSomenteAdmin } from "./permissoes-rotas";

// Trava de regressão da Guarda de Rotas: toda rota privada precisa ser
// reconhecida pelo mapa rota → módulo consumido pelo AppShell. Rota nova
// sem mapeamento cairia em `undefined` (bloqueada para todo mundo que não
// é admin), o que já é seguro, mas gera "Acesso negado" silencioso para
// perfis que deveriam ter acesso. Este teste força o cadastro consciente.

/** Converte `app.financeiro.estorno.tsx` → `/app/financeiro/estorno`. */
function arquivoParaRota(nome: string): string {
  const base = nome.replace(/\.tsx?$/, "");
  return (
    "/" +
    base
      .split(".")
      .filter((seg) => seg !== "index" && seg !== "route")
      .map((seg) => (seg.startsWith("$") ? "x" : seg.replace(/_$/, "")))
      .join("/")
  );
}

const ROTAS = readdirSync("src/routes/_authenticated")
  .filter((f) => f.endsWith(".tsx") && f.startsWith("app"))
  .map(arquivoParaRota);

describe("guarda de rotas privadas", () => {
  it("encontrou as rotas do app", () => {
    expect(ROTAS.length).toBeGreaterThan(50);
  });

  it("toda rota privada tem módulo mapeado (ou é livre/admin)", () => {
    const semMapa = ROTAS.filter(
      (r) => moduloDaRota(r) === undefined && !rotaSomenteAdmin(r),
    );
    expect(semMapa).toEqual([]);
  });

  it("rotas administrativas continuam restritas", () => {
    expect(rotaSomenteAdmin("/app/planos")).toBe(true);
    expect(rotaSomenteAdmin("/app/configuracoes/voz")).toBe(true);
    expect(rotaSomenteAdmin("/app/agenda")).toBe(false);
  });

  it("rota desconhecida é tratada como bloqueada", () => {
    expect(moduloDaRota("/app/rota-que-nao-existe")).toBeUndefined();
  });
});
