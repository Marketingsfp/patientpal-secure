import { describe, expect, test } from "bun:test";
import {
  contarDuvida,
  decidirEncaminhamento,
  houveDuvida,
  motivoLegivel,
  type ContagemDuvida,
} from "../jev-encaminhamento";

const base = { urgencia: { noul: 0.1 }, pedido_atendente: { noul: 0.1 }, irritacao: { noul: 0.1 } };
const falhas = (n: number, confiancas: number[] = []): ContagemDuvida => ({ falhas: n, marco: "m", confiancas });

describe("Jev Fase 2 — encaminhamento", () => {
  test("sinais abaixo do limite não encaminham", () => {
    expect(decidirEncaminhamento(base, null)).toBeNull();
  });
  test("urgência a partir de 0,5 encaminha com prioridade alta e mostra a pontuação", () => {
    const e = decidirEncaminhamento({ ...base, urgencia: { noul: 0.5 } }, null);
    expect(e?.urgencia).toBe("alta");
    expect(e?.motivo).toContain("pontuação 0,50");
  });
  test("pedido de atendente a partir de 0,7; irritação a partir de 0,8", () => {
    expect(decidirEncaminhamento({ ...base, pedido_atendente: { noul: 0.69 } }, null)).toBeNull();
    expect(decidirEncaminhamento({ ...base, pedido_atendente: { noul: 0.7 } }, null)?.motivo).toContain("ATENDENTE");
    expect(decidirEncaminhamento({ ...base, irritacao: { noul: 0.79 } }, null)).toBeNull();
    expect(decidirEncaminhamento({ ...base, irritacao: { noul: 0.8 } }, null)?.motivo).toContain("IRRITACAO");
  });
  test("dúvida só encaminha com 3 falhas seguidas sem avanço (igual à CONV-04), com as confianças no motivo", () => {
    expect(decidirEncaminhamento(base, falhas(1, [0.39]))).toBeNull();
    expect(decidirEncaminhamento(base, falhas(2, [0.39, 0.37]))).toBeNull();
    const e = decidirEncaminhamento(base, falhas(3, [0.39, 0.37, 0.3]));
    expect(e?.motivo).toContain("JEV_DUVIDA_REPETIDA");
    expect(e?.motivo).toContain("em 3 mensagens seguidas");
    expect(e?.motivo).toContain("confiança 0,39 e 0,37 e 0,30");
    expect(motivoLegivel(e!.motivo)).not.toContain("JEV_");
  });
  test("dúvida = confiança abaixo de 0,8; sem resposta não é dúvida", () => {
    expect(houveDuvida({ choice: "outro", confidence: 0.7 })).toBe(true);
    expect(houveDuvida({ choice: "outro", confidence: 0.95 })).toBe(false);
    expect(houveDuvida(undefined)).toBe(false);
  });
});

describe("Jev Fase 2 — contagem de falhas reais", () => {
  const baixa = { choice: "outro", confidence: 0.39 };
  test("baixa confiança isolada conta 1 e não encaminha", () => {
    const c = contarDuvida({ intencao: baixa, selecaoValida: false, marco: "a", anterior: null });
    expect(c.falhas).toBe(1);
    expect(decidirEncaminhamento(base, c)).toBeNull();
  });
  test("falhas sem avanço somam; a segunda ainda não encaminha, a terceira sim", () => {
    const c1 = contarDuvida({ intencao: baixa, selecaoValida: false, marco: "a", anterior: null });
    const c2 = contarDuvida({ intencao: { choice: "outro", confidence: 0.3 }, selecaoValida: false, marco: "a", anterior: c1 });
    expect(c2.falhas).toBe(2);
    expect(decidirEncaminhamento(base, c2)).toBeNull();
    const c3 = contarDuvida({ intencao: { choice: "outro", confidence: 0.2 }, selecaoValida: false, marco: "a", anterior: c2 });
    expect(c3.falhas).toBe(3);
    expect(decidirEncaminhamento(base, c3)?.motivo).toContain("DUVIDA");
  });
  test("atendimento avançou: a contagem recomeça", () => {
    const c1 = contarDuvida({ intencao: baixa, selecaoValida: false, marco: "a", anterior: null });
    const c2 = contarDuvida({ intencao: baixa, selecaoValida: false, marco: "b", anterior: c1 });
    expect(c2.falhas).toBe(1);
  });
  test("escolher uma opção oferecida nunca é falha e zera a contagem", () => {
    const c1 = contarDuvida({ intencao: baixa, selecaoValida: false, marco: "a", anterior: null });
    const c2 = contarDuvida({ intencao: { choice: "medico", confidence: 0.37 }, selecaoValida: true, marco: "a", anterior: c1 });
    expect(c2.falhas).toBe(0);
    expect(decidirEncaminhamento(base, c2)).toBeNull();
  });
  test("entendimento claro zera a contagem", () => {
    const c1 = contarDuvida({ intencao: baixa, selecaoValida: false, marco: "a", anterior: null });
    expect(contarDuvida({ intencao: { choice: "agendamento", confidence: 1 }, selecaoValida: false, marco: "a", anterior: c1 }).falhas).toBe(0);
  });
  test("registro antigo sem marco não soma com a falha atual", () => {
    const legado: ContagemDuvida = { falhas: 1, marco: "", confiancas: [0.5] };
    expect(contarDuvida({ intencao: baixa, selecaoValida: false, marco: "a", anterior: legado }).falhas).toBe(1);
  });
});
