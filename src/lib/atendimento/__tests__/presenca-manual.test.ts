import { describe, expect, it } from "bun:test";
import {
  ehEstadoManual,
  precisaEscolherPresenca,
  tecnicoDoEstadoManual,
  versaoAceita,
} from "../presenca-manual";

describe("FASE 1 — escolha manual de presença", () => {
  it("aceita apenas Online, Offline e Em pausa", () => {
    expect(ehEstadoManual("ONLINE")).toBe(true);
    expect(ehEstadoManual("OFFLINE")).toBe(true);
    expect(ehEstadoManual("PAUSA")).toBe(true);
    expect(ehEstadoManual("AWAY")).toBe(false);
    expect(ehEstadoManual("BUSY")).toBe(false);
    expect(ehEstadoManual(null)).toBe(false);
  });

  it("traduz a escolha para o que a distribuição lê", () => {
    expect(tecnicoDoEstadoManual("ONLINE")).toEqual({ status: "ONLINE", aceitaNovas: true });
    expect(tecnicoDoEstadoManual("PAUSA")).toEqual({ status: "BUSY", aceitaNovas: false });
    expect(tecnicoDoEstadoManual("OFFLINE")).toEqual({ status: "OFFLINE", aceitaNovas: false });
  });

  it("registro antigo sem escolha comprovada exige escolha explícita", () => {
    expect(precisaEscolherPresenca(null)).toBe(true);
    expect(precisaEscolherPresenca("OFFLINE")).toBe(false);
    // Estado técnico legado nunca vira escolha manual.
    expect(precisaEscolherPresenca("AWAY")).toBe(true);
  });

  it("versão protege contra duas telas gravando ao mesmo tempo", () => {
    expect(versaoAceita(3, 3)).toBe(true);
    expect(versaoAceita(3, 2)).toBe(false);
    expect(versaoAceita(3, undefined)).toBe(true);
  });
});
