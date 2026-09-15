import { describe, expect, test } from "bun:test";
import { executarCargaControlada } from "../carga-execucao.server";
import { continuarCargaPendenteNina } from "../carga-job.server";
import { gravarAmostraCarga, desfechoItemCarga } from "../carga-itens.server";
import {
  configComControle,
  controleExecucaoCarga,
  LEASE_CARGA_MS,
  QUARENTENA_CARGA_MS,
} from "../carga-controle";
import { recuperarCargaSemAtividade } from "../carga-controle.server";
import { metricasWatchdogCarga } from "../watchdog-metricas.server";
import {
  cargaFicticia,
  criarBancoCargaSimulado,
  promessaControlada,
  CLINICA_CARGA,
  RUN_CARGA,
} from "./fixtures/carga-banco-simulado";

function ambiente(quantidade = 2) {
  let agora = Date.now();
  const base = cargaFicticia();
  const carga = cargaFicticia({
    criado_por: "user",
    total_planejado: quantidade,
    config: { ...(base.config as any), executor: "carga-v3-item", conversasSimultaneas: 10 },
    plano: Array.from({ length: quantidade }, (_, i) => ({
      ...base.plano[0],
      indice: i,
      leadId: `lead-${i}`,
      leadIndice: i + 1,
    })),
    preflight: Array.from({ length: quantidade }, (_, i) => ({
      ...base.preflight[0],
      leadId: `lead-${i}`,
    })),
  });
  const db = criarBancoCargaSimulado([carga]);
  db.tabelas.whatsapp_mensagens = [];
  db.tabelas.nina_watchdog_config = [{ id: true, homologacao_ativa: true }];
  let chamadas = 0;
  const entrada = (d: any, estado: string | null = "completed") => {
    const row = {
      id: `entrada-${d.leadId}`,
      clinica_id: CLINICA_CARGA,
      conversa_id: `conversa-${d.leadId}`,
      direction: "in",
      is_teste: true,
      tipo: "text",
      wa_message_id: `test-${d.leadId}-${d.chave}`,
      nina_status: estado,
      created_at: new Date(agora).toISOString(),
    };
    db.tabelas.whatsapp_mensagens!.push(row);
    return row;
  };
  const responder = async (d: any) => {
    chamadas++;
    const m = entrada(d);
    return { reply: "resposta de teste", conversaId: m.conversa_id };
  };
  const args = {
    admin: db.admin,
    clinicaId: CLINICA_CARGA,
    cargaId: RUN_CARGA,
    userId: "user",
    agora: () => agora,
    processar: responder,
  };
  return {
    db,
    args,
    entrada,
    responder,
    chamadas: () => chamadas,
    avancar: (ms = 1000) => {
      agora += ms;
    },
    agora: () => agora,
  };
}

describe("Carga por item — persistência e recuperação sem duplicatas", () => {
  test("pendência não bloqueia outro lead, mas preserva a ordem do próprio lead", async () => {
    const a = ambiente(3),
      carga = a.db.tabelas.nina_teste_carga![0];
    carga.plano[1].leadId = "lead-0";
    a.entrada({ leadId: "lead-0", chave: `carga-${RUN_CARGA}-0` }, "processing");
    await executarCargaControlada(a.args);
    expect(a.db.tabelas.nina_teste_carga_amostras!.map((r) => r.indice)).toEqual([2]);
    expect(a.db.tabelas.whatsapp_mensagens!.map((r) => r.id)).toEqual([
      "entrada-lead-0",
      "entrada-lead-2",
    ]);
    expect((await metricasWatchdogCarga(a.db.admin, carga))?.naoLocalizadas).toBe(0);
    a.avancar();
    expect((await executarCargaControlada(a.args)).aguardandoDesfecho).toBe(true);
    expect(a.chamadas()).toBe(1);
  });
  test("dez entradas concluem em dez requisições, com progresso salvo a cada resposta", async () => {
    const a = ambiente(10);
    for (let i = 1; i <= 10; i++) {
      const r = await executarCargaControlada(a.args);
      expect(a.chamadas()).toBe(i);
      expect(r.enviadas).toBe(i);
      expect(a.db.tabelas.nina_teste_carga_amostras).toHaveLength(i);
      expect(r.status).toBe(i === 10 ? "concluido" : "executando");
      a.avancar();
    }
    expect(a.db.tabelas.whatsapp_mensagens).toHaveLength(10);
    expect(a.db.tabelas.nina_teste_carga![0].sucesso).toBe(10);
  });
  test("texto e success em memória sem entrada/saída comprovada não contam como sucesso", async () => {
    const a = ambiente(1);
    await executarCargaControlada({
      ...a.args,
      processar: async () => ({ reply: "texto", success: true }),
    });
    expect(a.db.tabelas.nina_teste_carga![0].sucesso).toBe(0);
    expect(a.db.tabelas.nina_teste_carga_amostras![0].erro).toBe("ENTRADA_NAO_CONFIRMADA");
  });
  test("queda após entregar preserva sucesso; não exige retorno da chamada", async () => {
    const a = ambiente(1);
    await executarCargaControlada({
      ...a.args,
      processar: async (d) => {
        a.entrada(d);
        throw Error("queda");
      },
    });
    expect(a.db.tabelas.nina_teste_carga![0].sucesso).toBe(1);
  });
  test("queda após aceitar aguarda watchdog; conclusão posterior não gera novamente", async () => {
    const a = ambiente(1);
    const r = await executarCargaControlada({
      ...a.args,
      processar: async (d) => {
        a.entrada(d, "processing");
        throw Error("queda");
      },
    });
    expect(r.aguardandoDesfecho).toBe(true);
    expect(a.db.tabelas.nina_teste_carga_amostras).toHaveLength(0);
    await executarCargaControlada(a.args);
    expect(a.chamadas()).toBe(0);
    a.db.tabelas.whatsapp_mensagens![0].nina_status = "completed";
    expect((await executarCargaControlada(a.args)).status).toBe("concluido");
    expect(a.chamadas()).toBe(0);
  });
  test("queda entre amostra e contador retoma o próximo índice, nunca a resposta anterior", async () => {
    const a = ambiente();
    const carga = a.db.tabelas.nina_teste_carga![0];
    await gravarAmostraCarga(a.db.admin, carga, carga.plano[0], { status: "ok" });
    expect(carga.enviadas).toBe(0);
    const r = await executarCargaControlada(a.args);
    expect(r.status).toBe("concluido");
    expect(r.enviadas).toBe(2);
    expect(a.db.tabelas.whatsapp_mensagens![0].id).toBe("entrada-lead-1");
  });
  test("persistir o mesmo resultado duas vezes mantém uma amostra imutável", async () => {
    const a = ambiente(1),
      carga = a.db.tabelas.nina_teste_carga![0];
    await gravarAmostraCarga(a.db.admin, carga, carga.plano[0], { status: "ok" });
    await gravarAmostraCarga(a.db.admin, carga, carga.plano[0], { status: "erro" });
    expect(a.db.tabelas.nina_teste_carga_amostras).toHaveLength(1);
    expect(a.db.tabelas.nina_teste_carga_amostras![0].status).toBe("ok");
  });
  test("falha ao registrar a amostra permite conciliação sem repetir modelo", async () => {
    const a = ambiente(1);
    a.db.falharUmaVez("nina_teste_carga_amostras", "insert");
    expect((await executarCargaControlada(a.args)).status).toBe("executando");
    expect(a.chamadas()).toBe(1);
    expect((await executarCargaControlada(a.args)).status).toBe("concluido");
    expect(a.chamadas()).toBe(1);
  });
  test("duas requisições não iniciam dois modelos nem o mesmo índice", async () => {
    const a = ambiente(),
      entrou = promessaControlada<void>(),
      gate = promessaControlada<any>();
    const run = executarCargaControlada({
      ...a.args,
      processar: async (d) => {
        await a.responder(d);
        entrou.resolver();
        return gate.promessa;
      },
    });
    await entrou.promessa;
    expect((await executarCargaControlada(a.args)).ocupado).toBe(true);
    expect(a.chamadas()).toBe(1);
    gate.resolver({ reply: "ok" });
    await run;
    expect(a.chamadas()).toBe(1);
  });
  test("sessão alterada encerra antes de chamar o modelo", async () => {
    const a = ambiente();
    a.db.tabelas.nina_teste_leads![0].sessao_seq = 2;
    expect((await executarCargaControlada(a.args)).status).toBe("erro");
    expect(a.chamadas()).toBe(0);
  });
  test("timeout mede resposta persistida, não dispara outra tentativa", async () => {
    const a = ambiente(1);
    await executarCargaControlada({
      ...a.args,
      processar: async (d) => {
        a.avancar(61000);
        return a.responder(d);
      },
    });
    expect(a.db.tabelas.nina_teste_carga_amostras![0].status).toBe("timeout");
    expect(a.chamadas()).toBe(1);
  });
  test("ritmo persistido impede adiantar o próximo item", async () => {
    const a = ambiente();
    a.db.tabelas.nina_teste_carga![0].config.mensagensPorMinuto = 1;
    await executarCargaControlada(a.args);
    expect((await executarCargaControlada(a.args)).aguardarMs).toBe(60000);
    expect(a.chamadas()).toBe(1);
    a.avancar(60000);
    expect((await executarCargaControlada(a.args)).status).toBe("concluido");
  });
  test("erro de telemetria não apaga a entrega nem impede o próximo item", async () => {
    const a = ambiente(1);
    a.db.falharUmaVez("nina_execucoes", "select");
    await executarCargaControlada({
      ...a.args,
      processar: async (d) => ({ ...(await a.responder(d)), execucaoId: "exec" }),
    });
    expect(a.db.tabelas.nina_teste_carga![0].sucesso).toBe(1);
    expect(a.db.tabelas.nina_teste_carga![0].chamadas_modelo).toBe(0);
  });
  test("execução com lease perdido recupera o cursor, respeitando quarentena", async () => {
    const a = ambiente(),
      carga = a.db.tabelas.nina_teste_carga![0];
    carga.config = configComControle(carga.config, {
      ...controleExecucaoCarga(carga.config),
      lease: {
        token: "morto",
        fase: "lote",
        indices: [0],
        heartbeatEm: new Date(a.agora() - LEASE_CARGA_MS).toISOString(),
        expiraEm: new Date(a.agora() - 1).toISOString(),
      },
    });
    expect(
      controleExecucaoCarga((await recuperarCargaSemAtividade(a.db.admin, carga, a.agora())).config)
        .lease,
    ).not.toBeNull();
    const r = await recuperarCargaSemAtividade(a.db.admin, carga, a.agora() + QUARENTENA_CARGA_MS);
    expect(r.status).toBe("executando");
    expect(controleExecucaoCarga(r.config).lease).toBeNull();
    expect(controleExecucaoCarga(r.config).motivo).toBe("RETOMADA_POR_ITEM");
  });
  test("job continua fila com página fechada e revalida autorização", async () => {
    const a = ambiente(1);
    expect((await continuarCargaPendenteNina(a.db.admin, a.responder)).cargas).toBe(1);
    expect(a.chamadas()).toBe(1);
    expect((await continuarCargaPendenteNina(a.db.admin, a.responder)).cargas).toBe(0);
    const semPermissao = ambiente(1);
    semPermissao.db.tabelas.clinica_memberships = [];
    expect(
      (await continuarCargaPendenteNina(semPermissao.db.admin, semPermissao.responder)).cargas,
    ).toBe(0);
    expect(semPermissao.chamadas()).toBe(0);
  });
  test("job desligado ou teste parado não inicia mensagem", async () => {
    const a = ambiente(1);
    a.db.tabelas.nina_watchdog_config![0].homologacao_ativa = false;
    expect((await continuarCargaPendenteNina(a.db.admin, a.responder)).cargas).toBe(0);
    a.db.tabelas.nina_watchdog_config![0].homologacao_ativa = true;
    a.db.tabelas.nina_teste_carga![0].status = "parado";
    expect((await continuarCargaPendenteNina(a.db.admin, a.responder)).cargas).toBe(0);
    expect(a.chamadas()).toBe(0);
  });
  test("saída pending e resposta de outra conversa não comprovam entrega", async () => {
    const a = ambiente(1),
      carga = a.db.tabelas.nina_teste_carga![0];
    const m = a.entrada({ leadId: "lead-0", chave: `carga-${RUN_CARGA}-0` }, null);
    const out = {
      ...m,
      direction: "out",
      status: "pending",
      wa_message_id: m.wa_message_id + "-reply",
    };
    a.db.tabelas.whatsapp_mensagens!.push(out);
    expect((await desfechoItemCarga(a.db.admin, carga, carga.plano[0])).tipo).toBe("terminal");
    out.status = "sent";
    out.conversa_id = "outra";
    expect(
      ((await desfechoItemCarga(a.db.admin, carga, carga.plano[0])) as any).resultado.status,
    ).toBe("erro");
    out.conversa_id = m.conversa_id;
    expect(
      ((await desfechoItemCarga(a.db.admin, carga, carga.plano[0])) as any).resultado.status,
    ).toBe("ok");
  });
  test("painel mostra 10 entradas e 8 saídas mesmo com contador legado zerado", async () => {
    const a = ambiente(10),
      carga = a.db.tabelas.nina_teste_carga![0];
    for (let i = 0; i < 10; i++) {
      const m = a.entrada({ leadId: `lead-${i}`, chave: `carga-${RUN_CARGA}-${i}` }, null);
      if (i < 8)
        a.db.tabelas.whatsapp_mensagens!.push({
          ...m,
          id: `saida-${i}`,
          direction: "out",
          wa_message_id: m.wa_message_id + "-reply",
          status: "sent",
        });
    }
    carga.finalizado_em = new Date().toISOString();
    const r = await metricasWatchdogCarga(a.db.admin, carga);
    expect(r).toMatchObject({
      recebidas: 10,
      completed: 8,
      pendentes: 2,
      esperadas: 10,
      semRastreamento: 2,
      testeFalhou: true,
    });
    expect(a.db.tabelas.whatsapp_mensagens![0].nina_status).toBeNull();
  });
});
