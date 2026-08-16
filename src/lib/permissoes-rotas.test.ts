import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import {
  ADMIN_ONLY_ROUTES,
  moduloDaRota,
  rotaSomenteAdmin,
  ROUTE_TO_MODULE,
  SUBMODULE_PARENT,
} from "./permissoes-rotas";

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
    const semMapa = ROTAS.filter((r) => moduloDaRota(r) === undefined && !rotaSomenteAdmin(r));
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

// Segunda trava, do outro lado do mesmo problema: não basta a rota ter um
// módulo, esse módulo precisa existir na tela "Perfis de Acesso". Quando ele
// não existe lá, o gestor salva os perfis, o upsert grava linha só para os
// módulos que a tela conhece e o módulo órfão fica sem linha nenhuma — some
// do menu e responde "Sem permissão" para todo perfil não-admin, sem que o
// admin tenha onde liberar. Foi exatamente o que ocorreu com "hiperdia" e
// "consulta-ia".
const PERFIS_TSX = readFileSync("src/routes/_authenticated/app.perfis.tsx", "utf8");
const MODULOS_DA_TELA = new Set(
  [...PERFIS_TSX.matchAll(/key:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]!),
);

const MODULOS_DAS_ROTAS = [
  ...new Set(Object.values(ROUTE_TO_MODULE).filter((m): m is string => typeof m === "string")),
];

describe("tela Perfis de Acesso cobre os módulos usados nas rotas", () => {
  it("leu a lista de módulos da tela", () => {
    expect(MODULOS_DA_TELA.size).toBeGreaterThan(50);
  });

  it("todo módulo de rota aparece na tela de perfis", () => {
    const orfaos = MODULOS_DAS_ROTAS.filter((m) => !MODULOS_DA_TELA.has(m));
    expect(orfaos).toEqual([]);
  });

  it("submódulos declarados têm pai válido", () => {
    const paisInvalidos = Object.values(SUBMODULE_PARENT).filter((p) => !MODULOS_DA_TELA.has(p));
    expect(paisInvalidos).toEqual([]);
  });
});

// Terceira trava, do lado do menu lateral. O filtro do AppShell (`leafAllowed`)
// consulta ROUTE_TO_MODULE por chave EXATA — não por prefixo. Um item de menu
// sem entrada exata some para todo perfil não-admin (e um item cujo módulo não
// esteja na matriz nunca poderia ser liberado). Este teste garante que toda
// seção do menu (Operação, Inteligência, Marketing, Cadastros, RH, Gestão e
// Configurações) esteja coberta pela tela de Perfis de Acesso.
const SHELL_TSX = readFileSync("src/components/app-shell.tsx", "utf8");
const NAV_ROWS = SHELL_TSX.slice(
  SHELL_TSX.indexOf("const navRows"),
  SHELL_TSX.indexOf("export function AppShell()"),
);
const ROTAS_DO_MENU = [...new Set([...NAV_ROWS.matchAll(/to:\s*"([^"]+)"/g)].map((m) => m[1]!))];

describe("menu lateral está coberto pela matriz de permissões", () => {
  it("leu os itens do menu", () => {
    expect(ROTAS_DO_MENU.length).toBeGreaterThan(40);
  });

  it("todo item de menu tem entrada exata no mapa (ou é restrito a admin)", () => {
    const semEntrada = ROTAS_DO_MENU.filter(
      (to) => !(to in ROUTE_TO_MODULE) && !rotaSomenteAdmin(to),
    );
    expect(semEntrada).toEqual([]);
  });

  it("todo item de menu tem módulo configurável na tela de perfis", () => {
    const semControle = ROTAS_DO_MENU.filter((to) => {
      if (rotaSomenteAdmin(to)) return false; // trava mais forte que a matriz
      const mod = ROUTE_TO_MODULE[to];
      if (mod === null) return false; // rota de sistema
      return typeof mod !== "string" || !MODULOS_DA_TELA.has(mod);
    });
    expect(semControle).toEqual([]);
  });

  it("nenhuma tela de preview interna (/app/dev-*) fica livre", () => {
    const devLivres = Object.entries(ROUTE_TO_MODULE)
      .filter(([rota, mod]) => rota.startsWith("/app/dev-") && mod === null)
      .map(([rota]) => rota);
    expect(devLivres).toEqual([]);
    expect(ADMIN_ONLY_ROUTES.filter((r) => r.startsWith("/app/dev-")).length).toBeGreaterThan(0);
  });
});
