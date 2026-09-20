import { describe, expect, test } from "bun:test";
import { normalizarConfig, planoDeMensagens } from "../carga";
import { executarCargaControlada } from "../carga-execucao.server";
import { cargasQueReservamExecutor } from "../carga-controle.server";
import { controleParalelo, metricasParalelas, EXECUTOR_CARGA_PARALELA } from "../carga-paralela";
import { temposEtapasCarga, picoIntervalosCarga } from "../carga-tempos";
import {
  cargaFicticia,
  criarBancoCargaSimulado,
  CLINICA_CARGA,
  RUN_CARGA,
  promessaControlada,
} from "./fixtures/carga-banco-simulado";

async function ate(condicao: () => boolean) {
  for (let i = 0; i < 200 && !condicao(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(condicao()).toBe(true);
}

function ambiente(n: number, turnos = 1, cadenciado = false) {
  let agora = Date.now();
  const base = cargaFicticia();
  const carga = cargaFicticia({
    total_planejado: n * turnos,
    criado_por: "user",
    config: {
      ...(base.config as any),
      executor: EXECUTOR_CARGA_PARALELA,
      modoEnvio: cadenciado ? "cadenciado" : "simultaneo",
      leadsAtivos: n,
      conversasSimultaneas: n,
      totalMensagens: n * turnos,
      intervaloMs: 1000,
      mensagensPorMinuto: 30,
    },
    plano: Array.from({ length: n * turnos }, (_, indice) => ({
      ...base.plano[0],
      indice,
      leadId: `lead-${indice % n}`,
      leadIndice: (indice % n) + 1,
      mensagem: `turno-${Math.floor(indice / n)}`,
    })),
    preflight: Array.from({ length: n }, (_, i) => ({ ...base.preflight[0], leadId: `lead-${i}` })),
  });
  const db = criarBancoCargaSimulado([carga]);
  db.tabelas.whatsapp_mensagens = [];
  const iniciados: any[] = [];
  const liberacoes = new Map<string, ReturnType<typeof promessaControlada<void>>>();
  const processar = async (d: any) => {
    iniciados.push(d);
    const gate = promessaControlada<void>();
    liberacoes.set(d.chave, gate);
    const m = {
      id: d.chave,
      clinica_id: CLINICA_CARGA,
      conversa_id: `conversa-${d.leadId}`,
      direction: "in",
      is_teste: true,
      wa_message_id: `test-${d.leadId}-${d.chave}`,
      nina_status: "processing",
    };
    db.tabelas.whatsapp_mensagens!.push(m);
    await gate.promessa;
    m.nina_status = "completed";
    return { reply: "resposta simulada", conversaId: m.conversa_id };
  };
  const args = {
    admin: db.admin,
    clinicaId: CLINICA_CARGA,
    cargaId: RUN_CARGA,
    userId: "user",
    processar,
    agora: () => agora,
  };
  return {
    db,
    args,
    iniciados,
    carga: () => db.tabelas.nina_teste_carga![0],
    avancar: (ms: number) => {
      agora += ms;
    },
    liberar: (i: number) => liberacoes.get(iniciados[i].chave)!.resolver(),
  };
}

describe("Carga paralela em requisições independentes", () => {
  test("todos os participantes recebem roteiro mesmo com limite menor de concorrência", () => {
    const fila = planoDeMensagens(
      normalizarConfig({ leadsAtivos: 10, conversasSimultaneas: 2, totalMensagens: 10 }),
    );
    expect(new Set(fila.map((p) => p.slot)).size).toBe(10);
  });
  test("sessão alterada encerra a carga antes de enviar", async () => {
    const a = ambiente(2);
    a.db.tabelas.nina_teste_leads![0].sessao_seq = 99;
    await expect(executarCargaControlada(a.args)).rejects.toThrow("sessão mudou");
    expect(a.iniciados).toHaveLength(0);
    expect(a.carga().status).toBe("erro");
  });

  test("uma clínica não pode executar a carga de outra", async () => {
    const a = ambiente(2);
    await expect(
      executarCargaControlada({ ...a.args, clinicaId: "outra-clinica" }),
    ).rejects.toThrow("não encontrado");
    expect(a.iniciados).toHaveLength(0);
  });

  test("duração esgotada impede novas requisições", async () => {
    const a = ambiente(2);
    a.avancar(1_000_000);
    await executarCargaControlada(a.args);
    expect(a.carga().status).toBe("parado");
    expect(a.iniciados).toHaveLength(0);
  });

  test("falha ao salvar resultado é conciliada sem reenviar a entrada", async () => {
    const a = ambiente(2);
    const p = executarCargaControlada(a.args);
    await ate(() => a.iniciados.length === 1);
    a.db.falharUmaVez("nina_teste_carga_amostras", "insert");
    a.liberar(0);
    await expect(p).rejects.toThrow("CARGA_RESULTADO_NAO_SALVO");
    a.avancar(5000);
    await executarCargaControlada(a.args);
    expect(a.iniciados).toHaveLength(1);
    expect(a.carga().enviadas).toBe(1);
  });

  test("pendência bloqueia apenas o próprio lead e preserva a primeira entrada", async () => {
    const a = ambiente(2, 2);
    const d = { leadId: "lead-0", chave: `carga-${RUN_CARGA}-0` };
    a.db.tabelas.whatsapp_mensagens!.push({
      id: d.chave,
      clinica_id: CLINICA_CARGA,
      conversa_id: "conversa-lead-0",
      direction: "in",
      is_teste: true,
      wa_message_id: `test-${d.leadId}-${d.chave}`,
      nina_status: "processing",
    });
    await executarCargaControlada(a.args);
    const p = executarCargaControlada(a.args);
    await ate(() => a.iniciados.length === 1);
    expect(a.iniciados[0].leadId).toBe("lead-1");
    a.liberar(0);
    await p;
  });
  for (const n of [2, 5, 10])
    test(`${n} leads começam antes de qualquer resposta terminar`, async () => {
      const a = ambiente(n);
      const requisicoes = Array.from({ length: n }, () => executarCargaControlada(a.args));
      await ate(() => a.iniciados.length === n);
      expect(a.db.tabelas.nina_teste_carga_amostras).toHaveLength(0);
      expect(new Set(a.iniciados.map((d) => d.leadId)).size).toBe(n);
      for (let i = 0; i < n; i++) a.liberar(i);
      await Promise.all(requisicoes);
      expect(a.carga().status).toBe("concluido");
      expect(a.carga().enviadas).toBe(n);
      expect(a.db.tabelas.nina_teste_carga_amostras).toHaveLength(n);
      expect(metricasParalelas(a.carga().config)?.pico).toBe(n);
      expect(Object.keys(controleParalelo(a.carga().config).reservas)).toHaveLength(0);
    });

  test("um lead avança sem esperar o outro e a própria sequência permanece ordenada", async () => {
    const a = ambiente(2, 2);
    const p = [executarCargaControlada(a.args), executarCargaControlada(a.args)];
    await ate(() => a.iniciados.length === 2);
    a.liberar(0);
    await p[0];
    const seguinte = executarCargaControlada(a.args);
    await ate(() => a.iniciados.length === 3);
    expect(a.iniciados[2].leadId).toBe(a.iniciados[0].leadId);
    expect(a.iniciados[2].texto).toBe("turno-1");
    a.liberar(1);
    a.liberar(2);
    await Promise.all([...p, seguinte]);
  });

  test("duas abas não excedem a concorrência nem repetem o mesmo lead", async () => {
    const a = ambiente(5, 2);
    const p = Array.from({ length: 12 }, () => executarCargaControlada(a.args));
    await ate(() => a.iniciados.length === 5);
    expect(new Set(a.iniciados.map((d) => d.leadId)).size).toBe(5);
    a.carga().cancelar = true;
    a.carga().status = "parado";
    for (let i = 0; i < 5; i++) a.liberar(i);
    await Promise.all(p);
    expect(a.iniciados).toHaveLength(5);
    expect(a.carga().status).toBe("parado");
    expect(a.carga().enviadas).toBe(5);
  });

  test("cancelamento impede novos disparos e reserva os leads até as chamadas terminarem", async () => {
    const a = ambiente(2, 2);
    const p = executarCargaControlada(a.args);
    await ate(() => a.iniciados.length === 1);
    a.carga().cancelar = true;
    a.carga().status = "parado";
    expect(await cargasQueReservamExecutor(a.db.admin, CLINICA_CARGA)).toHaveLength(1);
    await executarCargaControlada(a.args);
    expect(a.iniciados).toHaveLength(1);
    a.liberar(0);
    await p;
    expect(await cargasQueReservamExecutor(a.db.admin, CLINICA_CARGA)).toHaveLength(0);
  });

  test("intervalo cadenciado é global mesmo com chamadas concorrentes", async () => {
    const a = ambiente(2, 1, true);
    const p = executarCargaControlada(a.args);
    await ate(() => a.iniciados.length === 1);
    const r = await executarCargaControlada(a.args);
    expect(r.aguardandoRitmo).toBe(true);
    expect(r.aguardarMs).toBe(2000);
    a.avancar(2000);
    const q = executarCargaControlada(a.args);
    await ate(() => a.iniciados.length === 2);
    a.liberar(0);
    a.liberar(1);
    await Promise.all([p, q]);
  });

  test("retomada concilia entrada aceita sem executar o modelo outra vez", async () => {
    const a = ambiente(2);
    const d = { leadId: "lead-0", chave: `carga-${RUN_CARGA}-0` };
    a.db.tabelas.whatsapp_mensagens!.push({
      id: d.chave,
      clinica_id: CLINICA_CARGA,
      conversa_id: "conversa-lead-0",
      direction: "in",
      is_teste: true,
      wa_message_id: `test-${d.leadId}-${d.chave}`,
      nina_status: "completed",
    });
    await executarCargaControlada(a.args);
    expect(a.iniciados).toHaveLength(0);
    expect(a.carga().enviadas).toBe(1);
  });
});

test("tempos pareiam chamadas por lote e ferramenta; falta de evento não vira zero", () => {
  const t = (trace_id: string, node_id: string, ms: number, metadata = {}) => ({
    trace_id,
    node_id,
    started_at: new Date(ms).toISOString(),
    metadata,
  });
  const r = temposEtapasCarga([
    t("a", "MODEL_STARTED", 0),
    t("b", "MODEL_STARTED", 100),
    t("a", "MODEL_FINISHED", 1000),
    t("b", "MODEL_FINISHED", 2100),
    t("a", "TOOL_STARTED", 2200, { ferramenta: "agenda" }),
    t("a", "TOOL_FINISHED", 2600, { ferramenta: "agenda" }),
    t("c", "MODEL_STARTED", 3000),
  ]);
  expect(r.modeloMs).toBe(1500);
  expect(r.ferramentasMs).toBe(400);
  expect(r.intervalosIncompletos).toBe(1);
  expect(
    picoIntervalosCarga([
      { inicio: 0, fim: 1000 },
      { inicio: 500, fim: 2000 },
      { inicio: 2000, fim: 3000 },
    ]),
  ).toBe(2);
});
