import { describe, expect, it } from "bun:test";
import {
  ORIGEM_ERRO_RAPIDO,
  ehReporteRapido,
  mesclarReporte,
  rotuloConversaReporte,
} from "./erro-rapido";

describe("reporte rápido na Revisão de aprendizados", () => {
  it("identifica itens vindos do X vermelho", () => {
    expect(ehReporteRapido(ORIGEM_ERRO_RAPIDO)).toBe(true);
    expect(ehReporteRapido("manual")).toBe(false);
    expect(ehReporteRapido(null)).toBe(false);
  });

  it("mostra o código amigável junto do identificador do sistema", () => {
    expect(rotuloConversaReporte("abc-123", 1342)).toBe("#1342 · abc-123");
    expect(rotuloConversaReporte("abc-123", null)).toBe("abc-123");
    expect(rotuloConversaReporte(null)).toBe("—");
  });

  it("não duplica o item quando a resposta e o evento em tempo real chegam", () => {
    const inicial = [{ id: "a" }, { id: "b" }];
    const comNovo = mesclarReporte(inicial, { id: "c" });
    expect(comNovo.map((i) => i.id)).toEqual(["c", "a", "b"]);
    const repetido = mesclarReporte(comNovo, { id: "c" });
    expect(repetido.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
});
