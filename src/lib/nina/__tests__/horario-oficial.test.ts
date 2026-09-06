import { describe, it, expect } from "bun:test";
import {
  horarioOficialDoDia,
  semanaOficial,
  abertoNoInstante,
  diaDaSemanaISO,
} from "../horario-oficial";
import type { CalendarioPublicado } from "../classificador-periodo";

const CLINICA = "11111111-1111-1111-1111-111111111111";

/** Calendário sintético — nunca publicado na Base oficial. */
function cal(over: Partial<CalendarioPublicado> = {}): CalendarioPublicado {
  return {
    versao_id: "v1",
    versao: 1,
    status: "publicado",
    publicado_em: "2026-01-01T00:00:00Z",
    vigencia_inicio: "2026-01-01",
    vigencia_fim: null,
    fuso: "America/Sao_Paulo",
    clinica_id: CLINICA,
    unidade_id: null,
    dias: [
      // segunda: manhã + tarde
      { dia_semana: 1, fechado: false, faixas: [{ hora_inicio: "08:00", hora_fim: "12:00" }, { hora_inicio: "13:00", hora_fim: "18:00" }] },
      { dia_semana: 0, fechado: true, faixas: [] },
    ],
    excecoes: [],
    ...over,
  } as CalendarioPublicado;
}

describe("horário oficial da Nina", () => {
  it("dia da semana ISO", () => {
    expect(diaDaSemanaISO("2026-03-02")).toBe(1);
    expect(diaDaSemanaISO("xx")).toBeNull();
  });

  it("devolve as duas faixas de um dia com manhã e tarde", () => {
    const r = horarioOficialDoDia({ data: "2026-03-02", escopo: { clinica_id: CLINICA }, calendarios: [cal()] });
    expect(r.encontrado).toBe(true);
    expect(r.fechado).toBe(false);
    expect(r.faixas).toEqual([
      { inicio: "08:00", fim: "12:00" },
      { inicio: "13:00", fim: "18:00" },
    ]);
    expect(r.versao).toBe(1);
  });

  it("dia fechado é diferente de dia não configurado", () => {
    const fechado = horarioOficialDoDia({ data: "2026-03-01", escopo: { clinica_id: CLINICA }, calendarios: [cal()] });
    expect(fechado.fechado).toBe(true);
    expect(fechado.motivo).toBe("dia_fechado");

    const semConfig = horarioOficialDoDia({ data: "2026-03-04", escopo: { clinica_id: CLINICA }, calendarios: [cal()] });
    expect(semConfig.encontrado).toBe(false);
    expect(semConfig.fechado).toBeNull();
    expect(semConfig.motivo).toBe("dia_nao_configurado");
  });

  it("exceção por data prevalece sobre a semana", () => {
    const c = cal({ excecoes: [{ data: "2026-03-02", tipo: "fechado" }] });
    const r = horarioOficialDoDia({ data: "2026-03-02", escopo: { clinica_id: CLINICA }, calendarios: [c] });
    expect(r.fechado).toBe(true);
    expect(r.excecao).toBe(true);

    const esp = cal({ excecoes: [{ data: "2026-03-02", tipo: "especial", hora_inicio: "09:00", hora_fim: "11:00" }] });
    const r2 = horarioOficialDoDia({ data: "2026-03-02", escopo: { clinica_id: CLINICA }, calendarios: [esp] });
    expect(r2.faixas).toEqual([{ inicio: "09:00", fim: "11:00" }]);
    expect(r2.excecao).toBe(true);
  });

  it("sem calendário publicado nunca vira fechado", () => {
    const r = horarioOficialDoDia({ data: "2026-03-02", escopo: { clinica_id: CLINICA }, calendarios: [] });
    expect(r.encontrado).toBe(false);
    expect(r.fechado).toBeNull();
    expect(r.motivo).toBe("sem_calendario_publicado");
  });

  it("data fora da vigência publicada não usa a versão atual", () => {
    const r = horarioOficialDoDia({
      data: "2025-12-31",
      escopo: { clinica_id: CLINICA },
      calendarios: [cal()],
    });
    expect(r.encontrado).toBe(false);
    expect(r.motivo).toBe("sem_versao_para_a_data");
  });

  it("usa a versão histórica quando o evento é anterior à nova vigência", () => {
    const antiga = cal({
      versao_id: "v0",
      versao: 1,
      status: "substituido",
      vigencia_inicio: "2026-01-01",
      vigencia_fim: "2026-02-28",
      dias: [{ dia_semana: 1, fechado: false, faixas: [{ hora_inicio: "07:00", hora_fim: "11:00" }] }],
    });
    const nova = cal({ versao_id: "v2", versao: 2, vigencia_inicio: "2026-03-01" });
    const r = horarioOficialDoDia({ data: "2026-02-02", escopo: { clinica_id: CLINICA }, calendarios: [antiga, nova] });
    expect(r.versao_id).toBe("v0");
    expect(r.faixas).toEqual([{ inicio: "07:00", fim: "11:00" }]);
  });

  it("escopo desconhecido não afirma horário", () => {
    const r = horarioOficialDoDia({ data: "2026-03-02", escopo: { clinica_id: null }, calendarios: [cal()] });
    expect(r.motivo).toBe("escopo_nao_identificavel");
  });

  it("semana devolve os 7 dias, marcando não configurado como null", () => {
    const s = semanaOficial({ referencia: "2026-03-02", escopo: { clinica_id: CLINICA }, calendarios: [cal()] });
    expect(s.encontrado).toBe(true);
    expect(s.dias).toHaveLength(7);
    expect(s.dias[0]?.fechado).toBe(true);
    expect(s.dias[2]?.fechado).toBeNull();
  });

  it("aberto agora usa o classificador central (fim excluído)", () => {
    const dentro = abertoNoInstante({
      em: "2026-03-02T13:00:00-03:00",
      escopo: { clinica_id: CLINICA },
      calendarios: [cal()],
    });
    expect(dentro.classificacao).toBe("DENTRO_DO_HORARIO");
    const intervalo = abertoNoInstante({
      em: "2026-03-02T12:30:00-03:00",
      escopo: { clinica_id: CLINICA },
      calendarios: [cal()],
    });
    expect(intervalo.classificacao).toBe("FORA_DO_HORARIO");
  });
});
