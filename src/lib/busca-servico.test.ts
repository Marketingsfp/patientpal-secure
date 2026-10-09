import { describe, expect, it } from "bun:test";
import { termosDaBusca } from "./busca-servico";

/** Simula o `ilike` do banco: cada grupo precisa casar com alguma forma. */
const acha = (busca: string, nome: string) =>
  termosDaBusca(busca).every((g) => g.some((f) => nome.toUpperCase().includes(f)));

describe("busca de serviço por palavras", () => {
  it("Ressonância Magnética do Joelho acha RM DE JOELHO", () => {
    expect(acha("Ressonância Magnética do Joelho", "RM DE JOELHO (CADA LADO)")).toBe(true);
  });

  it("Doppler de Carótidas acha o cadastro sem a palavra 'de'", () => {
    expect(acha("Doppler de Carótidas", "USG DOPPLER CAROTIDAS E VERTEBRAIS")).toBe(true);
  });

  it("Ecocardiograma acha o ECOCARDIOGRAMA e não o ECO de carótidas", () => {
    expect(acha("Ecocardiograma", "ECOCARDIOGRAMA (ADULTO)")).toBe(true);
    expect(acha("Ecocardiograma", "ECO CAROTIDAS E VERTEBRAIS")).toBe(false);
  });

  it("ultrassom e raio-x por extenso acham as siglas", () => {
    expect(acha("ultrassom de mama", "USG MAMA")).toBe(true);
    expect(acha("raio-x torax", "RX TORAX AP/PERFIL")).toBe(true);
  });

  it("todas as palavras precisam aparecer", () => {
    expect(acha("RM joelho", "RX JOELHO AP / PERFIL")).toBe(false);
  });

  it("caracteres reservados do PostgREST não passam", () => {
    for (const g of termosDaBusca("joelho,(x)%"))
      for (const f of g) expect(f).not.toMatch(/[%,()]/);
  });
});
