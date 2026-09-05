import { describe, expect, it, beforeEach } from "vitest";
import {
  A11Y_DEFAULTS,
  aplicarPrefs,
  classesDe,
  lerLocal,
  normalizarPrefs,
  salvarLocal,
} from "../prefs";

/** Documento mínimo: os testes rodam sem DOM completo. */
function docFake() {
  const classes = new Set<string>();
  const style: Record<string, string> = {};
  const html = {
    classList: {
      add: (...c: string[]) => c.forEach((x) => classes.add(x)),
      remove: (...c: string[]) => c.forEach((x) => classes.delete(x)),
      contains: (c: string) => classes.has(c),
    },
    style: {
      setProperty: (k: string, v: string) => {
        style[k] = v;
      },
      set fontSize(v: string) {
        style["font-size"] = v;
      },
      get fontSize() {
        return style["font-size"] ?? "";
      },
    },
  };
  return { documentElement: html, classes, style } as unknown as Document & {
    classes: Set<string>;
    style: Record<string, string>;
  };
}

function storageFake() {
  const dados = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
    clear: () => dados.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

describe("preferências de acessibilidade", () => {
  beforeEach(storageFake);

  it("normaliza valores inválidos para o padrão", () => {
    expect(normalizarPrefs({ fontScale: 3, densidade: "x", visaoCores: "z" })).toEqual(
      A11Y_DEFAULTS,
    );
  });

  it("aplica fonte e classes no html", () => {
    const doc = docFake();
    aplicarPrefs({ ...A11Y_DEFAULTS, fontScale: 1.35, altoContraste: true, modoEscuro: true }, doc);
    expect(doc.style["font-size"]).toBe("21.6px");
    expect(doc.classes.has("a11y-alto-contraste")).toBe(true);
    expect(doc.classes.has("dark")).toBe(true);
  });

  it("remove classes antigas ao trocar de preferência", () => {
    const doc = docFake();
    aplicarPrefs({ ...A11Y_DEFAULTS, modoFoco: true, reduzirAnimacoes: true }, doc);
    aplicarPrefs(A11Y_DEFAULTS, doc);
    expect(doc.classes.has("a11y-modo-foco")).toBe(false);
    expect(doc.classes.has("a11y-reduzir-animacao")).toBe(false);
  });

  it("reduzir animações entra nas classes do html", () => {
    expect(classesDe({ ...A11Y_DEFAULTS, reduzirAnimacoes: true })).toContain(
      "a11y-reduzir-animacao",
    );
  });

  it("densidade e daltonismo viram classes dedicadas", () => {
    const cls = classesDe({ ...A11Y_DEFAULTS, densidade: "grande", visaoCores: "deuteranopia" });
    expect(cls).toContain("a11y-dens-grande");
    expect(cls).toContain("a11y-cores-deuteranopia");
  });

  it("persiste e relê do armazenamento local", () => {
    const p = { ...A11Y_DEFAULTS, densidade: "grande" as const, fontScale: 1.15 as const };
    salvarLocal(p);
    expect(lerLocal()).toEqual(p);
  });
});
