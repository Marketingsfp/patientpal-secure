import { describe, expect, it } from "bun:test";
import { montarLinhaDoTempo } from "../detalhes-mensagem";

const gw = { arquivo: "src/lib/nina/ai-gateway.server.ts", funcao: "ninaAIGateway" };
const historico = [
  { role: "system", content: "instruções" },
  { role: "assistant", content: "Olá! Como posso ajudar?" },
  { role: "user", content: "quero consulta com o Dr. Alex" },
];
const resultadoVagas = JSON.stringify({ ok: true, dados: { vagas: ["26/09 08:00", "26/09 08:30"] } });

const etapas = [
  { tipo: "consulta", titulo: "Leitura única do catálogo nesta resposta", codigo: {}, dados: {} },
  { tipo: "contexto_modelo", codigo: gw, dados: { mensagens: historico } },
  {
    tipo: "modelo_parametros",
    codigo: gw,
    dados: { model: "google/gemini-3.8-flash", latency_ms: 1200, tentativas: 1, tokens: { entrada: 5000, saida: 40 } },
  },
  {
    tipo: "resposta_original",
    codigo: gw,
    dados: {
      texto: "",
      tool_calls: [{ nome: "consultar_disponibilidade", argumentos: '{"medico":"Dr. Alex","data":"2026-09-26"}' }],
    },
  },
  { tipo: "consulta", titulo: "Profissional do catálogo resolvido para a agenda", codigo: {}, dados: {} },
  {
    tipo: "contexto_modelo",
    codigo: gw,
    dados: {
      mensagens: [
        ...historico,
        { role: "assistant", content: "null" },
        { role: "tool", content: resultadoVagas },
        { role: "system", content: "Não há confirmação de um agendamento gravado." },
      ],
    },
  },
  { tipo: "modelo_parametros", codigo: gw, dados: { model: "google/gemini-3.8-flash", latency_ms: 900 } },
  { tipo: "resposta_original", codigo: gw, dados: { texto: "Temos 08:00 e 08:30 😊", tool_calls: [] } },
  { tipo: "alteracao_posterior", codigo: {}, dados: { antes: "Temos 08:00 e 08:30 😊", depois: "Temos 08:00 e 08:30" } },
];

const inicio = "2026-09-25T10:00:01.000Z";
const eventos = [
  { trace_id: "t", node_id: "tool.execute", cycle_id: 1, event_type: "started", status: "running", started_at: inicio, metadata: { ferramenta: "consultar_disponibilidade" } },
  { trace_id: "t", node_id: "tool.execute", cycle_id: 1, event_type: "completed", status: "ok", started_at: inicio, finished_at: "2026-09-25T10:00:01.300Z", metadata: { ferramenta: "consultar_disponibilidade" } },
];

describe("linha do tempo por rodada", () => {
  const linha = montarLinhaDoTempo(etapas, eventos);

  it("separa as rodadas com modelo, tempo e tokens de cada uma", () => {
    expect(linha.rodadas).toHaveLength(2);
    expect(linha.rodadas[0]).toMatchObject({ numero: 1, latenciaMs: 1200, tokensEntrada: 5000, tokensSaida: 40 });
    expect(linha.rodadas[1]?.latenciaMs).toBe(900);
    expect(linha.rodadas[1]?.texto).toBe("Temos 08:00 e 08:30 😊");
  });

  it("mostra o que a ferramenta pediu e o que devolveu, com a situação do rastreio", () => {
    const f = linha.rodadas[0]!.ferramentas[0]!;
    expect(f.nome).toBe("consultar_disponibilidade");
    expect(f.argumentos).toBe("medico: Dr. Alex\ndata: 2026-09-26");
    expect(f.estado).toBe("concluido");
    expect(f.resultado).toContain("26/09 08:30");
    expect(f.pedidaPeloSistema).toBe(false);
  });

  it("não trata a fala do paciente como orientação, mas mostra a do sistema", () => {
    expect(linha.rodadas[0]!.orientacoesAntes).toEqual([]);
    expect(linha.rodadas[1]!.orientacoesAntes).toEqual(["Não há confirmação de um agendamento gravado."]);
  });

  it("registros do sistema e ajuste final ficam no lugar certo", () => {
    expect(linha.antesDoModelo).toEqual(["Leitura única do catálogo nesta resposta"]);
    expect(linha.rodadas[0]!.registrosSistema).toEqual(["Profissional do catálogo resolvido para a agenda"]);
    expect(linha.ajusteFinal).toEqual({ antes: "Temos 08:00 e 08:30 😊", depois: "Temos 08:00 e 08:30" });
  });

  it("sem casamento seguro, o resultado não é atribuído a nenhuma ferramenta", () => {
    const duas = structuredClone(etapas);
    (duas[3]!.dados as { tool_calls: unknown[] }).tool_calls.push({ nome: "buscar_paciente", argumentos: "{}" });
    const l = montarLinhaDoTempo(duas, eventos);
    expect(l.rodadas[0]!.ferramentas.every((f) => f.resultado === null)).toBe(true);
    expect(l.rodadas[0]!.resultadosSemVinculo).toHaveLength(1);
    expect(l.rodadas[0]!.ferramentas[1]?.estado).toBe("nao_registrado");
  });

  it("ferramenta acionada pelo servidor aparece marcada", () => {
    const l = montarLinhaDoTempo(etapas, [
      ...eventos,
      { trace_id: "t", node_id: "tool.execute", cycle_id: 2, event_type: "completed", status: "ok", started_at: "2026-09-25T10:00:03.000Z", metadata: { ferramenta: "solicitar_atendente_humano" } },
    ]);
    expect(l.rodadas[1]!.ferramentas[0]).toMatchObject({ nome: "solicitar_atendente_humano", pedidaPeloSistema: true });
  });

  it("turno sem modelo informa a origem", () => {
    const l = montarLinhaDoTempo(
      [{ tipo: "resposta_original", titulo: "Resposta produzida pelo gate de identificação (sem modelo)", codigo: {}, dados: { texto: "Qual seu CPF?" } }],
      [],
    );
    expect(l.rodadas).toHaveLength(0);
    expect(l.semModelo).toBe("Resposta produzida pelo gate de identificação (sem modelo)");
  });
});
