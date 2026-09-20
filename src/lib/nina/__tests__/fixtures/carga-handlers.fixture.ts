/** Processo isolado: mocks de fronteira executam os handlers reais sem rede. */
import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  cargaFicticia,
  criarBancoCargaSimulado,
  promessaControlada,
  CLINICA_CARGA,
  RUN_CARGA,
} from "./carga-banco-simulado";
import { normalizarConfig, MODELO_LUNA } from "../../carga";
import { validarPlanoCarga, planoMensagensIA } from "../../carga-planejamento";
import { controleExecucaoCarga, estadoControleCarga } from "../../carga-controle";

const db = criarBancoCargaSimulado([]);
let chamadas: Array<{ chave: string; texto: string; leadId: string }> = [];
let resets: any[] = [],
  redacoes = 0;
let falharReset: string | null = null;
let depoisReset: (() => Promise<void>) | null = null;
let processador = async (_data: any): Promise<any> => ({
  reply: "resposta simulada",
  mensagemPersistida: true,
  processamento: "PROCESSADA",
});
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validar = (v: any) => v;
    const q: any = {
      middleware: () => q,
      inputValidator: (fn: any) => {
        validar = fn;
        return q;
      },
      handler: (fn: any) => (arg: any) =>
        fn({ data: validar(arg.data), context: { userId: "user", supabase: db.admin } }),
    };
    return q;
  },
}));
mock.module("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db.admin }));
mock.module("@/lib/nina/carga-redacao-luna.server", () => ({
  gerarMensagensPlanoLuna: async (plano: any) => {
    expect(db.locks.size).toBe(0);
    redacoes++;
    return planoMensagensIA(plano).map((p) => ({ ...p, texto: `Luna: ${p.texto}` }));
  },
}));
mock.module("@/lib/nina/teste-console.server", () => ({
  garantirLeads: async () => db.tabelas.nina_teste_leads,
  carregarLead: async (_admin: any, clinicaId: string, id: string) =>
    db.tabelas.nina_teste_leads!.find((l) => l.id === id && l.clinica_id === clinicaId),
  resetarLeadTeste: async (_admin: any, entrada: any) => {
    resets.push(entrada);
    if (entrada.leadId === falharReset) throw new Error("reset simulado falhou");
    const lead = db.tabelas.nina_teste_leads!.find((l) => l.id === entrada.leadId)!;
    const anterior = lead.sessao_seq,
      ciclo = lead.ciclo_id,
      conversa = lead.conversa_id;
    if (conversa) {
      (db.tabelas.atend_conversas ??= []).push({
        id: conversa,
        clinica_id: CLINICA_CARGA,
        status: "finished",
        ai_enabled: false,
        nina_fluxo_estado: null,
      });
      lead.sessao_seq++;
      lead.conversa_id = null;
      lead.ciclo_id = null;
    }
    await depoisReset?.();
    return {
      ok: true,
      jaResolvida: !conversa,
      sessao: lead.sessao_seq,
      sessaoAnterior: anterior,
      cicloEncerrado: ciclo,
      agendamentosRemovidos: 0,
    };
  },
  processarMensagemTeste: async (data: any) => {
    chamadas.push(data);
    return processador(data);
  },
}));
const f = await import("../../carga.functions");
const input = () => ({
  clinicaId: CLINICA_CARGA,
  nome: "Carga simulada",
  confirmado: true,
  usarLuna: false,
  config: normalizarConfig({
    perfil: "customizado",
    leadsAtivos: 2,
    totalMensagens: 2,
    conversasSimultaneas: 2,
    intervaloMs: 0,
    mensagensPorMinuto: 240,
  }),
});
const chamar = (fn: any, data: any) => fn({ data });
beforeEach(() => {
  Object.assign(db.tabelas, criarBancoCargaSimulado([]).tabelas);
  db.consultas.length = 0;
  db.locks.clear();
  chamadas = [];
  resets = [];
  redacoes = 0;
  falharReset = null;
  depoisReset = null;
  db.tabelas.atend_conversas = [];
  processador = async () => ({
    reply: "resposta simulada",
    mensagemPersistida: true,
    processamento: "PROCESSADA",
  });
});

describe("handlers reais de carga com fronteiras simuladas", () => {
  it("duas criações concorrentes gravam somente um teste", async () => {
    const r = await Promise.allSettled([
      chamar(f.criarTesteCarga, input()),
      chamar(f.criarTesteCarga, input()),
    ]);
    expect(r.filter((i) => i.status === "fulfilled")).toHaveLength(1);
    expect(db.tabelas.nina_teste_carga).toHaveLength(1);
    expect(chamadas).toHaveLength(0);
  });
  it("início confirmado reseta os 10 leads; retomada preserva baselines e gate impede envio prematuro", async () => {
    db.tabelas.nina_teste_leads![7].conversa_id = "conversa-lead08";
    const criado = await chamar(f.criarTesteCarga, { ...input(), confirmado: false });
    expect(resets).toHaveLength(0);
    const args = { clinicaId: CLINICA_CARGA, cargaId: criado.carga.id };
    const primeiro = await chamar(f.prepararLeadsTesteCarga, args);
    expect(primeiro.status).toBe("preparando");
    expect(primeiro.prontos).toBe(3);
    expect(primeiro.total).toBe(10);
    await chamar(f.executarLoteCarga, args);
    expect(chamadas).toHaveLength(0);
    await chamar(f.listarTestesCarga, { clinicaId: CLINICA_CARGA });
    expect(resets).toHaveLength(3);
    for (let i = 0; i < 3; i++) await chamar(f.prepararLeadsTesteCarga, args);
    const final = await chamar(f.prepararLeadsTesteCarga, args);
    expect(final.status).toBe("executando");
    expect(final.prontos).toBe(10);
    expect(resets).toHaveLength(10);
    expect(new Set(resets.map((r) => r.leadId)).size).toBe(10);
    expect(resets.every((r) => r.manual && r.removerAgendamentos === false)).toBe(true);
    expect(db.tabelas.nina_teste_leads![7].sessao_seq).toBe(2);
    const detalhe = await chamar(f.detalheTesteCarga, args);
    expect(detalhe.preflight.leadsTotal).toBe(10);
    expect(detalhe.preflight.leadsPreparados).toBe(10);
  });
  it("duas chamadas executar não enviam o mesmo índice", async () => {
    db.tabelas.nina_teste_carga!.push(cargaFicticia());
    const gate = promessaControlada<any>(),
      iniciou = promessaControlada<void>();
    processador = async () => {
      iniciou.resolver();
      return gate.promessa;
    };
    const args = { clinicaId: CLINICA_CARGA, cargaId: RUN_CARGA };
    const primeira = chamar(f.executarLoteCarga, args);
    await iniciou.promessa;
    const segunda = await chamar(f.executarLoteCarga, args);
    expect(segunda.ocupado).toBe(true);
    gate.resolver({ reply: "simulado", processamento: "PROCESSADA" });
    expect((await primeira).status).toBe("executando");
    expect(chamadas).toHaveLength(1);
    expect(new Set(chamadas.map((c) => c.chave)).size).toBe(1);
  });
  it("parar no meio da chamada não permite outro teste nem conclusão tardia", async () => {
    db.tabelas.nina_teste_carga!.push(cargaFicticia());
    const gate = promessaControlada<any>(),
      iniciou = promessaControlada<void>();
    processador = async () => {
      iniciou.resolver();
      return gate.promessa;
    };
    const args = { clinicaId: CLINICA_CARGA, cargaId: RUN_CARGA };
    const emVoo = chamar(f.executarLoteCarga, args);
    await iniciou.promessa;
    const parada = await chamar(f.pararTesteCarga, args);
    expect(parada.status).toBe("parado");
    expect(parada.ocupado).toBe(true);
    await expect(chamar(f.criarTesteCarga, input())).rejects.toThrow("ainda em processamento");
    gate.resolver({ reply: "simulado", processamento: "PROCESSADA" });
    expect((await emVoo).status).toBe("parado");
  });
  it("falha antes da entrada é registrada por item, sem reenviar o índice", async () => {
    db.tabelas.nina_teste_carga!.push(cargaFicticia());
    processador = async () => {
      throw new Error("falha simulada do processador");
    };
    const args = { clinicaId: CLINICA_CARGA, cargaId: RUN_CARGA };
    expect((await chamar(f.executarLoteCarga, args)).status).toBe("executando");
    const lista = await chamar(f.listarTestesCarga, { clinicaId: CLINICA_CARGA });
    expect(lista.testes[0].erros).toBe(1);
    expect(db.tabelas.nina_teste_carga_amostras![0].erro).toBe(
      "PROCESSADOR_FALHOU_ANTES_DA_ENTRADA",
    );
    expect(lista.versaoExecutor).toBe("carga-v4-paralela");
  });
  it("falha de reset persiste identificação do lead, mantém gate fechado e não envia", async () => {
    db.tabelas.nina_teste_leads![0].conversa_id = "conversa-ativa";
    falharReset = "lead-0";
    const criado = await chamar(f.criarTesteCarga, input());
    const resultado = await chamar(f.prepararLeadsTesteCarga, {
      clinicaId: CLINICA_CARGA,
      cargaId: criado.carga.id,
    });
    expect(resultado.status).toBe("erro");
    expect(resultado.erro).toContain("reset simulado falhou");
    expect(db.tabelas.nina_teste_leads![0].conversa_id).toBe("conversa-ativa");
    expect(controleExecucaoCarga(db.tabelas.nina_teste_carga![0].config).erro).toContain("01");
    await chamar(f.executarLoteCarga, { clinicaId: CLINICA_CARGA, cargaId: criado.carga.id });
    expect(chamadas).toHaveLength(0);
  });
  it("lista recupera órfão antigo e preserva o ativo recente", async () => {
    db.tabelas.nina_teste_carga!.push(
      cargaFicticia({
        id: "33333333-3333-4333-8333-333333333333",
        created_at: "2026-09-07T08:00:00Z",
        updated_at: "2026-09-07T08:00:00Z",
      }),
      cargaFicticia(),
    );
    const lista = await chamar(f.listarTestesCarga, { clinicaId: CLINICA_CARGA });
    expect(lista.testes.find((c: any) => c.id === RUN_CARGA).status).toBe("executando");
    expect(lista.testes.find((c: any) => c.id !== RUN_CARGA).status).toBe("erro");
    expect(chamadas).toHaveLength(0);
  });
  it("plano Sol é redigido por Luna antes da trava; salva fila e modelos corretos", async () => {
    const i = input();
    const plano = validarPlanoCarga({
      versao: 1,
      pedido: "Teste saudação",
      resumo: "Saudação e pergunta",
      modelo: "openai/gpt-5.6-sol",
      config: i.config,
      cenarios: [
        {
          id: "c1",
          titulo: "Saudação",
          objetivo: "Recepção",
          mensagens: ["oi revisado", "aceita PIX revisado?"],
          verificacoes: ["Resposta corresponde à fonte"],
        },
      ],
      alertas: [],
    });
    const criado = await chamar(f.criarTesteCarga, { ...i, usarLuna: true, planoIA: plano });
    const run = db.tabelas.nina_teste_carga!.find((c) => c.id === criado.carga.id)!;
    expect(run.modelo_gerador).toBe(MODELO_LUNA);
    expect(run.plano.map((p: any) => p.mensagem)).toEqual([
      "Luna: oi revisado",
      "Luna: oi revisado",
      "Luna: aceita PIX revisado?",
      "Luna: aceita PIX revisado?",
    ]);
    expect(run.config.planoIA).toEqual(plano);
    expect(estadoControleCarga(run).podeRetomar).toBe(true);
    expect(chamadas).toHaveLength(0);
    expect(redacoes).toBe(1);
    expect(resets).toHaveLength(0);
  });
  it("parar durante preflight impede o próximo reset e nunca abre o gate", async () => {
    const criado = await chamar(f.criarTesteCarga, input());
    const args = { clinicaId: CLINICA_CARGA, cargaId: criado.carga.id };
    depoisReset = async () => {
      await chamar(f.pararTesteCarga, args);
    };
    const resultado = await chamar(f.prepararLeadsTesteCarga, args);
    expect(resultado.status).toBe("parado");
    expect(resets).toHaveLength(1);
    await chamar(f.prepararLeadsTesteCarga, args);
    expect(resets).toHaveLength(1);
    expect(chamadas).toHaveLength(0);
  });
  it("gate revalida os 10 leads e recusa sessão usada depois do baseline", async () => {
    const criado = await chamar(f.criarTesteCarga, input());
    const args = { clinicaId: CLINICA_CARGA, cargaId: criado.carga.id };
    await chamar(f.prepararLeadsTesteCarga, args);
    db.tabelas.nina_teste_leads![0].conversa_id = "nova-conversa-operador";
    for (let i = 0; i < 3; i++) await chamar(f.prepararLeadsTesteCarga, args);
    expect(db.tabelas.nina_teste_carga![0].status).toBe("erro");
    expect(db.tabelas.nina_teste_leads![0].conversa_id).toBe("nova-conversa-operador");
    expect(resets.filter((r) => r.leadId === "lead-0")).toHaveLength(1);
    expect(chamadas).toHaveLength(0);
  });
});
