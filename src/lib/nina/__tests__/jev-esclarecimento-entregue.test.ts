import { expect, test } from "bun:test";
import { esclarecerFoiEntregue } from "../jev-esclarecimento-entregue";
import { contarDuvida, decidirEncaminhamento } from "../jev-encaminhamento";

const ctx = {
  clinicaId: "c",
  conversaId: "v",
  sessionId: "s",
  desde: "2026-10-05T21:00:00Z",
  teste: false,
  entradasAtuais: ["m2"],
  entradasAnteriores: ["m1"],
  conhecimento: null,
};
const linha = (id: string, body: string, hora: string, direction = "out") => ({
  id,
  body,
  created_at: `2026-10-05T21:${hora}:00Z`,
  direction,
  conversa_id: "v",
  is_teste: false,
  enviada_por: direction === "out" ? "nina" : "paciente",
  status: direction === "out" ? "sent" : "received",
});
const historico = () => [
  linha("m1", "Quero xyz", "01", "in"),
  linha("p1", "Pode explicar de outra forma o que você precisa?", "02"),
  linha("m2", "xyz abc", "03", "in"),
];
test("exige pergunta enviada depois da primeira entrada e antes da resposta", () => {
  expect(esclarecerFoiEntregue(historico(), ctx)).toEqual({
    mensagemId: "p1",
    entradaAnteriorId: "m1",
  });
});
test.each([
  "Como posso te ajudar hoje?",
  "Qual a sua data de nascimento?",
  "Pode confirmar seu nome completo?",
  "Qual horário você prefere?",
  "Você confirma o agendamento?",
])("pergunta operacional não é prova: %s", (texto) => {
  const m = historico();
  m[1]!.body = texto;
  expect(esclarecerFoiEntregue(m, ctx)).toBeNull();
});
test.each([
  { status: "pending" },
  { status: "failed" },
  { enviada_por: "humano" },
  { is_teste: true },
  { conversa_id: "outra" },
  { created_at: "2026-10-05T20:59:00Z" },
  { created_at: "2026-10-05T21:04:00Z" },
  { created_at: "2026-10-05T21:01:00Z" },
])("pergunta fora do ciclo, ordem, autor ou entrega não conta: %j", (patch) => {
  const m = historico();
  m[1] = { ...m[1]!, ...patch };
  expect(esclarecerFoiEntregue(m, ctx)).toBeNull();
});
test("saudação antiga contada por versão anterior não vira primeira tentativa", () => {
  const m = historico();
  m[0]!.body = "Boa noite";
  expect(esclarecerFoiEntregue(m, ctx)).toBeNull();
});
test("histórico incompleto, entrada repetida e nova sessão não autorizam contagem", () => {
  expect(esclarecerFoiEntregue(historico().slice(1), ctx)).toBeNull();
  expect(esclarecerFoiEntregue(historico(), { ...ctx, entradasAtuais: ["m1", "m2"] })).toBeNull();
  expect(esclarecerFoiEntregue(historico(), { ...ctx, desde: "2026-10-05T21:03:00Z" })).toBeNull();
});
test("pergunta do catálogo só vale quando o texto foi entregue na mesma sessão", () => {
  const m = historico();
  m[1]!.body = "Você se refere a Ultrassonografia?";
  const conhecimento = {
    versao: 1,
    clinicaId: "c",
    sessionId: "s",
    consulta: { termo: "usan" },
    referencias: [{ registro: "us", procedimento: "Ultrassonografia" }],
    esclarecimento: {
      tipo: "procedimento",
      pergunta: m[1]!.body,
      opcoes: [{ id: "us", nome: "Ultrassonografia" }],
    },
  };
  expect(esclarecerFoiEntregue(m, { ...ctx, conhecimento })?.mensagemId).toBe("p1");
  expect(
    esclarecerFoiEntregue(m, { ...ctx, conhecimento: { ...conhecimento, sessionId: "velha" } }),
  ).toBeNull();
});
test("MJ-727: saudação 0,25 seguida de pedido 0,32 não encaminha", () => {
  const primeira = contarDuvida({
    mensagem: "Boa noite",
    entendimento: { noul: 0.25 },
    selecaoValida: false,
    marco: "m",
    anterior: null,
    mensagensEntrada: ["m1"],
  });
  expect(primeira.falhas).toBe(0);
  const segunda = contarDuvida({
    mensagem: "Queria saber se vocês fazem usan",
    entendimento: { noul: 0.32 },
    selecaoValida: false,
    marco: "m",
    anterior: primeira,
    mensagensEntrada: ["m2"],
  });
  expect(segunda.falhas).toBe(1);
  expect(decidirEncaminhamento({ entendimento: { noul: 0.32 } }, segunda)).toBeNull();
});
test("duas pontuações baixas sem esclarecimento e contador legado não autorizam transferência", () => {
  const anterior = { falhas: 2, marco: "m", confiancas: [0.2, 0.3], mensagensEntrada: ["m1"] };
  expect(decidirEncaminhamento({ entendimento: { noul: 0.2 } }, anterior)).toBeNull();
  const contagem = contarDuvida({
    entendimento: { noul: 0.2 },
    selecaoValida: false,
    marco: "m",
    anterior,
    mensagensEntrada: ["m2"],
  });
  expect(contagem.falhas).toBe(1);
  expect(decidirEncaminhamento({ entendimento: { noul: 0.2 } }, contagem)).toBeNull();
  expect(decidirEncaminhamento({ urgencia: { noul: 0.9 } }, contagem)?.motivo).toContain(
    "URGENCIA",
  );
  expect(decidirEncaminhamento({ pedido_atendente: { noul: 0.9 } }, contagem)?.motivo).toContain(
    "PEDIDO_ATENDENTE",
  );
});
test("lote sobreposto e reprocessamento não carregam autorização de encaminhamento", () => {
  const anterior = {
    falhas: 2,
    marco: "m",
    confiancas: [0.2, 0.3],
    mensagensEntrada: ["m1"],
    esclarecimento: { mensagemId: "pergunta", entradaAnteriorId: "antes" },
  };
  for (const mensagensEntrada of [["m1"], ["m1", "m2"]]) {
    const c = contarDuvida({
      entendimento: { noul: 0.2 },
      selecaoValida: false,
      marco: "m",
      anterior,
      mensagensEntrada,
      esclarecimento: { mensagemId: "outra", entradaAnteriorId: "m1" },
    });
    expect(c.falhas).toBe(2);
    expect(c.esclarecimento).toBeUndefined();
    expect(decidirEncaminhamento({ entendimento: { noul: 0.2 } }, c)).toBeNull();
  }
  expect(decidirEncaminhamento({}, anterior)).toBeNull();
});
