import { describe, expect, it } from "bun:test";
import { traduzirErro, traduzirHttpCru } from "@/lib/traduzir-erro";

const DEMAIS = "A operação enviou dados demais de uma vez. Selecione menos itens e tente de novo.";

describe("traduzirHttpCru", () => {
  it("Bad Request → dados demais", () => expect(traduzirHttpCru("Bad Request")).toBe(DEMAIS));
  it("HTTP 413 → dados demais", () => expect(traduzirHttpCru("HTTP 413")).toBe(DEMAIS));
  it("503 sozinho → indisponível", () =>
    expect(traduzirHttpCru("503")).toBe(
      "O servidor está indisponível no momento. Tente de novo em alguns instantes.",
    ));
  it("Nota 414 já emitida passa sem alteração", () => {
    expect(traduzirHttpCru("Nota 414 já emitida")).toBeNull();
    expect(traduzirErro("Nota 414 já emitida")).toBe("Nota 414 já emitida");
  });
  it("Too Many Requests → muitas operações", () =>
    expect(traduzirHttpCru("Too Many Requests")).toBe(
      "Muitas operações seguidas. Aguarde alguns segundos e tente de novo.",
    ));
  it("traduzirErro usa a tradução: a tela mostra a mensagem em português", () =>
    expect(traduzirErro("Bad Request")).toBe(DEMAIS));
});
