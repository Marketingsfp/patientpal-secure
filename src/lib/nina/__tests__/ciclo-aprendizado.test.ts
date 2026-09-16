import { describe, expect, it } from "bun:test";
import { INICIO_CICLO_APRENDIZADO, resolverRecorteNoCiclo } from "../ciclo-aprendizado";
import { dentroDoRecorte, resolverRecorte } from "../metricas-filtros";
import { resumirCobertura } from "../metricas-analise";

describe("reinício da revisão e das métricas", () => {
  it("exclui o passado mesmo quando o filtro inclui todo o mês", () => {
    const r = resolverRecorteNoCiclo({ de: "2026-09-01", ate: "2026-09-30", diaInteiro: true });
    expect(dentroDoRecorte("2026-09-16T21:29:48.999Z", r)).toBe(false);
    expect(dentroDoRecorte(INICIO_CICLO_APRENDIZADO, r)).toBe(true);
    expect(dentroDoRecorte("2026-09-17T14:00:00Z", r)).toBe(true);
    expect(r.janelas).toHaveLength(15);
    expect(r.janelas[0].inicio).toBe(INICIO_CICLO_APRENDIZADO);
  });

  it("período inteiramente antigo envia janelas vazias e intervalo vazio ao banco", () => {
    const r = resolverRecorteNoCiclo({ de: "2026-09-01", ate: "2026-09-15", diaInteiro: true });
    expect(r.janelas).toEqual([]);
    expect(r.inicio).toBe(r.fim);
    expect(dentroDoRecorte("2026-09-15T12:00:00Z", r)).toBe(false);
    expect(resumirCobertura(r, null).horas).toBe(0);
  });

  it("mantém a faixa diária e não inclui o intervalo entre dias", () => {
    const r = resolverRecorteNoCiclo({
      de: "2026-09-16",
      ate: "2026-09-17",
      diaInteiro: false,
      horaInicio: "18:00",
      horaFim: "19:00",
    });
    expect(dentroDoRecorte("2026-09-16T21:20:00Z", r)).toBe(false);
    expect(dentroDoRecorte("2026-09-16T21:30:00Z", r)).toBe(true);
    expect(dentroDoRecorte("2026-09-16T22:00:00Z", r)).toBe(false);
    expect(dentroDoRecorte("2026-09-17T21:10:00Z", r)).toBe(true);
    expect(resumirCobertura(r, null).horas).toBe(1.5);
    expect(resumirCobertura(r, [3]).horas).toBe(0.5);
  });

  it("uma faixa encerrada antes do reinício não é deslocada para outro horário", () => {
    const r = resolverRecorteNoCiclo({
      de: "2026-09-16",
      ate: "2026-09-16",
      diaInteiro: false,
      horaInicio: "07:00",
      horaFim: "12:00",
    });
    expect(r.janelas).toEqual([]);
  });

  it("o corte representa o mesmo instante para clínicas em outro fuso", () => {
    const r = resolverRecorteNoCiclo({
      de: "2026-09-16",
      ate: "2026-09-16",
      diaInteiro: true,
      fuso: "UTC",
    });
    expect(r.inicio).toBe(INICIO_CICLO_APRENDIZADO);
    expect(r.fim).toBe("2026-09-17T00:00:00.000Z");
  });

  it("novos períodos permanecem intactos e datas inválidas continuam recusadas", () => {
    const entrada = { de: "2026-09-17", ate: "2026-09-19", diaInteiro: true };
    expect(resolverRecorteNoCiclo(entrada)).toEqual(resolverRecorte(entrada));
    expect(() => resolverRecorteNoCiclo({ ...entrada, de: "2026-09-20" })).toThrow();
  });
});
