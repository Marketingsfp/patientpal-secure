import { describe, expect, it } from "bun:test";
import { formatarDataHoraMensagem } from "../data-hora";

describe("formatarDataHoraMensagem", () => {
  it("formata no padrão brasileiro DD/MM/AAAA HH:mm", () => {
    expect(formatarDataHoraMensagem("2026-09-05T17:12:00.000Z")).toBe("05/09/2026 14:12");
  });

  it("usa o fuso America/Sao_Paulo (virada de dia em UTC)", () => {
    expect(formatarDataHoraMensagem("2026-09-06T02:30:00.000Z")).toBe("05/09/2026 23:30");
  });

  it("mantém a data real de mensagens antigas", () => {
    expect(formatarDataHoraMensagem("2024-01-02T12:00:00.000Z")).toBe("02/01/2024 09:00");
  });

  it("não usa formato americano", () => {
    expect(formatarDataHoraMensagem("2026-09-05T17:12:00.000Z")).not.toBe("09/05/2026 14:12");
  });

  it("não exibe segundos", () => {
    expect(formatarDataHoraMensagem("2026-09-05T17:12:45.000Z")).toBe("05/09/2026 14:12");
  });

  it("aceita Date e timestamp numérico", () => {
    const d = new Date("2026-09-05T17:12:00.000Z");
    expect(formatarDataHoraMensagem(d)).toBe("05/09/2026 14:12");
    expect(formatarDataHoraMensagem(d.getTime())).toBe("05/09/2026 14:12");
  });

  it("retorna vazio para valores ausentes ou inválidos", () => {
    expect(formatarDataHoraMensagem(null)).toBe("");
    expect(formatarDataHoraMensagem(undefined)).toBe("");
    expect(formatarDataHoraMensagem("")).toBe("");
    expect(formatarDataHoraMensagem("não-é-data")).toBe("");
  });
});
