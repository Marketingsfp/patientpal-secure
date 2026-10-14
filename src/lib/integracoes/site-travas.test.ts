import { describe, expect, test } from "bun:test";
import {
  antesDoPiso,
  casarFaixa,
  eDoSite,
  empurrarParaPiso,
  limitesDiaSP,
  localSP,
} from "./site-travas";

const terca = {
  id: "f1",
  dia_semana: 2,
  hora_inicio: "08:00:00",
  hora_fim: "12:00:00",
  vigencia_inicio: null,
  vigencia_fim: null,
};

describe("site — travas de agenda", () => {
  test("dia da semana usa 0=domingo e hora de São Paulo", () => {
    // 2026-10-13 é terça; 11:00Z = 08:00 em São Paulo.
    expect(localSP("2026-10-13T11:00:00Z")).toEqual({ data: "2026-10-13", dow: 2, hora: "08:00:00" });
    // 02:00Z de quarta ainda é terça 23:00 em São Paulo.
    expect(localSP("2026-10-14T02:00:00Z").dow).toBe(2);
  });
  test("ficha casa com a faixa só dentro de [início, fim)", () => {
    expect(casarFaixa([terca], "2026-10-13T11:00:00Z")?.id).toBe("f1");
    expect(casarFaixa([terca], "2026-10-13T15:00:00Z")).toBeNull(); // 12:00 local
    expect(casarFaixa([terca], "2026-10-14T11:00:00Z")).toBeNull(); // quarta
  });
  test("vigência fora do período não casa", () => {
    expect(casarFaixa([{ ...terca, vigencia_fim: "2026-10-12" }], "2026-10-13T11:00:00Z")).toBeNull();
  });
  test("dia local vai de 03:00Z a 03:00Z do dia seguinte", () => {
    expect(limitesDiaSP("2026-10-14T02:00:00Z")).toEqual({
      de: "2026-10-13T03:00:00.000Z",
      ate: "2026-10-14T03:00:00.000Z",
    });
  });
  test("antecedência zero desliga a regra; 48h recusa antes do piso", () => {
    const agora = Date.parse("2026-10-14T12:00:00Z");
    expect(antesDoPiso("2026-10-14T13:00:00Z", 0, agora)).toBe(false);
    expect(antesDoPiso("2026-10-16T11:59:00Z", 48, agora)).toBe(true);
    expect(antesDoPiso("2026-10-16T12:00:00Z", 48, agora)).toBe(false);
  });
  test("preferência antes do piso é empurrada para o próximo horário de 30 min", () => {
    const agora = Date.parse("2026-10-14T12:10:00Z");
    expect(empurrarParaPiso("2026-10-14T13:00:00Z", 48, agora)).toBe("2026-10-16T12:30:00.000Z");
    expect(empurrarParaPiso("2026-10-20T13:00:00Z", 48, agora)).toBe("2026-10-20T13:00:00Z");
  });
  test("origens do site: site_publico e site-*; Nina, policardmed e homologação não", () => {
    expect(eDoSite("site_publico")).toBe(true);
    expect(eDoSite("site-menino-jesus")).toBe(true);
    expect(eDoSite("nina_whatsapp")).toBe(false);
    expect(eDoSite("policardmed")).toBe(false);
    expect(eDoSite("homologacao")).toBe(false);
    expect(eDoSite(null)).toBe(false);
  });
});
