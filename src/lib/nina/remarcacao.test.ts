import { describe, expect, test } from "bun:test";
import { antecedenciaSuficiente, confirmacaoPermitida, motivoRemarcacao, resumoRemarcacao } from "./remarcacao";

const agora = new Date("2026-10-03T12:00:00.000Z");
const prop = (criado: string, expira = "2026-10-03T12:30:00.000Z") => ({
  agendamento_id: "a", novo_inicio: "x", novo_fim: "y", criado_em: criado, expira_em: expira,
});

describe("Remarcação pela Maria (E2)", () => {
  test("antecedência de 2 horas", () => {
    expect(antecedenciaSuficiente("2026-10-03T14:00:00.000Z", agora)).toBe(true);
    expect(antecedenciaSuficiente("2026-10-03T13:59:00.000Z", agora)).toBe(false);
    expect(antecedenciaSuficiente("lixo", agora)).toBe(false);
  });
  test("confirmação só em turno posterior e dentro da validade", () => {
    expect(confirmacaoPermitida(null, agora.toISOString(), agora)).toEqual({ ok: false, motivo: "SEM_PROPOSTA" });
    expect(confirmacaoPermitida(prop("2026-10-03T12:00:00.000Z"), "2026-10-03T11:59:00.000Z", agora).ok).toBe(false);
    expect(confirmacaoPermitida(prop("2026-10-03T11:50:00.000Z"), null, agora).ok).toBe(false);
    expect(confirmacaoPermitida(prop("2026-10-03T11:50:00.000Z", "2026-10-03T11:59:00.000Z"), "2026-10-03T11:55:00.000Z", agora))
      .toEqual({ ok: false, motivo: "EXPIRADA" });
    expect(confirmacaoPermitida(prop("2026-10-03T11:50:00.000Z"), "2026-10-03T11:55:00.000Z", agora)).toEqual({ ok: true });
  });
  test("motivo e resumo", () => {
    expect(motivoRemarcacao(false)).toBe("Remarcado pelo paciente via WhatsApp");
    expect(motivoRemarcacao(true)).toContain("homologação");
    const r = resumoRemarcacao({ profissional: "Dra. Ana", procedimento: "Consulta", antigo: "10/10 às 09:00", novo: "12/10 às 14:00" });
    expect(r).toContain("10/10 às 09:00");
    expect(r).toContain("12/10 às 14:00");
  });
});
