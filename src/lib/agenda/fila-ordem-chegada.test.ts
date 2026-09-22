import { describe, expect, it } from "bun:test";
import { posicoesDaFila } from "./fila-ordem-chegada";

const DIA = "2026-09-22";
const hhmmss = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

const limite = new Date(`${DIA}T23:59:59`).getTime();

describe("posicoesDaFila", () => {
  it("dia vazio: 150 fichas de 5 min numa grade 07:00–23:59 usam o passo normal", () => {
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
    expect(hhmmss(r.fichas[1].inicio)).toBe("07:05:00");
    expect(hhmmss(r.fichas[2].inicio)).toBe("07:10:00");
    for (const f of r.fichas) {
      expect(f.inicio.getMilliseconds()).toBe(0);
      expect(f.fim.getMilliseconds()).toBe(0);
      expect(f.fim.getTime()).toBeLessThanOrEqual(limite);
      expect(f.fim.getTime()).toBeGreaterThan(f.inicio.getTime());
    }
  });

  it("cliques seguidos de 1 ficha não dividem o dia pela metade", () => {
    let ultimo = new Date(`${DIA}T23:51:00`);
    const obtidos: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = posicoesDaFila({
        diaIso: DIA,
        ultimoInicio: ultimo,
        inicioGrade: "07:00",
        fimTurno: "23:59",
        quantidade: 1,
        intervaloMin: 5,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const f = r.fichas[0];
      expect(f.inicio.getMilliseconds()).toBe(0);
      expect(f.fim.getMilliseconds()).toBe(0);
      expect(f.inicio.getTime()).toBeGreaterThan(ultimo.getTime());
      ultimo = f.inicio;
      obtidos.push(hhmmss(f.inicio));
    }
    expect(obtidos.slice(0, 5)).toEqual([
      "23:56:00",
      "23:57:00",
      "23:58:00",
      "23:58:01",
      "23:58:02",
    ]);
    expect(obtidos[19]).toBe("23:58:17");
  });

  it("um passo só para o lote: 121 fichas a partir de 23:54 vão de 1 em 1 segundo", () => {
    const r = posicoesDaFila({
      diaIso: DIA,
      ultimoInicio: new Date(`${DIA}T23:54:00`),
      inicioGrade: "07:00",
      fimTurno: "23:59",
      quantidade: 121,
      intervaloMin: 5,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(hhmmss(r.fichas[0].inicio)).toBe("23:54:01");
    expect(hhmmss(r.fichas[1].inicio)).toBe("23:54:02");
    expect(hhmmss(r.fichas[120].inicio)).toBe("23:56:01");
  });

  it("estouro a partir de 23:54: erro com o máximo que cabe de 1 em 1 segundo", () => {
    const r = posicoesDaFila({
      diaIso: DIA,
      ultimoInicio: new Date(`${DIA}T23:54:00`),
      inicioGrade: "07:00",
      fimTurno: "23:59",
      quantidade: 400,
      intervaloMin: 5,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toBe("Não cabem 400 fichas nesta data. O máximo que ainda cabe é 358.");
  });

  it("último início 23:59:58: não cabe mais nada", () => {
    const r = posicoesDaFila({
      diaIso: DIA,
      ultimoInicio: new Date(`${DIA}T23:59:58`),
      inicioGrade: "07:00",
      fimTurno: "23:59",
      quantidade: 1,
      intervaloMin: 5,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toBe("Não cabem 1 fichas nesta data. O máximo que ainda cabe é 0.");
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
