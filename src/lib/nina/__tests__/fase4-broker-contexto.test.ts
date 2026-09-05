import { describe, it, expect } from "bun:test";
import { montarContexto, selecionarMensagensRelevantes } from "../context-builder";
import {
  chaveIdempotencia,
  descreverFerramenta,
  respostaParaModelo,
  validarResultado,
} from "../tool-broker";
import { parseDecisaoNina, camposFaltantesAgendamento } from "../decisao-schema";

describe("Context Builder — só o necessário", () => {
  const historico = Array.from({ length: 60 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: `m${i}`,
  }));
  const ctx = montarContexto({
    systemBlocos: ["INSTRUCOES", "", null],
    historico,
    mensagemAtual: "quanto custa?",
    paciente: { primeiro_nome: "Ana", identificado: true, validado: true },
    conhecimento: { knowledge_status: "found", price: "R$ 200,00" },
    resultadosTool: [{ ferramenta: "consultar_disponibilidade", resultado: { success: true } }],
  });
  it("não envia o histórico inteiro", () => {
    expect(ctx.metricas.mensagens_historico_disponiveis).toBe(60);
    expect(ctx.metricas.mensagens_historico_enviadas).toBe(20);
  });
  it("mantém instruções no topo e a mensagem atual no fim", () => {
    expect(ctx.messages[0]?.role).toBe("system");
    expect(ctx.messages.at(-1)).toEqual({ role: "user", content: "quanto custa?" });
  });
  it("envia só os campos mínimos do paciente (CRM)", () => {
    const bloco = ctx.messages.find((m) => String(m.content).includes("DADOS DO PACIENTE"));
    expect(bloco?.content).toContain("Ana");
    expect(bloco?.content).not.toContain("cpf");
  });
  it("envia o conhecimento recuperado, não a planilha", () =>
    expect(ctx.messages.some((m) => String(m.content).includes("knowledge_status"))).toBe(true));
  it("trunca mensagem gigante", () => {
    const r = montarContexto({
      systemBlocos: ["x"],
      historico: [{ role: "user", content: "a".repeat(9000) }],
      mensagemAtual: "oi",
    });
    expect(r.metricas.truncou_mensagem).toBe(true);
  });
  it("não começa a janela com resultado de tool órfão", () =>
    expect(
      selecionarMensagensRelevantes(
        [{ role: "tool", content: "x" }, { role: "user", content: "y" }],
        2,
      ),
    ).toHaveLength(1));
});

describe("Tool Broker — divisão de fontes", () => {
  it("valor vem da Base de Conhecimentos", () =>
    expect(descreverFerramenta("consultar_base_conhecimento")?.fonte).toBe("base_conhecimento"));
  it("disponibilidade vem da Agenda", () =>
    expect(descreverFerramenta("consultar_disponibilidade")?.fonte).toBe("agenda"));
  it("dados do paciente vêm do CRM", () =>
    expect(descreverFerramenta("meus_agendamentos")?.fonte).toBe("crm"));
  it("agendamento real é escrita na Agenda", () => {
    const d = descreverFerramenta("agendar");
    expect(d?.fonte).toBe("agenda");
    expect(d?.escrita).toBe(true);
  });
  it("ferramenta inventada não existe no catálogo", () =>
    expect(descreverFerramenta("enviar_boleto_magico")).toBeNull());
});

describe("Tool Broker — validação de resultado", () => {
  it("erro da tool nunca vira sucesso", () => {
    const r = validarResultado("consultar_disponibilidade", { ok: false, erro: "INTERNAL_ERROR" });
    expect(r.success).toBe(false);
    expect(r.erro).toBe("INTERNAL_ERROR");
  });
  it("agendar sem appointment_id não é confirmado", () => {
    const r = validarResultado("agendar", { ok: true });
    expect(r.appointment_confirmed).toBe(false);
    expect(r.success).toBe(false);
    expect(String(respostaParaModelo(r)["instrucao"])).toMatch(/proibido/i);
  });
  it("agendar com appointment_id é confirmado", () =>
    expect(validarResultado("agendar", { ok: true, appointment_id: "a1" }).appointment_confirmed).toBe(
      true,
    ));
  it("duplicado idempotente conta como confirmado", () =>
    expect(validarResultado("agendar", { ok: true, duplicado: true }).success).toBe(true));
  it("retry com os mesmos argumentos gera a mesma chave", () =>
    expect(chaveIdempotencia("agendar", { b: 2, a: 1 })).toBe(
      chaveIdempotencia("agendar", { a: 1, b: 2 }),
    ));
  it("argumentos diferentes geram chaves diferentes", () =>
    expect(chaveIdempotencia("agendar", { a: 1 })).not.toBe(chaveIdempotencia("agendar", { a: 2 })));
});

describe("Decisão estruturada", () => {
  it("aceita o schema esperado", () =>
    expect(
      parseDecisaoNina('{"intent":"appointment","needs_knowledge":true,"needs_tool":true,"missing_fields":[]}'),
    ).toEqual({
      intent: "appointment",
      needs_knowledge: true,
      needs_tool: true,
      missing_fields: [],
    }));
  it("entrada inválida vira decisão neutra", () =>
    expect(parseDecisaoNina("nao é json").intent).toBe("other"));
  it("campos faltantes do agendamento são regra de código", () =>
    expect(camposFaltantesAgendamento({ paciente_identificado: true, medico_id: "m" })).toEqual([
      "horario",
      "procedimento",
    ]));
});
