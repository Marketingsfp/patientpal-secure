import { describe, expect, test } from "bun:test";
import { decidirEncaminhamento, houveDuvida } from "../jev-encaminhamento";

const base = { urgencia: { noul: 0.1 }, pedido_atendente: { noul: 0.1 }, irritacao: { noul: 0.1 } };

describe("Jev Fase 2 — encaminhamento", () => {
  test("sinais abaixo do limite não encaminham", () => {
    expect(decidirEncaminhamento(base, false, false)).toBeNull();
  });
  test("urgência a partir de 0,5 encaminha com prioridade alta", () => {
    expect(decidirEncaminhamento({ ...base, urgencia: { noul: 0.5 } }, false, false)?.urgencia).toBe("alta");
  });
  test("pedido de atendente a partir de 0,7; irritação a partir de 0,8", () => {
    expect(decidirEncaminhamento({ ...base, pedido_atendente: { noul: 0.69 } }, false, false)).toBeNull();
    expect(decidirEncaminhamento({ ...base, pedido_atendente: { noul: 0.7 } }, false, false)?.motivo).toContain("ATENDENTE");
    expect(decidirEncaminhamento({ ...base, irritacao: { noul: 0.79 } }, false, false)).toBeNull();
    expect(decidirEncaminhamento({ ...base, irritacao: { noul: 0.8 } }, false, false)?.motivo).toContain("IRRITACAO");
  });
  test("dúvida só encaminha na segunda mensagem seguida", () => {
    expect(decidirEncaminhamento(base, true, false)).toBeNull();
    expect(decidirEncaminhamento(base, true, true)?.motivo).toContain("DUVIDA");
    expect(decidirEncaminhamento(null, true, true)?.motivo).toContain("DUVIDA");
  });
  test("dúvida = confiança abaixo de 0,8; sem resposta não é dúvida", () => {
    expect(houveDuvida({ choice: "outro", confidence: 0.7 })).toBe(true);
    expect(houveDuvida({ choice: "outro", confidence: 0.95 })).toBe(false);
    expect(houveDuvida(undefined)).toBe(false);
  });
});
