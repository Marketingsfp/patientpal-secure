import { describe, expect, it } from "bun:test";
import { NODES_ARQUITETURA } from "../manifesto";
import {
  LIMITES,
  criarRastro,
  mascarar,
  nodesNaoUtilizados,
  reconstruirFluxo,
  sanitizarMetadata,
  type Rastro,
} from "../tracing";

/** Relógio determinístico: cada leitura avança o tempo em `passo` ms. */
function relogio(passos: number[]) {
  let atual = 0;
  let i = 0;
  return () => {
    atual += passos[Math.min(i++, passos.length - 1)] ?? 0;
    return atual;
  };
}

function rastroDeTeste(agora: () => number): Rastro {
  return criarRastro({
    trace_id: "trace-1",
    execution_id: "exec-1",
    conversation_id: "conversa-1",
    message_id: "msg-1",
    agora,
  });
}

/** Marca uma etapa completa com duração fixa. */
function etapa(rastro: Rastro, node: string, metadata?: Record<string, unknown>) {
  rastro.iniciar(node);
  rastro.concluir(node, metadata);
}

describe("tracing — segurança dos dados", () => {
  it("nunca guarda segredos", () => {
    const limpo = sanitizarMetadata({
      token: "abc123",
      api_key: "sk-live-xyz",
      service_role: "eyJ...",
      cookie: "sid=1",
      senha: "1234",
      authorization: "Bearer abc",
      modelo: "gemini",
    });
    for (const chave of ["token", "api_key", "service_role", "cookie", "senha", "authorization"]) {
      expect(limpo[chave]).toBe("[removido]");
    }
    expect(limpo.modelo).toBe("gemini");
    expect(JSON.stringify(limpo)).not.toContain("sk-live-xyz");
  });

  it("mascara dados pessoais", () => {
    expect(mascarar("5511999998888")).toBe("***8888");
    expect(mascarar("paciente@teste.com")).toBe("p*******@teste.com");
    const limpo = sanitizarMetadata({ telefone: "+55 11 99999-8888", cpf: "12345678901" });
    expect(limpo.telefone).toBe("***8888");
    expect(limpo.cpf).toBe("***8901");
  });

  it("trunca textos longos e limita listas e profundidade", () => {
    const limpo = sanitizarMetadata({
      texto: "x".repeat(1000),
      lista: Array.from({ length: 100 }, (_, i) => i),
      fundo: { a: { b: { c: { d: 1 } } } },
    });
    expect((limpo.texto as string).length).toBeLessThanOrEqual(LIMITES.texto + 1);
    expect((limpo.lista as unknown[]).length).toBe(LIMITES.itens);
    expect(JSON.stringify(limpo.fundo)).not.toContain('"d"');
  });

  it("descarta funções e limita o número de chaves", () => {
    const entrada: Record<string, unknown> = { fn: () => 1 };
    for (let i = 0; i < 50; i++) entrada[`k${i}`] = i;
    const limpo = sanitizarMetadata(entrada);
    expect(limpo.fn).toBeNull();
    expect(Object.keys(limpo).length).toBeLessThanOrEqual(LIMITES.chaves);
  });
});

describe("tracing — reconstrução do fluxo real", () => {
  it("mensagem simples: entrada → contexto → IA → saída", () => {
    const rastro = rastroDeTeste(relogio([10]));
    for (const node of [
      "message.inbound",
      "message.validate",
      "message.deduplicate",
      "conversation.ensure",
      "routing.decide",
      "context.load",
      "prompt.compose",
      "llm.generate",
      "response.validate",
      "message.outbound",
      "message.persist",
      "metrics.record",
    ]) {
      etapa(rastro, node);
    }
    const fluxo = reconstruirFluxo(rastro.eventos());
    expect(fluxo.caminho[0]).toBe("message.inbound");
    expect(fluxo.caminho.at(-1)).toBe("metrics.record");
    expect(fluxo.falhas).toEqual([]);
    expect(fluxo.passos.every((p) => p.status === "ok")).toBe(true);
    expect(fluxo.duracao_total_ms).toBeGreaterThan(0);
  });

  it("mensagem com base de conhecimento: duas rodadas do modelo", () => {
    const rastro = rastroDeTeste(relogio([20]));
    etapa(rastro, "llm.generate");
    etapa(rastro, "tool.execute");
    etapa(rastro, "tool.knowledge.lookup", { resultados: 3 });
    rastro.novoCiclo();
    etapa(rastro, "llm.generate");
    etapa(rastro, "message.outbound");
    const fluxo = reconstruirFluxo(rastro.eventos());
    expect(fluxo.ciclos).toBe(2);
    expect(fluxo.caminho.filter((n) => n === "llm.generate").length).toBe(2);
    expect(fluxo.passos.find((p) => p.node_id === "tool.knowledge.lookup")?.metadata.resultados).toBe(3);
  });

  it("mensagem com agenda: consulta e marcação aparecem no trace", () => {
    const rastro = rastroDeTeste(relogio([30]));
    etapa(rastro, "llm.generate");
    etapa(rastro, "tool.schedule.availability", { vagas: 4 });
    rastro.novoCiclo();
    etapa(rastro, "llm.generate");
    etapa(rastro, "tool.schedule.book", { agendamento: "ok" });
    etapa(rastro, "message.outbound");
    const fluxo = reconstruirFluxo(rastro.eventos());
    expect(fluxo.caminho).toContain("tool.schedule.availability");
    expect(fluxo.caminho).toContain("tool.schedule.book");
    const marcacao = fluxo.passos.find((p) => p.node_id === "tool.schedule.book");
    expect(marcacao?.duration_ms).toBe(30);
  });

  it("mensagem com transferência: handoff, fila e protocolo", () => {
    const rastro = rastroDeTeste(relogio([15]));
    etapa(rastro, "llm.generate");
    etapa(rastro, "tool.handoff", { motivo: "pedido do paciente" });
    etapa(rastro, "handoff.queue");
    etapa(rastro, "handoff.assign");
    etapa(rastro, "protocol.generate");
    rastro.pular("conversation.close", "conversa assumida por atendente");
    const fluxo = reconstruirFluxo(rastro.eventos());
    expect(fluxo.caminho).toEqual([
      "llm.generate",
      "tool.handoff",
      "handoff.queue",
      "handoff.assign",
      "protocol.generate",
      "conversation.close",
    ]);
    expect(fluxo.ignorados).toEqual(["conversation.close"]);
  });

  it("erro: falha do modelo é registrada com a mensagem, sem derrubar o trace", () => {
    const rastro = rastroDeTeste(relogio([25]));
    etapa(rastro, "prompt.compose");
    rastro.iniciar("llm.generate");
    rastro.falhar("llm.generate", new Error("limite de uso atingido"));
    etapa(rastro, "error.handle");
    const fluxo = reconstruirFluxo(rastro.eventos());
    expect(fluxo.falhas).toEqual(["llm.generate"]);
    expect(fluxo.passos.find((p) => p.node_id === "llm.generate")?.metadata.erro).toBe(
      "limite de uso atingido",
    );
    expect(fluxo.caminho.at(-1)).toBe("error.handle");
  });

  it("retry: conta as tentativas e mantém o node único no caminho", () => {
    const rastro = rastroDeTeste(relogio([12]));
    rastro.iniciar("llm.generate");
    rastro.repetir("llm.generate", 2, "tempo esgotado");
    rastro.repetir("llm.generate", 3, "tempo esgotado");
    rastro.concluir("llm.generate");
    const fluxo = reconstruirFluxo(rastro.eventos());
    expect(fluxo.caminho).toEqual(["llm.generate"]);
    expect(fluxo.passos[0].tentativas).toBe(3);
    expect(fluxo.passos[0].status).toBe("ok");
  });

  it("cancelado: registra o cancelamento e o motivo", () => {
    const rastro = rastroDeTeste(relogio([18]));
    etapa(rastro, "conversation.ensure");
    rastro.iniciar("llm.generate");
    rastro.cancelar("llm.generate", "atendente assumiu a conversa");
    const fluxo = reconstruirFluxo(rastro.eventos());
    expect(fluxo.cancelados).toEqual(["llm.generate"]);
    expect(fluxo.passos.at(-1)?.metadata.motivo).toBe("atendente assumiu a conversa");
  });
});

describe("tracing — leveza e robustez", () => {
  it("respeita o limite de eventos e informa o descarte", () => {
    const rastro = rastroDeTeste(relogio([1]));
    for (let i = 0; i < LIMITES.eventos + 50; i++) rastro.iniciar(`node.${i}`);
    expect(rastro.eventos().length).toBe(LIMITES.eventos);
    expect(rastro.descartados()).toBe(50);
  });

  it("nunca lança, mesmo com metadata problemática", () => {
    const rastro = rastroDeTeste(relogio([1]));
    const ciclico: Record<string, unknown> = {};
    ciclico.self = ciclico;
    expect(() => rastro.iniciar("llm.generate", ciclico)).not.toThrow();
    expect(() => rastro.falhar("llm.generate", undefined)).not.toThrow();
  });

  it("drenar esvazia o buffer para gravação em segundo plano", () => {
    const rastro = rastroDeTeste(relogio([5]));
    etapa(rastro, "message.inbound");
    expect(rastro.drenar().length).toBe(2);
    expect(rastro.eventos().length).toBe(0);
  });

  it("todos os nodes usados nos testes existem no manifesto", () => {
    const rastro = rastroDeTeste(relogio([5]));
    etapa(rastro, "tool.handoff");
    const ids = new Set(NODES_ARQUITETURA.map((n) => n.id));
    for (const evento of rastro.eventos()) expect(ids.has(evento.node_id)).toBe(true);
  });

  it("aponta quais componentes não foram usados na execução", () => {
    const rastro = rastroDeTeste(relogio([5]));
    etapa(rastro, "message.inbound");
    etapa(rastro, "llm.generate");
    const naoUsados = nodesNaoUtilizados(
      rastro.eventos(),
      NODES_ARQUITETURA.map((n) => n.id),
    );
    expect(naoUsados).toContain("tool.schedule.book");
    expect(naoUsados).not.toContain("llm.generate");
  });
});
