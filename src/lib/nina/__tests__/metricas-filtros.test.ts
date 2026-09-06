import { describe, expect, it } from "bun:test";
import {
  baldeLocal,
  dentroDoRecorte,
  descricaoRecorte,
  resolverRecorte,
  validarRecorte,
} from "@/lib/nina/metricas-filtros";

const base = { de: "2026-09-10", ate: "2026-09-12", diaInteiro: false, horaInicio: "07:00", horaFim: "12:00" };

describe("validação do recorte", () => {
  it("recusa data inicial posterior à final", () => {
    expect(validarRecorte({ ...base, de: "2026-09-13" })).toMatch(/data inicial/i);
  });

  it("exige os dois horários quando não é dia inteiro", () => {
    expect(validarRecorte({ ...base, horaFim: null })).toMatch(/horário/i);
  });

  it("recusa faixa invertida sem interpretar madrugada", () => {
    const erro = validarRecorte({ ...base, horaInicio: "22:00", horaFim: "05:00" });
    expect(erro).toMatch(/posterior ao inicial/i);
  });

  it("aceita dia inteiro sem horários", () => {
    expect(validarRecorte({ de: "2026-09-10", ate: "2026-09-10", diaInteiro: true })).toBeNull();
  });
});

describe("janelas por dia", () => {
  it("cria uma janela por dia, sem tardes intermediárias", () => {
    const r = resolverRecorte(base);
    expect(r.janelas).toHaveLength(3);
    // 07:00 em São Paulo (UTC-3) = 10:00 UTC.
    expect(r.janelas[0].inicio).toBe("2026-09-10T10:00:00.000Z");
    expect(r.janelas[0].fim).toBe("2026-09-10T15:00:00.000Z");
    expect(r.janelas[2].inicio).toBe("2026-09-12T10:00:00.000Z");

    // Tarde do dia 10 está dentro do intervalo geral, mas fora do recorte.
    expect(dentroDoRecorte("2026-09-10T18:00:00.000Z", r)).toBe(false);
    expect(dentroDoRecorte("2026-09-11T11:30:00.000Z", r)).toBe(true);
  });

  it("início inclusivo e fim exclusivo", () => {
    const r = resolverRecorte({ ...base, ate: "2026-09-10" });
    expect(dentroDoRecorte("2026-09-10T10:00:00.000Z", r)).toBe(true);
    expect(dentroDoRecorte("2026-09-10T15:00:00.000Z", r)).toBe(false);
    expect(dentroDoRecorte("2026-09-10T14:59:59.999Z", r)).toBe(true);
  });

  it("dia inteiro cobre até o último milissegundo da noite", () => {
    const r = resolverRecorte({ de: "2026-09-10", ate: "2026-09-10", diaInteiro: true });
    expect(r.inicio).toBe("2026-09-10T03:00:00.000Z");
    expect(r.fim).toBe("2026-09-11T03:00:00.000Z");
    expect(dentroDoRecorte("2026-09-11T02:59:59.999Z", r)).toBe(true);
    expect(dentroDoRecorte("2026-09-11T03:00:00.000Z", r)).toBe(false);
  });

  it("agrupa por dia no fuso da clínica, não em UTC", () => {
    // 02:00 UTC do dia 11 é ainda 23:00 do dia 10 em São Paulo.
    expect(baldeLocal("2026-09-11T02:00:00.000Z", "dia")).toBe("2026-09-10");
    expect(baldeLocal("2026-09-11T02:00:00.000Z", "mes")).toBe("2026-09");
  });

  it("descreve o recorte para a ajuda da tela", () => {
    expect(descricaoRecorte(resolverRecorte(base))).toContain("das 07:00 às 12:00");
  });
});
