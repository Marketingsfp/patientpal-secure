import { expect, it } from "bun:test";
import { deveEnviarPorTecla } from "../teclado-envio";
const enter = { key: "Enter", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false };
it("mantém Enter no padrão e exige Ctrl/Cmd quando solicitado", () => {
  expect(deveEnviarPorTecla(enter, true)).toBe(true);
  expect(deveEnviarPorTecla(enter, false)).toBe(false);
  expect(deveEnviarPorTecla({ ...enter, ctrlKey: true }, false)).toBe(true);
  expect(deveEnviarPorTecla({ ...enter, metaKey: true }, false)).toBe(true);
});
it("preserva quebra de linha, composição de texto e atalhos consumidos", () => {
  for (const patch of [
    { shiftKey: true },
    { altKey: true },
    { isComposing: true },
    { defaultPrevented: true },
    { key: "Tab" },
  ]) {
    expect(deveEnviarPorTecla({ ...enter, ...patch }, true)).toBe(false);
  }
});
