import { expect, it } from "bun:test";
import { prepararBuscaCatalogo } from "../catalogo-busca";
it("ecocardiograma transtorácico acha o eco do cadastro; transesofágico não", () => {
  const nomes = [
    "ECOCARDIOGRAMA (ADULTO)",
    "ECOCARDIOGRAMA TRANSESOFAGICO",
    "ECO CAROTIDAS E VERTEBRAIS",
  ];
  const b = prepararBuscaCatalogo("Ecocardiograma transtorácico", nomes);
  expect(b.pontuar(nomes[0], "")).toBeGreaterThan(0);
  const t = prepararBuscaCatalogo("ecocardiograma transesofagico", ["ECOCARDIOGRAMA (ADULTO)"]);
  expect(t.pontuar("ECOCARDIOGRAMA (ADULTO)", "")).toBe(0);
});
