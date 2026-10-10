import { describe, expect, it } from "bun:test";
import { podeAbrirTelaOsZap } from "../acesso-telas-oszap";

describe("Telefonia — menu e links diretos do OS ZAP", () => {
  it("departamentos somente para Admin/Supervisor, com publicação global habilitada", () => {
    for (const perfil of ["admin", "supervisor"]) {
      expect(podeAbrirTelaOsZap(perfil, "/app/nina/", "#atend-departamentos", true)).toBe(true);
      expect(podeAbrirTelaOsZap(perfil, "/app/nina", "atend-departamentos", false)).toBe(false);
    }
    for (const perfil of ["telefonia", "gestor", "recepcao", "medico", undefined]) {
      expect(podeAbrirTelaOsZap(perfil, "/app/nina", "atend-departamentos", true)).toBe(false);
    }
  });
  it("bloqueia todas as abas da imagem e o link antigo da base", () => {
    for (const hash of [
      "dashboard-oszap",
      "informacoes-clinica",
      "base-conhecimento",
      "homologacao",
      "laboratorio-nina",
      "config",
      "templates",
    ]) {
      expect(podeAbrirTelaOsZap("telefonia", "/app/nina", hash)).toBe(false);
      expect(podeAbrirTelaOsZap("telefonia", "/app/nina/", `#${hash}`)).toBe(false);
    }
  });
  it("bloqueia revisão, métricas, arquitetura e subrotas", () => {
    for (const rota of [
      "/app/nina-aprendizado",
      "/app/nina-metricas",
      "/app/nina-arquitetura",
      "/app/nina-jev",
    ]) {
      expect(podeAbrirTelaOsZap("telefonia", rota)).toBe(false);
      expect(podeAbrirTelaOsZap("telefonia", `${rota}/`)).toBe(false);
      expect(podeAbrirTelaOsZap("telefonia", `${rota}/historico`)).toBe(false);
    }
  });
  it("preserva o atendimento, mensagens prontas, central e demais módulos", () => {
    for (const hash of ["", "chat", "atend-inbox", "atend-macros", "pesquisa-conversas"]) {
      expect(podeAbrirTelaOsZap("telefonia", "/app/nina", hash)).toBe(true);
    }
    expect(podeAbrirTelaOsZap("telefonia", "/app/agenda")).toBe(true);
  });
  it("não concede nem retira permissões de outros perfis", () => {
    for (const perfil of ["admin", "gestor", "recepcao"]) {
      expect(podeAbrirTelaOsZap(perfil, "/app/nina", "homologacao")).toBe(true);
      expect(podeAbrirTelaOsZap(perfil, "/app/nina-arquitetura")).toBe(true);
    }
  });
});
