/**
 * Bateria por profissional ponta a ponta no executor real da carga, com banco simulado.
 * A Nina e a Luna são simuladas; agendar ocupa uma vaga "DISPONIVEL" da mesma forma que a
 * ferramenta real (UPDATE no próprio registro da vaga) e a devolução precisa desfazê-lo.
 */
import { describe, expect, test } from "bun:test";
import { normalizarConfig } from "../carga";
import {
  consultasDoCatalogo,
  montarCenariosBateria,
  montarItensBateria,
  VERSAO_BATERIA,
  type CenarioBateria,
} from "../carga-bateria";
import { executarCargaControlada } from "../carga-execucao.server";
import { EXECUTOR_CARGA_SERVIDOR } from "../carga-paralela";
import type { RespostaPacienteLuna, TurnoConversaLuna } from "../carga-redacao-luna.server";
import {
  cargaFicticia,
  criarBancoCargaSimulado,
  CLINICA_CARGA,
  RUN_CARGA,
} from "./fixtures/carga-banco-simulado";

const INICIO = Date.parse("2026-09-25T13:00:00Z");
const SLOT = "slot-iarmila-0800";

const catalogo = consultasDoCatalogo([
  {
    id: "p-iarmila",
    nome: "Iarmila Ruzena",
    medico_id: "m-iarmila",
    observacao_publica: [
      "CONSULTA ENDOCRINOLOGIA",
      "Especialidade: ENDOCRINOLOGIA",
      "Dinheiro: R$ 120,00",
      "Pix/cartão: R$ 145,00",
      "Observação: Agendado",
    ].join("\n"),
  },
  {
    id: "p-alex",
    nome: "Alex Louza",
    medico_id: "m-alex",
    observacao_publica: [
      "CONSULTA CARDIOLOGIA",
      "Especialidade: CARDIOLOGIA",
      "Dinheiro: R$ 150,00",
      "Observação: Ordem de chegada",
    ].join("\n"),
  },
]);

function ambiente(
  opcoes: { maxTokens?: number; tokensLuna?: number; falharAposAgendar?: boolean } = {},
) {
  let agora = INICIO;
  const cenarios = montarCenariosBateria({
    consultas: catalogo,
    vagasPorMedico: { "m-iarmila": 1, "m-alex": 3 },
    variacoesPorConsulta: 1,
  });
  const leads = Array.from({ length: 10 }, (_, i) => ({ id: `lead-${i}`, indice: i + 1 }));
  const plano = montarItensBateria(cenarios, leads, 4);
  const leadDo = (medicoId: string) =>
    plano.find((i) => cenarios.find((c) => c.id === i.cenarioId)?.medicoId === medicoId)!.leadId;
  const leadAlex = leadDo("m-alex");
  const leadIarmila = leadDo("m-iarmila");
  const base = cargaFicticia();
  const carga = cargaFicticia({
    total_planejado: plano.length,
    criado_por: "user",
    iniciado_em: new Date(INICIO).toISOString(),
    config: {
      ...normalizarConfig({
        perfil: "customizado",
        modoEnvio: "simultaneo",
        leadsAtivos: 2,
        conversasSimultaneas: 2,
        totalMensagens: 8,
        duracaoMaxS: 1800,
        timeoutS: 120,
        maxTokens: opcoes.maxTokens ?? 200_000,
      }),
      executor: EXECUTOR_CARGA_SERVIDOR,
      _bateria: {
        versao: VERSAO_BATERIA,
        turnos: 4,
        esperaAposReinicioMs: 15_000,
        janelaVagasDias: 60,
        duracaoMaxS: 3600,
        cenarios,
      },
    } as any,
    plano,
    preflight: ["lead-0", "lead-1"].map((leadId) => ({ ...base.preflight[0], leadId, sessao: 1 })),
  });
  const db = criarBancoCargaSimulado([carga]);
  // Reinício da carga acabou de acontecer: a primeira mensagem precisa esperar.
  for (const lead of db.tabelas.nina_teste_leads!)
    lead.resolvido_em = new Date(INICIO).toISOString();
  db.tabelas.whatsapp_mensagens = [];
  db.tabelas.atend_conversa_eventos = [];
  db.tabelas.agendamentos = [
    {
      id: SLOT,
      clinica_id: CLINICA_CARGA,
      medico_id: "m-iarmila",
      inicio: "2026-10-01T11:00:00.000Z",
      paciente_id: null,
      paciente_nome: "DISPONIVEL",
      status: "agendado",
      procedimento: null,
      observacoes: null,
      data_pagamento: null,
      orcamento_id: null,
      tipo_atendimento: "particular",
      forma_pagamento_prevista: null,
      is_mock_data: false,
      origem_integracao: null,
      id_externo: null,
    },
  ];
  let sequencia = 0;
  const hora = () => new Date(INICIO + ++sequencia * 1000).toISOString();
  const enviadas: { leadId: string; texto: string }[] = [];
  const processar = async (d: any) => {
    enviadas.push({ leadId: d.leadId, texto: d.texto });
    const lead = db.tabelas.nina_teste_leads!.find((l) => l.id === d.leadId)!;
    lead.conversa_id ??= `conversa-${d.leadId}`;
    const conversa = lead.conversa_id;
    db.tabelas.whatsapp_mensagens!.push({
      id: d.chave,
      clinica_id: CLINICA_CARGA,
      conversa_id: conversa,
      direction: "in",
      is_teste: true,
      wa_message_id: `test-${d.leadId}-${d.chave}`,
      nina_status: "completed",
      body: d.texto,
      created_at: hora(),
    });
    let reply: string;
    if (d.leadId === leadAlex)
      reply =
        "O atendimento do Dr. Alex é por ordem de chegada, a partir das 7h. Consulta R$ 150,00.";
    else if (/08:00/.test(d.texto)) {
      // Mesmo efeito da ferramenta real: grava por cima do próprio registro da vaga.
      Object.assign(db.tabelas.agendamentos!.find((a) => a.id === SLOT)!, {
        paciente_id: "paciente-teste",
        paciente_nome: "[TESTE NINA] Simulação Teste 01",
        procedimento: "CONSULTA ENDOCRINOLOGIA",
        observacoes: "TESTE — agendado pela Nina (Homologação)",
        is_mock_data: true,
        origem_integracao: "nina_homologacao",
        id_externo: `${conversa}|m-iarmila|2026-10-01T11:00:00.000Z`,
      });
      reply = "Agendado! Quinta, 01/10, às 08:00 com a Dra. Iarmila. Valor R$ 120,00 no dinheiro.";
    } else
      reply =
        "Temos a Dra. Iarmila na quinta às 08:00. Consulta R$ 120,00 no dinheiro. Posso agendar?";
    db.tabelas.whatsapp_mensagens!.push({
      id: `${d.chave}-reply`,
      clinica_id: CLINICA_CARGA,
      conversa_id: conversa,
      direction: "out",
      enviada_por: "nina",
      body: reply,
      created_at: hora(),
    });
    return { reply, conversaId: conversa, transferida: false };
  };
  const historicos: { cenario: string; historico: TurnoConversaLuna[] }[] = [];
  const paciente = async (
    c: CenarioBateria,
    historico: TurnoConversaLuna[],
  ): Promise<RespostaPacienteLuna> => {
    historicos.push({ cenario: c.id, historico });
    const tokens = { entrada: opcoes.tokensLuna ?? 100, saida: 10 };
    const ultima = historico.at(-1)?.texto ?? "";
    if (opcoes.falharAposAgendar && /Agendado!/.test(ultima))
      throw new Error("Lead 02: falha simulada depois do agendamento");
    if (/Agendado!|ordem de chegada/.test(ultima))
      return {
        acao: "encerrar",
        texto: "",
        motivo: /Agendado/.test(ultima) ? "agendado" : "orientado_chegada",
        tokens,
      };
    if (/Posso agendar/.test(ultima))
      return {
        acao: "enviar",
        texto: "Pode ser quinta às 08:00, Simulação Teste 01, 10/05/1990",
        motivo: "",
        tokens,
      };
    return {
      acao: "enviar",
      texto:
        c.medicoId === "m-alex"
          ? "Bom dia, queria consulta de cardiologista"
          : "Oi, queria marcar endocrinologista",
      motivo: "",
      tokens,
    };
  };
  const args = {
    admin: db.admin,
    clinicaId: CLINICA_CARGA,
    cargaId: RUN_CARGA,
    userId: "user",
    processar,
    paciente,
    agora: () => agora,
  };
  return {
    db,
    cenarios,
    leadAlex,
    leadIarmila,
    enviadas,
    historicos,
    args,
    carga: () => db.tabelas.nina_teste_carga![0],
    amostras: () => db.tabelas.nina_teste_carga_amostras!,
    avancar: (ms: number) => {
      agora += ms;
    },
    /** Chama o executor como o job do servidor faria, avançando o relógio a cada rodada. */
    async rodar(vezes = 80) {
      for (let i = 0; i < vezes && db.tabelas.nina_teste_carga![0].status === "executando"; i++) {
        await executarCargaControlada(args);
        agora += 6_000;
      }
    },
  };
}

describe("bateria por profissional no executor da carga", () => {
  test("primeira mensagem espera o reinício assentar; nada é enviado antes de 15 s", async () => {
    const a = ambiente();
    for (let i = 0; i < 4; i++) await executarCargaControlada(a.args);
    expect(a.enviadas).toHaveLength(0);
    expect(a.amostras()).toHaveLength(0);
    a.avancar(16_000);
    await executarCargaControlada(a.args);
    expect(a.enviadas).toHaveLength(1);
  });

  test("conversa completa: agenda, verifica, devolve a vaga e conclui sem reiniciar leads", async () => {
    const a = ambiente();
    a.avancar(16_000);
    await a.rodar();
    expect(a.carga().status).toBe("concluido");
    expect(a.enviadas.map((m) => m.texto)).toEqual(
      expect.arrayContaining([
        "Oi, queria marcar endocrinologista",
        "Pode ser quinta às 08:00, Simulação Teste 01, 10/05/1990",
        "Bom dia, queria consulta de cardiologista",
      ]),
    );
    expect(a.enviadas).toHaveLength(3);
    const porCenario = (id: string, status: string) =>
      a.amostras().filter((x) => x.resultado?.cenarioId === id && x.status === status);
    const endo = a.cenarios.find((c) => c.medicoId === "m-iarmila")!;
    const cardio = a.cenarios.find((c) => c.medicoId === "m-alex")!;
    const verificacaoEndo = porCenario(endo.id, "verificado")[0]!.resultado;
    expect(verificacaoEndo.avaliacao).toMatchObject({
      resultado: "aprovado",
      preco: "citado",
      agendouComAlvo: true,
    });
    expect(verificacaoEndo.agendamentos).toEqual([
      expect.objectContaining({ id: SLOT, medicoId: "m-iarmila" }),
    ]);
    expect(porCenario(endo.id, "devolvido")[0]!.resultado.vagasDevolvidas).toBe(1);
    expect(porCenario(endo.id, "dispensado").map((x) => x.resultado.fim)).toEqual([
      "agendado",
      "cenario_encerrado",
    ]);
    expect(porCenario(cardio.id, "verificado")[0]!.resultado.avaliacao.resultado).toBe("aprovado");
    // A vaga voltou a ser a mesma vaga livre, sem sobra do agendamento de teste.
    expect(a.db.tabelas.agendamentos![0]).toMatchObject({
      id: SLOT,
      paciente_id: null,
      paciente_nome: "DISPONIVEL",
      status: "agendado",
      procedimento: null,
      observacoes: null,
      is_mock_data: false,
      origem_integracao: null,
      id_externo: null,
    });
    // Regra da homologação: a bateria nunca reinicia o lead.
    expect(a.db.tabelas.nina_teste_leads!.every((l) => l.sessao_seq === 1)).toBe(true);
    // A Luna sempre viu só as mensagens trocadas na conversa.
    const segunda = a.historicos.find((h) => h.cenario === endo.id && h.historico.length === 2)!;
    expect(segunda.historico.map((t) => t.autor)).toEqual(["paciente", "nina"]);
    // Latência só nas mensagens enviadas; passos internos não entram nas métricas.
    expect(
      a
        .amostras()
        .filter((x) => x.latencia_ms !== null)
        .every((x) => x.status === "ok"),
    ).toBe(true);
  });

  test("conversa já aberta antes da primeira mensagem interrompe a bateria", async () => {
    const a = ambiente();
    a.db.tabelas.nina_teste_leads!.find((l) => l.id === a.leadAlex)!.conversa_id =
      "conversa-do-operador";
    a.avancar(16_000);
    await expect(executarCargaControlada(a.args)).rejects.toThrow("já estava aberta");
    expect(a.carga().status).toBe("erro");
    expect(a.enviadas).toHaveLength(0);
  });

  test("erro fatal depois do agendamento também devolve a vaga ocupada", async () => {
    const a = ambiente({ falharAposAgendar: true });
    a.avancar(16_000);
    for (let i = 0; i < 40 && a.carga().status === "executando"; i++) {
      await executarCargaControlada(a.args).catch(() => undefined);
      a.avancar(6_000);
    }
    expect(a.enviadas.map((m) => m.texto)).toContain(
      "Pode ser quinta às 08:00, Simulação Teste 01, 10/05/1990",
    );
    expect(a.carga().status).toBe("erro");
    expect(a.db.tabelas.agendamentos![0]).toMatchObject({
      paciente_nome: "DISPONIVEL",
      is_mock_data: false,
      id_externo: null,
    });
  });

  test("orçamento conta os tokens da Luna e, ao estourar, devolve as vagas ocupadas", async () => {
    // 4 escritas da Luna (410 tokens cada) cabem até o agendamento; a 5ª já não cabe.
    const a = ambiente({ maxTokens: 1_500, tokensLuna: 400 });
    a.avancar(16_000);
    await a.rodar();
    // A vaga chegou a ser ocupada antes do orçamento estourar.
    expect(a.enviadas.map((m) => m.texto)).toContain(
      "Pode ser quinta às 08:00, Simulação Teste 01, 10/05/1990",
    );
    expect(a.carga().status).toBe("parado");
    expect(a.db.tabelas.agendamentos![0].paciente_nome).toBe("DISPONIVEL");
    expect(a.db.tabelas.agendamentos![0].is_mock_data).toBe(false);
  });
});

describe("vaga devolvida volta a ser agendável pela Nina", () => {
  test("o nome da vaga livre é o mesmo que o agendar da Nina procura", async () => {
    const { readFileSync } = await import("node:fs");
    const { VAGA_LIVRE } = await import("../carga-bateria.server");
    const agendar = readFileSync(new URL("../paciente-tools.server.ts", import.meta.url), "utf8");
    expect(VAGA_LIVRE.paciente_nome).toBe("DISPONIVEL");
    expect(agendar).toContain(`.eq("paciente_nome", "${VAGA_LIVRE.paciente_nome}")`);
  });
});

describe("status gravados pela bateria cabem na regra do banco", () => {
  test("a migration mais recente da regra aceita todos os status do executor", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const pasta = new URL("../../../../supabase/migrations/", import.meta.url);
    const regras = readdirSync(pasta).sort()
      .map((f) => readFileSync(new URL(f, pasta), "utf8"))
      .filter((sql) => sql.includes("nina_teste_carga_amostras_status_chk") && sql.includes("CHECK"));
    const vigente = regras.at(-1) ?? "";
    const executor = readFileSync(new URL("../carga-execucao.server.ts", import.meta.url), "utf8");
    const itens = readFileSync(new URL("../carga-itens.server.ts", import.meta.url), "utf8");
    const usados = new Set([...`${executor}\n${itens}`.matchAll(/status: "([a-z]+)"/g)].map((m) => m[1]!));
    expect(usados.has("dispensado")).toBe(true);
    for (const s of usados) if (!["concluido", "parado"].includes(s)) expect(vigente).toContain(`'${s}'`);
  });
});
