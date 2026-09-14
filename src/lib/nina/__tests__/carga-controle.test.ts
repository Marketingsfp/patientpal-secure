import { describe, expect, it } from "bun:test";
import {
  estadoControleCarga,
  configComControle,
  controleExecucaoCarga,
  chaveMensagemCarga,
  LEASE_CARGA_MS,
  QUARENTENA_CARGA_MS,
} from "../carga-controle";
import {
  recuperarCargaSemAtividade,
  comLeaseCarga,
  cargasQueReservamExecutor,
} from "../carga-controle.server";
import { executarCargaControlada } from "../carga-execucao.server";
import {
  cargaFicticia,
  criarBancoCargaSimulado,
  promessaControlada,
  CLINICA_CARGA,
  RUN_CARGA,
} from "./fixtures/carga-banco-simulado";

describe("controle de execução da carga (banco e processador simulados)", () => {
  it("parada entre leitura e CAS final libera o próprio lease preservando a parada", async () => {
    const db = criarBancoCargaSimulado();
    const fim = await comLeaseCarga({
      admin: db.admin,
      carga: db.tabelas.nina_teste_carga![0],
      fase: "lote",
      executar: async () => {
        db.disputarProximoUpdate(() =>
          Object.assign(db.tabelas.nina_teste_carga![0], {
            status: "parado",
            cancelar: true,
            updated_at: new Date(Date.now() + 1000).toISOString(),
          }),
        );
      },
    });
    expect(fim.carga.status).toBe("parado");
    expect(fim.ocupado).toBe(false);
    expect(controleExecucaoCarga(fim.carga.config).lease).toBeNull();
  });
  it("heartbeat volta após erro transitório e mantém reserva enquanto processador está vivo", async () => {
    const db = criarBancoCargaSimulado();
    const gate = promessaControlada<void>(),
      iniciou = promessaControlada<void>();
    let agora = Date.now();
    const run = comLeaseCarga({
      admin: db.admin,
      carga: db.tabelas.nina_teste_carga![0],
      fase: "lote",
      agora: () => agora,
      heartbeatMs: 5,
      executar: async (dono) => {
        await dono.alterar({}, [0]);
        iniciou.resolver();
        await gate.promessa;
      },
    });
    await iniciou.promessa;
    db.falharUmaVez("nina_teste_carga", "update", "rede indisponível por um heartbeat");
    await new Promise((r) => setTimeout(r, 8));
    agora += 500_000;
    await new Promise((r) => setTimeout(r, 15));
    const vivo = db.tabelas.nina_teste_carga![0];
    expect(Date.parse(controleExecucaoCarga(vivo.config).lease!.heartbeatEm)).toBe(agora);
    expect((await recuperarCargaSemAtividade(db.admin, vivo, agora)).status).toBe("executando");
    expect(estadoControleCarga(vivo, agora).ocupado).toBe(true);
    gate.resolver();
    await run;
  });
  it("encerra órfão antigo mas preserva atividade recente nas amostras", async () => {
    const antigo = cargaFicticia({
      created_at: "2026-09-07T08:00:00Z",
      updated_at: "2026-09-07T08:00:00Z",
    });
    const db = criarBancoCargaSimulado([antigo]);
    const recuperado = await recuperarCargaSemAtividade(db.admin, antigo);
    expect(recuperado.status).toBe("erro");
    expect(estadoControleCarga(recuperado).recuperada).toBe(true);
    const db2 = criarBancoCargaSimulado([antigo]);
    db2.tabelas.nina_teste_carga_amostras!.push({
      carga_id: RUN_CARGA,
      clinica_id: CLINICA_CARGA,
      created_at: new Date().toISOString(),
    });
    expect((await recuperarCargaSemAtividade(db2.admin, antigo)).status).toBe("executando");
  });
  it("lease expirado fica em quarentena antes de encerrar; nunca libera mensagem incerta para retry", async () => {
    const agora = Date.now();
    const carga = cargaFicticia();
    carga.config = configComControle(carga.config, {
      ...controleExecucaoCarga(carga.config),
      lease: {
        token: "t",
        fase: "lote",
        heartbeatEm: new Date(agora - LEASE_CARGA_MS).toISOString(),
        expiraEm: new Date(agora - 1).toISOString(),
        indices: [0],
      },
    });
    expect(estadoControleCarga(carga, agora)).toMatchObject({
      ocupado: true,
      emQuarentena: true,
      podeRetomar: false,
    });
    const db = criarBancoCargaSimulado([carga]);
    const final = await recuperarCargaSemAtividade(db.admin, carga, agora + QUARENTENA_CARGA_MS);
    expect(final.status).toBe("erro");
    expect(estadoControleCarga(final).indicesIncertos).toEqual([0]);
  });
  it("duas chamadas disputam o CAS e somente um executor entra", async () => {
    const db = criarBancoCargaSimulado();
    const gate = promessaControlada<void>();
    const iniciou = promessaControlada<void>();
    let chamadas = 0;
    const primeira = comLeaseCarga({
      admin: db.admin,
      carga: db.tabelas.nina_teste_carga![0],
      fase: "lote",
      executar: async () => {
        chamadas++;
        iniciou.resolver();
        await gate.promessa;
      },
    });
    await iniciou.promessa;
    const segunda = await comLeaseCarga({
      admin: db.admin,
      carga: await db.admin
        .from("nina_teste_carga")
        .select()
        .maybeSingle()
        .then((r: any) => r.data),
      fase: "lote",
      executar: async () => {
        chamadas++;
      },
    });
    expect(segunda.ocupado).toBe(true);
    expect(chamadas).toBe(1);
    gate.resolver();
    await primeira;
    expect(estadoControleCarga(db.tabelas.nina_teste_carga![0]).ocupado).toBe(false);
  });
  it("parada em rodada viva reserva o executor e nunca vira concluído", async () => {
    const db = criarBancoCargaSimulado();
    const gate = promessaControlada<any>();
    const iniciou = promessaControlada<void>();
    const pendente = executarCargaControlada({
      admin: db.admin,
      clinicaId: CLINICA_CARGA,
      cargaId: RUN_CARGA,
      userId: "user",
      processar: async () => {
        iniciou.resolver();
        return gate.promessa;
      },
    });
    await iniciou.promessa;
    await db.admin
      .from("nina_teste_carga")
      .update({ cancelar: true, status: "parado", finalizado_em: new Date().toISOString() })
      .eq("id", RUN_CARGA);
    expect(await cargasQueReservamExecutor(db.admin, CLINICA_CARGA)).toHaveLength(1);
    gate.resolver({
      reply: "resposta simulada",
      mensagemPersistida: true,
      processamento: "PROCESSADA",
    });
    const fim = await pendente;
    expect(fim.status).toBe("parado");
    expect(estadoControleCarga(db.tabelas.nina_teste_carga![0]).ocupado).toBe(false);
  });
  it("erro de telemetria aguarda todos os processadores antes de liberar lease", async () => {
    const db = criarBancoCargaSimulado();
    const lento = promessaControlada<any>();
    const iniciou = promessaControlada<void>();
    db.falharUmaVez("nina_execucoes", "select");
    let terminou = false;
    const run = executarCargaControlada({
      admin: db.admin,
      clinicaId: CLINICA_CARGA,
      cargaId: RUN_CARGA,
      userId: "user",
      processar: async (d) => {
        if (d.leadId === "lead-1") {
          iniciou.resolver();
          return lento.promessa;
        }
        return { reply: "simulado", execucaoId: "exec-1", processamento: "PROCESSADA" };
      },
    }).then((r) => {
      terminou = true;
      return r;
    });
    await iniciou.promessa;
    await new Promise((r) => setTimeout(r, 5));
    expect(terminou).toBe(false);
    expect(estadoControleCarga(db.tabelas.nina_teste_carga![0]).ocupado).toBe(true);
    lento.resolver({ reply: "simulado", processamento: "PROCESSADA" });
    expect((await run).status).toBe("erro");
    expect(controleExecucaoCarga(db.tabelas.nina_teste_carga![0].config).indicesIncertos).toEqual([
      0,
    ]);
    expect(db.tabelas.nina_teste_carga_amostras).toHaveLength(2);
    expect(db.tabelas.nina_teste_carga_amostras!.find((a) => a.lead_id === "lead-1").status).toBe(
      "ok",
    );
    expect(db.tabelas.nina_teste_carga_amostras!.find((a) => a.lead_id === "lead-0").status).toBe(
      "erro",
    );
    expect(db.tabelas.nina_teste_carga![0].chamadas_modelo).toBe(0);
  });
  it("timeout aguarda término, não repete o item e usa chave sem número de tentativa", async () => {
    const db = criarBancoCargaSimulado([
      cargaFicticia({ plano: [cargaFicticia().plano[0]], total_planejado: 1 }),
    ]);
    let agora = Date.now();
    const chaves: string[] = [];
    const fim = await executarCargaControlada({
      admin: db.admin,
      clinicaId: CLINICA_CARGA,
      cargaId: RUN_CARGA,
      userId: "user",
      agora: () => agora,
      processar: async (d) => {
        chaves.push(d.chave);
        agora += 61_000;
        return { reply: "resposta tardia" };
      },
    });
    expect(fim.status).toBe("concluido");
    expect(chaves).toEqual([chaveMensagemCarga(RUN_CARGA, 0)]);
    expect(db.tabelas.nina_teste_carga_amostras![0].status).toBe("timeout");
  });
  it.each(["DUPLICADA", "AGRUPADA", "SEM_RESPOSTA"])(
    "%s não conta como resposta da Nina nem chamada de modelo",
    async (processamento) => {
      const db = criarBancoCargaSimulado();
      const fim = await executarCargaControlada({
        admin: db.admin,
        clinicaId: CLINICA_CARGA,
        cargaId: RUN_CARGA,
        userId: "user",
        processar: async () => ({ processamento, execucaoId: "exec-velha", reply: null }),
      });
      expect(fim.status).toBe("concluido");
      expect(db.tabelas.nina_teste_carga![0].sucesso).toBe(0);
      expect(db.tabelas.nina_teste_carga![0].chamadas_modelo).toBe(0);
      expect(db.consultas.filter((q) => q.tabela === "nina_execucoes")).toHaveLength(0);
    },
  );
  it("sessão alterada após preflight encerra sem enviar e sem resetar", async () => {
    const db = criarBancoCargaSimulado();
    db.tabelas.nina_teste_leads![0].sessao_seq = 2;
    let chamadas = 0;
    const fim = await executarCargaControlada({
      admin: db.admin,
      clinicaId: CLINICA_CARGA,
      cargaId: RUN_CARGA,
      userId: "user",
      processar: async () => {
        chamadas++;
        return { reply: "simulado" };
      },
    });
    expect(fim.status).toBe("erro");
    expect(fim.erro).toContain("Lead 1");
    expect(chamadas).toBe(1); // Apenas o outro lead, cuja sessão permanece correta.
    expect(
      db.consultas.filter((q) => q.tabela === "nina_teste_leads" && q.operacao !== "select"),
    ).toHaveLength(0);
  });
  it("próximo lote respeita o próximo disparo persistido", async () => {
    const inicial = cargaFicticia();
    inicial.config = { ...(inicial.config as any), conversasSimultaneas: 1, intervaloMs: 60_000 };
    const db = criarBancoCargaSimulado([inicial]);
    let chamadas = 0;
    const args = {
      admin: db.admin,
      clinicaId: CLINICA_CARGA,
      cargaId: RUN_CARGA,
      userId: "user",
      processar: async () => {
        chamadas++;
        return { reply: "simulado" };
      },
    };
    expect((await executarCargaControlada(args)).status).toBe("executando");
    const segunda = await executarCargaControlada(args);
    expect(segunda.aguardandoRitmo).toBe(true);
    expect(chamadas).toBe(1);
  });
  it("ritmo de 1 mensagem/minuto não dispara duas na primeira rodada", async () => {
    const inicial = cargaFicticia();
    inicial.config = { ...(inicial.config as any), mensagensPorMinuto: 1, conversasSimultaneas: 2 };
    const db = criarBancoCargaSimulado([inicial]);
    let agora = Date.now(),
      chamadas = 0;
    const args = {
      admin: db.admin,
      clinicaId: CLINICA_CARGA,
      cargaId: RUN_CARGA,
      userId: "user",
      agora: () => agora,
      processar: async () => {
        chamadas++;
        return { reply: "simulado" };
      },
    };
    expect((await executarCargaControlada(args)).status).toBe("executando");
    expect(chamadas).toBe(1);
    expect((await executarCargaControlada(args)).aguardarMs).toBe(60_000);
    expect(chamadas).toBe(1);
    agora += 60_000;
    expect((await executarCargaControlada(args)).status).toBe("concluido");
    expect(chamadas).toBe(2);
  });
  it("falha conhecida já encerrada registra erro e continua a fila sem reenviar", async () => {
    const inicial = cargaFicticia();
    inicial.config = { ...(inicial.config as any), conversasSimultaneas: 1 };
    const db = criarBancoCargaSimulado([inicial]);
    let chamadas = 0,
      agora = Date.now();
    const fim = await executarCargaControlada({
      admin: db.admin,
      clinicaId: CLINICA_CARGA,
      cargaId: RUN_CARGA,
      userId: "user",
      agora: () => agora,
      esperar: async (ms) => {
        agora += ms;
      },
      processar: async () =>
        ++chamadas === 1
          ? { erro: "bloqueio simulado já encerrado", processamento: "ERRO" }
          : { reply: "simulado" },
    });
    expect(fim.status).toBe("concluido");
    expect(fim.erro).toBeNull();
    expect(chamadas).toBe(2);
    expect(db.tabelas.nina_teste_carga_amostras!.map((a) => a.status)).toEqual(["erro", "ok"]);
  });
});
