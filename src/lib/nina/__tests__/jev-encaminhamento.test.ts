import { describe, expect, test } from "bun:test";
import {
  contarDuvida,
  decidirEncaminhamento,
  naoEntendeu,
  perguntasEncaminhamento,
  motivoLegivel,
  type ContagemDuvida,
} from "../jev-encaminhamento";

const prova = { mensagemId: "pergunta-enviada", entradaAnteriorId: "m1" };
const base = { entendimento: { noul: 0.2 }, urgencia: { noul: 0.1 }, pedido_atendente: { noul: 0.1 }, irritacao: { noul: 0.1 } };
const falhas = (n: number, confiancas: number[] = []): ContagemDuvida => ({ falhas: n, marco: "m", confiancas, esclarecimento: prova });

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
  test("escolher médico pelo nome não é pedido de atendente (07/10/2026)", () => {
    const alto = { ...base, pedido_atendente: { noul: 0.78 } };
    for (const m of ["qria cm a dra andrea de lucca", "com o Dr. Jorge", "quero a doutora Iara", "o primeiro com o dr alex"])
      expect(decidirEncaminhamento(alto, null, undefined, m)).toBeNull();
    for (const m of ["quero falar com uma atendente", "me passa pra recepção", "nao quero a dra quero falar com alguem"])
      expect(decidirEncaminhamento(alto, null, undefined, m)?.motivo).toContain("PEDIDO_ATENDENTE");
    // Urgência continua valendo mesmo citando o médico.
    expect(decidirEncaminhamento({ ...alto, urgencia: { noul: 0.9 } }, null, undefined, "dra andrea, to com muita dor")?.urgencia).toBe("alta");
    const p = perguntasEncaminhamento().pedido_atendente!;
    expect(p.instructions).toContain("NÃO pedido de atendente");
    expect(JSON.stringify(p.criteria)).toContain("qria cm a dra andrea");
  });
  test("dúvida encaminha na segunda mensagem sem entendimento, com as confianças no motivo", () => {
    expect(decidirEncaminhamento(base, falhas(1, [0.39]))).toBeNull();
    const e = decidirEncaminhamento(base, falhas(2, [0.39, 0.37]));
    expect(e?.motivo).toContain("JEV_DUVIDA_REPETIDA");
    expect(e?.motivo).toContain("em 2 mensagens seguidas");
    expect(e?.motivo).toContain("entendimento 0,39 e 0,37");
    expect(motivoLegivel(e!.motivo)).not.toContain("JEV_");
  });
  test("falha de entendimento = pergunta própria de entendimento abaixo de 0,5; sem resposta não é falha", () => {
    expect(naoEntendeu({ noul: 0.2 })).toBe(true);
    expect(naoEntendeu({ noul: 0.9 })).toBe(false);
    expect(naoEntendeu(undefined)).toBe(false);
    // A confiança da intenção não conta mais como falha de entendimento.
    expect(naoEntendeu({ choice: "outro", confidence: 0.39 })).toBe(false);
  });
  test("a pergunta de entendimento vai na mesma chamada da Fase 2", () => {
    expect(Object.keys(perguntasEncaminhamento())).toContain("entendimento");
  });
});

describe("Jev Fase 2 — contagem de falhas reais", () => {
  const baixa = { noul: 0.2 };
  test("uma falha de entendimento isolada conta 1 e não encaminha", () => {
    const c = contarDuvida({ entendimento: baixa, selecaoValida: false, marco: "a", anterior: null });
    expect(c.falhas).toBe(1);
    expect(decidirEncaminhamento(base, c)).toBeNull();
  });
  test("falhas sem avanço somam; a segunda encaminha sem esperar uma terceira", () => {
    const c1 = contarDuvida({ entendimento: baixa, selecaoValida: false, marco: "a", anterior: null, mensagensEntrada: ["m1"] });
    const c2 = contarDuvida({ entendimento: { noul: 0.3 }, selecaoValida: false, marco: "a", anterior: c1, mensagensEntrada: ["m2"], esclarecimento: prova });
    expect(c2.falhas).toBe(2);
    expect(decidirEncaminhamento(base, c2)?.motivo).toContain("DUVIDA");
  });
  test("reprocessar as mesmas entradas não vira uma segunda falha", () => {
    const parametros = { entendimento: baixa, selecaoValida: false, marco: "a", mensagensEntrada: ["m1", "m2"] };
    const c1 = contarDuvida({ ...parametros, anterior: null });
    const repetida = contarDuvida({ ...parametros, mensagensEntrada: ["m2", "m1"], anterior: c1 });
    expect(repetida.falhas).toBe(1);
    expect(decidirEncaminhamento(base, repetida)).toBeNull();
    const nova = contarDuvida({ ...parametros, mensagensEntrada: ["m3"], anterior: repetida, esclarecimento: prova });
    expect(decidirEncaminhamento(base, nova)?.motivo).toContain("em 2 mensagens");
  });
  test("sem avaliação de entendimento não inventa falha nem entendimento confirmado", () => {
    const c1 = contarDuvida({ entendimento: baixa, selecaoValida: false, marco: "a", anterior: null });
    expect(contarDuvida({ entendimento: undefined, selecaoValida: false, marco: "a", anterior: c1 })).toEqual(c1);
  });
  test("atendimento avançou: a contagem recomeça", () => {
    const c1 = contarDuvida({ entendimento: baixa, selecaoValida: false, marco: "a", anterior: null });
    const c2 = contarDuvida({ entendimento: baixa, selecaoValida: false, marco: "b", anterior: c1 });
    expect(c2.falhas).toBe(1);
  });
  test("escolher uma opção oferecida nunca é falha e zera a contagem", () => {
    const c1 = contarDuvida({ entendimento: baixa, selecaoValida: false, marco: "a", anterior: null });
    const c2 = contarDuvida({ entendimento: { noul: 0.3 }, selecaoValida: true, marco: "a", anterior: c1 });
    expect(c2.falhas).toBe(0);
    expect(decidirEncaminhamento(base, c2)).toBeNull();
  });
  test("entendimento claro zera a contagem", () => {
    const c1 = contarDuvida({ entendimento: baixa, selecaoValida: false, marco: "a", anterior: null });
    expect(contarDuvida({ entendimento: { noul: 0.95 }, selecaoValida: false, marco: "a", anterior: c1 }).falhas).toBe(0);
  });
  test("registro antigo sem marco não soma com a falha atual", () => {
    const legado: ContagemDuvida = { falhas: 1, marco: "", confiancas: [0.5] };
    expect(contarDuvida({ entendimento: baixa, selecaoValida: false, marco: "a", anterior: legado }).falhas).toBe(1);
  });
});
