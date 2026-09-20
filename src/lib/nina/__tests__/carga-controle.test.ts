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
  it("preparação autônoma retoma depois da quarentena conservando os baselines", async () => {
    const agora = Date.now();
    const carga = cargaFicticia({ status: "preparando" });
    carga.config = configComControle(
      { ...(carga.config as any), executor: "carga-v5-servidor" },
      {
        ...controleExecucaoCarga(carga.config),
        lease: {
          token: "antigo",
          fase: "preflight",
          heartbeatEm: new Date(agora - LEASE_CARGA_MS).toISOString(),
          expiraEm: new Date(agora - 1).toISOString(),
          indices: [],
        },
      },
    );
    const db = criarBancoCargaSimulado([carga]);
    expect(estadoControleCarga(carga, agora).ocupado).toBe(true);
    const retomada = await recuperarCargaSemAtividade(db.admin, carga, agora + QUARENTENA_CARGA_MS);
    expect(retomada.status).toBe("preparando");
    expect(retomada.cancelar).toBe(false);
    expect(retomada.preflight).toEqual(carga.preflight);
    expect(controleExecucaoCarga(retomada.config).lease).toBeNull();
  });
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
});
