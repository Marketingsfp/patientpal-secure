import { describe, expect, it } from "bun:test";
import { posicoesDaFila } from "./fila-ordem-chegada";

const DIA = "2026-09-22";
const hhmmss = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

const limite = new Date(`${DIA}T23:59:59`).getTime();

describe("posicoesDaFila", () => {
  it("dia vazio: 150 fichas de 5 min numa grade 07:00–23:59 cabem comprimidas", () => {
    const r = posicoesDaFila({
      diaIso: DIA,
      ultimoInicio: null,
      inicioGrade: "07:00",
      fimTurno: "23:59",
      quantidade: 150,
      intervaloMin: 5,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fichas.length).toBe(150);
    expect(hhmmss(r.fichas[0].inicio)).toBe("07:00:00");
    for (const f of r.fichas) {
      expect(f.fim.getTime()).toBeLessThanOrEqual(limite);
      expect(f.fim.getTime()).toBeGreaterThan(f.inicio.getTime());
    }
  });

  it("continuação após o último início 23:51: 20 fichas em segundos, terminando no dia", () => {
    const r = posicoesDaFila({
      diaIso: DIA,
      ultimoInicio: new Date(`${DIA}T23:51:00`),
      inicioGrade: "07:00",
      fimTurno: "19:00",
      quantidade: 20,
      intervaloMin: 5,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fichas.length).toBe(20);
    expect(r.fichas[0].inicio.getTime()).toBeGreaterThan(new Date(`${DIA}T23:51:00`).getTime());
    const ultima = r.fichas[19];
    expect(ultima.inicio.getTime()).toBeLessThanOrEqual(new Date(`${DIA}T23:59:58`).getTime());
    expect(ultima.fim.getTime()).toBeLessThanOrEqual(limite);
  });

  it("estouro: devolve erro dizendo o máximo que ainda cabe", () => {
    const r = posicoesDaFila({
      diaIso: DIA,
      ultimoInicio: new Date(`${DIA}T23:59:50`),
      inicioGrade: "07:00",
      fimTurno: "19:00",
      quantidade: 50,
      intervaloMin: 5,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain("Não cabem 50 fichas nesta data");
    expect(r.erro).toContain("O máximo que ainda cabe é 8.");
  });

  it("ordem estritamente crescente e sem sobreposição", () => {
    const r = posicoesDaFila({
      diaIso: DIA,
      ultimoInicio: new Date(`${DIA}T08:00:00`),
      inicioGrade: "07:00",
      fimTurno: "19:00",
      quantidade: 120,
      intervaloMin: 10,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (let i = 1; i < r.fichas.length; i++) {
      expect(r.fichas[i].inicio.getTime()).toBeGreaterThan(r.fichas[i - 1].inicio.getTime());
      expect(r.fichas[i].inicio.getTime()).toBeGreaterThanOrEqual(r.fichas[i - 1].fim.getTime());
    }
    // Todas dentro do turno quando o passo comprimido em minutos resolve.
    expect(r.fichas[119].inicio.getTime()).toBeLessThan(new Date(`${DIA}T19:00:00`).getTime());
  });

  it("dia vazio com 1 ficha nasce no início da grade", () => {
    const r = posicoesDaFila({
      diaIso: DIA,
      ultimoInicio: null,
      inicioGrade: "07:30",
      fimTurno: "12:00",
      quantidade: 1,
      intervaloMin: 15,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(hhmmss(r.fichas[0].inicio)).toBe("07:30:00");
    expect(hhmmss(r.fichas[0].fim)).toBe("07:45:00");
  });
});
