import { afterEach, describe, expect, mock, test } from "bun:test";

// Só o registro da execução no banco é simulado; gateway, broker e eventos são reais.
mock.module("@/lib/nina/telemetria.server", () => ({
  registrarExecucao: async () => "execucao-teste",
}));

import { medirMemoriaProcesso } from "../memoria-processo";
import { contextoWatchdog } from "../watchdog-contexto.server";
import { criarToolBroker } from "../tool-broker.server";
import { ninaAIGateway } from "../ai-gateway.server";

type Evento = { nome: string; dados?: Record<string, unknown> };

function controleFalso() {
  const eventos: Evento[] = [];
  const controle = {
    batchId: "lote-teste",
    lock: { chave: "clinica:5500", token: "token-teste" },
    snapshot: null,
    checkpoint: async () => {},
    evento: async (nome: string, dados?: Record<string, unknown>) => {
      eventos.push({ nome, dados });
    },
    finalizar: async () => {},
  };
  return { controle: controle as never, eventos };
}

const recursosDe = (eventos: Evento[], nome: string) =>
  eventos.find((e) => e.nome === nome)?.dados?.recursos as Record<string, unknown> | undefined;

describe("medição de memória do processo", () => {
  test("converte a leitura do runtime em bytes inteiros", () => {
    expect(
      medirMemoriaProcesso(() => ({
        heapUsed: 52_428_800.4,
        heapTotal: 67_108_864,
        rss: 90_000_000,
      })),
    ).toEqual({
      memoria_medida: true,
      heap_usado_bytes: 52_428_800,
      heap_total_bytes: 67_108_864,
      rss_bytes: 90_000_000,
    });
  });

  test("runtime que devolve zero declara que não mediu, sem gravar zero", () => {
    expect(medirMemoriaProcesso(() => ({ heapUsed: 0, heapTotal: 0, rss: 0 }))).toEqual({
      memoria_medida: false,
      heap_usado_bytes: null,
      heap_total_bytes: null,
      rss_bytes: null,
    });
  });

  test("função ausente ou que lança nunca interrompe o atendimento", () => {
    const vazio = {
      memoria_medida: false,
      heap_usado_bytes: null,
      heap_total_bytes: null,
      rss_bytes: null,
    };
    expect(medirMemoriaProcesso(() => null)).toEqual(vazio);
    expect(
      medirMemoriaProcesso(() => {
        throw new Error("não implementado");
      }),
    ).toEqual(vazio);
  });

  test("no runtime de teste a leitura padrão mede o heap", () => {
    const medicao = medirMemoriaProcesso();
    expect(medicao.memoria_medida).toBe(true);
    expect(medicao.heap_usado_bytes).toBeGreaterThan(0);
  });
});

describe("eventos persistidos do turno levam a medição", () => {
  const fetchOriginal = globalThis.fetch;
  const chaveOriginal = process.env["LOVABLE_API_KEY"];
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    if (chaveOriginal === undefined) delete process.env["LOVABLE_API_KEY"];
    else process.env["LOVABLE_API_KEY"] = chaveOriginal;
  });

  test("início e fim da ferramenta registram memória", async () => {
    const { controle, eventos } = controleFalso();
    const broker = criarToolBroker({
      ctxPaciente: {
        clinicaId: "clinica-teste",
        telefone: null,
        pacienteId: null,
        pacienteNome: null,
        conversaId: "conversa-teste",
        origem: "homologacao",
        teste: true,
      },
      ctxHandoff: { clinicaId: "clinica-teste", conversaId: "conversa-teste" },
      executarPaciente: async () => ({ ok: true, knowledge_status: "found" }),
    });
    await contextoWatchdog.run(controle, () =>
      broker.executar("consultar_base_conhecimento", { termo: "cardiologia" }),
    );
    for (const nome of ["TOOL_STARTED", "TOOL_FINISHED"]) {
      expect(eventos.find((e) => e.nome === nome)?.dados?.ferramenta).toBe(
        "consultar_base_conhecimento",
      );
      expect(recursosDe(eventos, nome)).toMatchObject({ memoria_medida: true });
    }
  });

  test("rodada do modelo registra memória e tamanho do contexto, sem o conteúdo", async () => {
    process.env["LOVABLE_API_KEY"] = "chave-teste";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "Olá" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const { controle, eventos } = controleFalso();
    const resposta = await contextoWatchdog.run(controle, () =>
      ninaAIGateway({
        clinicaId: null,
        perfil: "whatsapp",
        modeloForcado: "modelo-teste",
        messages: [
          { role: "system", content: "instrução" },
          { role: "user", content: "oi" },
        ],
      }),
    );
    expect(resposta.ok).toBe(true);
    const inicio = recursosDe(eventos, "MODEL_STARTED");
    expect(inicio).toMatchObject({
      memoria_medida: true,
      mensagens: 2,
      contexto_caracteres: "instrução".length + "oi".length,
      ferramentas: 0,
    });
    expect(JSON.stringify(inicio)).not.toContain("instrução");
    expect(recursosDe(eventos, "MODEL_FINISHED")).toMatchObject({ memoria_medida: true });
    // Pareamento de tempos continua por tentativa.
    expect(eventos.find((e) => e.nome === "MODEL_STARTED")?.dados?.tentativa).toBe(1);
  });
});
