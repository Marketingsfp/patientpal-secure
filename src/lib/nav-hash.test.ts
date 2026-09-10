import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { chaveDoNavLeaf, hrefDoNavLeaf, navLeafAtivo } from "./nav-hash";

const NINA = [
  { to: "/app/nina", hash: "atend-inbox", label: "Conversas WhatsApp" },
  { to: "/app/nina", hash: "atend-macros", label: "/ Mensagens prontas" },
  { to: "/app/nina", hash: "base-conhecimento", label: "Base de conhecimentos" },
  { to: "/app/nina", hash: "homologacao", label: "Homologação (envio de testes)" },
  { to: "/app/nina-aprendizado", label: "Revisão de Aprendizados" },
  { to: "/app/nina-metricas", label: "Métricas de Aprendizado" },
  { to: "/app/nina-arquitetura", label: "Arquitetura" },
  { to: "/app/nina", hash: "config", label: "Configuração" },
  { to: "/app/nina", hash: "templates", label: "Templates aprovados (Meta)" },
];

describe("destino dos itens do menu", () => {
  it("item sem hash continua indo só para a rota", () => {
    expect(hrefDoNavLeaf({ to: "/app/nina-aprendizado" })).toBe("/app/nina-aprendizado");
    expect(hrefDoNavLeaf({ to: "/app/nina-metricas" })).toBe("/app/nina-metricas");
    expect(hrefDoNavLeaf({ to: "/app/nina-arquitetura" })).toBe("/app/nina-arquitetura");
  });

  it("item com hash monta rota#hash", () => {
    const destinos = Object.fromEntries(NINA.map((i) => [i.label, hrefDoNavLeaf(i)]));
    expect(destinos["Conversas WhatsApp"]).toBe("/app/nina#atend-inbox");
    expect(destinos["/ Mensagens prontas"]).toBe("/app/nina#atend-macros");
    expect(destinos["Base de conhecimentos"]).toBe("/app/nina#base-conhecimento");
    expect(destinos["Homologação (envio de testes)"]).toBe("/app/nina#homologacao");
    expect(destinos["Configuração"]).toBe("/app/nina#config");
    expect(destinos["Templates aprovados (Meta)"]).toBe("/app/nina#templates");
  });

  it("não existem chaves duplicadas entre itens de /app/nina", () => {
    const chaves = NINA.map(chaveDoNavLeaf);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe("estado ativo", () => {
  it("só o item do hash atual fica ativo", () => {
    const ativos = NINA.filter(
      (i) => navLeafAtivo(i.to === "/app/nina", "#homologacao", i.hash) && i.to === "/app/nina",
    ).map((i) => i.label);
    expect(ativos).toEqual(["Homologação (envio de testes)"]);
  });

  it("item sem hash depende só da rota", () => {
    expect(navLeafAtivo(true, "#qualquer")).toBe(true);
    expect(navLeafAtivo(false, "#qualquer")).toBe(false);
  });
});

describe("menu lateral usa a construção genérica", () => {
  const SHELL = readFileSync("src/components/app-shell.tsx", "utf8");

  it("itens simples usam href com hash e chave estável", () => {
    expect(SHELL).toContain("const href = hrefDoNavLeaf(item);");
    expect(SHELL).toContain("key={navItemKey(item)}");
    expect(SHELL).not.toContain("const href = item.to;");
  });

  it("estado ativo dos itens simples considera o hash", () => {
    expect(SHELL).toContain("leafIsActive(item.to, item.hash)");
    expect(SHELL).toContain("leafIsActive(it.to, it.hash)");
  });
});
