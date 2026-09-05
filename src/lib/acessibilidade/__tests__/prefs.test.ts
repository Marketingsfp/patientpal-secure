import { describe, expect, it, beforeEach } from "vitest";
import {
  A11Y_DEFAULTS,
  aplicarPrefs,
  classesDe,
  lerLocal,
  normalizarPrefs,
  salvarLocal,
} from "../prefs";

describe("preferências de acessibilidade", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.fontSize = "";
    localStorage.clear();
  });

  it("normaliza valores inválidos para o padrão", () => {
    const p = normalizarPrefs({ fontScale: 3, densidade: "x", visaoCores: "z" });
    expect(p).toEqual(A11Y_DEFAULTS);
  });

  it("aplica fonte e classes no html", () => {
    aplicarPrefs({ ...A11Y_DEFAULTS, fontScale: 1.35, altoContraste: true, modoEscuro: true });
    const html = document.documentElement;
    expect(html.style.fontSize).toBe("21.6px");
    expect(html.classList.contains("a11y-alto-contraste")).toBe(true);
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("remove classes antigas ao trocar de preferência", () => {
    aplicarPrefs({ ...A11Y_DEFAULTS, modoFoco: true, reduzirAnimacoes: true });
    aplicarPrefs(A11Y_DEFAULTS);
    expect(document.documentElement.classList.contains("a11y-modo-foco")).toBe(false);
    expect(document.documentElement.classList.contains("a11y-reduzir-animacao")).toBe(false);
  });

  it("reduzir animações entra nas classes do html", () => {
    expect(classesDe({ ...A11Y_DEFAULTS, reduzirAnimacoes: true })).toContain(
      "a11y-reduzir-animacao",
    );
  });

  it("persiste e relê do armazenamento local", () => {
    const p = { ...A11Y_DEFAULTS, densidade: "grande" as const, fontScale: 1.15 as const };
    salvarLocal(p);
    expect(lerLocal()).toEqual(p);
  });
});
