import { describe, expect, it } from "bun:test";
import { respostaParaModelo, validarResultado } from "../tool-broker";

describe("protocolo no agendamento confirmado", () => {
  it("instrui a Nina a usar o protocolo devolvido pelo backend", () => {
    const r = validarResultado("agendar", {
      ok: true,
      appointment_id: "a1",
      protocolo: "MJ-7",
    });
    const payload = respostaParaModelo(r);
    expect(payload["appointment_confirmed"]).toBe(true);
    expect(String(payload["instrucao"])).toContain("MJ-7");
  });

  it("agendamento não gravado nunca leva protocolo", () => {
    const r = validarResultado("agendar", { ok: false, erro: "SLOT_UNAVAILABLE" });
    const payload = respostaParaModelo(r);
    expect(payload["appointment_confirmed"]).toBe(false);
    expect(payload["protocolo"]).toBeUndefined();
  });

  it("clínica sem protocolo não recebe instrução extra", () => {
    const r = validarResultado("agendar", { ok: true, appointment_id: "a1", protocolo: null });
    const payload = respostaParaModelo(r);
    expect(payload["instrucao"]).toBeUndefined();
  });
});
