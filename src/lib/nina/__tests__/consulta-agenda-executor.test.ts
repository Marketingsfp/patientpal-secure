import { beforeEach, describe, expect, mock, test } from "bun:test";
import { estadoVazio } from "../fluxo-estado-normalizar";
import { consultaDoNovoTurno, type ConhecimentoSessao } from "../confidence/conhecimento-sessao";
import type { ResultadoConhecimento } from "../knowledge-contract";
import { comColetor } from "../evidencias.server";
import { resumoEntregueFixture } from "./agendamento-fixture";
import { aplicarGateIdentificacao } from "../identificacao-gate.server";
import type { CtxNinaPaciente } from "../paciente-tools.server";
import { resultadoAgendamentoConfirmado } from "../resposta/agendamento";

const CLINICA = "11111111-1111-4111-8111-111111111111";
const MEDICO = "22222222-2222-4222-8222-222222222222";
const OUTRO = "33333333-3333-4333-8333-333333333333";
const PACIENTE = "44444444-4444-4444-8444-444444444444";
const AGENDAMENTO = "55555555-5555-4555-8555-555555555555";
const CATALOGO = "66666666-6666-4666-8666-666666666666";
type Linha = Record<string, unknown>;
let banco: Record<string, Linha[]>;
let falharLeituraFicha = false;
let resultadoCatalogo: ResultadoConhecimento;
const pesquisas: unknown[] = [];
const leituras: Array<{ tabela: string; filtros: Record<string, unknown> }> = [];
const auditoria: Linha[] = [];
const gravacoes: Linha[] = [];
const inicio = new Date(Date.now() + 2 * 86_400_000);
inicio.setUTCHours(17, 0, 0, 0);
const fim = new Date(inicio.getTime() + 30 * 60_000);

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(tabela: string) {
      if (tabela === "audit_log")
        return {
          insert: async (r: Linha) => {
            auditoria.push(r);
            return { error: null };
          },
        };
      if (!(tabela in banco)) throw new Error(`Consulta inesperada: ${tabela}`);
      const filtros: Record<string, unknown> = {};
      const predicados: Array<(r: Linha) => boolean> = [];
      let atualizacao: Linha | null = null;
      let faixa: [number, number] | null = null;
      let limite: number | null = null;
      const ler = () => {
        leituras.push({ tabela, filtros: { ...filtros } });
        const linhas = banco[tabela]!.filter((r) => predicados.every((p) => p(r)));
        if (atualizacao) for (const linha of linhas) Object.assign(linha, atualizacao);
        return faixa ? linhas.slice(faixa[0], faixa[1] + 1) : limite != null ? linhas.slice(0, limite) : linhas;
      };
      const q = {
        select: (_: string) => q,
        eq: (k: string, v: unknown) => {
          filtros[k] = v;
          predicados.push((r) => r[k] === v);
          return q;
        },
        in: (k: string, v: unknown[]) => {
          filtros[k] = v;
          predicados.push((r) => v.includes(r[k]));
          return q;
        },
        ilike: (k: string, v: string) => {
          filtros[k] = v;
          const partes = v.split("%").map(s => s.replace(/\\([%_\\])/g, "$1").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
          const re = new RegExp(`^${partes.join(".*")}$`, "i");
          predicados.push(r => re.test(String(r[k] ?? "")));
          return q;
        },
        neq: (k: string, v: unknown) => {
          predicados.push((r) => r[k] !== v);
          return q;
        },
        not: (k: string, _operador: string, v: string) => {
          const valores = v.replace(/[()]/g, "").split(",");
          predicados.push((r) => !valores.includes(String(r[k])));
          return q;
        },
        update: (v: Linha) => {
          atualizacao = v;
          return q;
        },
        or: () => q,
        is: (k: string, v: unknown) => { predicados.push(r => (r[k] ?? null) === v); return q; },
        lt: (k: string, v: unknown) => { predicados.push(r => String(r[k]) < String(v)); return q; },
        gte: (k: string, v: unknown) => { predicados.push((r) => String(r[k]) >= String(v)); return q; },
        lte: (k: string, v: unknown) => { predicados.push((r) => String(r[k]) <= String(v)); return q; },
        order: () => q,
        range: (a: number, b: number) => {
          if (falharLeituraFicha && tabela === "agendamentos") throw new Error("Falha simulada ao ler ficha");
          faixa = [a, b]; return q;
        },
        limit: (n: number) => { limite = n; return q; },
        maybeSingle: async () => ({ data: ler()[0] ?? null, error: null }),
        then: (resolve: (r: { data: Linha[]; error: null }) => unknown) =>
          Promise.resolve(resolve({ data: ler(), error: null })),
      };
      return q;
    },
  },
}));

mock.module("@/lib/nina/knowledge.server", () => ({
  searchKnowledgeBase: async (pedido: unknown) => {
    pesquisas.push(pedido);
    return resultadoCatalogo;
  },
}));

// A escrita no núcleo é simulada; as consultas e a autorização do executor
// continuam reais e o teste confere a releitura obrigatória do registro.
mock.module("@/lib/agenda/criar-agendamento.core.server", () => ({
  criarAgendamentoCore: async (
    _ctx: unknown,
    entrada: { payload: Linha; editing_id?: string | null },
  ) => {
    gravacoes.push(entrada.payload);
    const index = banco.agendamentos!.findIndex((r) => r.id === entrada.editing_id);
    const linha = { ...banco.agendamentos![index], ...entrada.payload, id: AGENDAMENTO };
    if (index >= 0) banco.agendamentos![index] = linha;
    else banco.agendamentos!.push(linha);
    return { ok: true, id: AGENDAMENTO };
  },
}));

const { executarFerramentaPaciente, consultarDisponibilidadeCore } = await import("../paciente-tools.server");

function contexto(mensagemAtual: string, respostaAnterior?: string) {
  const estado = estadoVazio();
  estado.session_id = "sessao-teste";
  return {
    clinicaId: CLINICA,
    telefone: null,
    pacienteId: null,
    pacienteNome: null,
    conversaId: null,
    origem: "homologacao" as const,
    teste: true,
    estado,
    consultaAgenda: {
      mensagemAtual,
      historico: respostaAnterior ? [{ role: "assistant", content: respostaAnterior }] : [],
    },
  };
}
const argumentos = {
  medico_id: "Alex Louza",
  data: inicio.toISOString().slice(0, 10),
  hora: "14:00",
};
describe("SFP bloqueia ações na publicação vigente, preservando outros profissionais", () => {
  for (const teste of [false, true]) {
    test(`${teste ? "homologação" : "real"}: SFP vinculado a um médico real não agenda`, async () => {
      banco.nina_cat_profissionais![0]!.nome = " SFP ";
      banco.nina_cat_profissionais![0]!.medico_id = MEDICO;
      const ctx = { ...contextoAgendar(true), teste,
        origem: (teste ? "homologacao" : "whatsapp") as CtxNinaPaciente["origem"] };
      const r = await executarFerramentaPaciente(ctx, "agendar", argumentosAgendar);
      expect(r.erro).toBe("PROFISSIONAL_SFP");
      expect(consultasAgenda()).toHaveLength(0);
      expect(gravacoes).toHaveLength(0);
    });
    test(`${teste ? "homologação" : "real"}: serviço SFP impede coleta automática após o aceite`, async () => {
      banco.nina_cat_servicos!.push({ id: CATALOGO, clinica_id: CLINICA, status: "PUBLICADO",
        nome: "Consulta Cardiologia", executantes: [{ nome: "sfp" }] });
      const ctx = { ...contextoAgendar(true), teste,
        origem: (teste ? "homologacao" : "whatsapp") as CtxNinaPaciente["origem"] };
      const motivos: string[] = [];
      const r = await aplicarGateIdentificacao({ mensagem: "Sim", estado: ctx.estado, ctx,
        executar: executarFerramentaPaciente,
        encaminharVagaIndisponivel: async motivo => { motivos.push(motivo); return true; } });
      expect(r?.texto).toContain("Encaminhei");
      expect(motivos).toHaveLength(1);
      expect(motivos[0]).toContain("PROFISSIONAL_SFP");
      expect(consultasAgenda()).toHaveLength(0);
      expect(gravacoes).toHaveLength(0);
      expect(ctx.estado.appointment.confirmation).toBeNull();
    });
  }
  test("SFP arquivado ou de outra clínica não bloqueia o médico publicado atual", async () => {
    banco.nina_cat_profissionais!.push(
      { id: "externo", clinica_id: OUTRO, status: "PUBLICADO", nome: "SFP", medico_id: MEDICO },
      { id: "antigo", clinica_id: CLINICA, status: "ARQUIVADO", nome: "SFP", medico_id: MEDICO });
    const r = await executarFerramentaPaciente(contextoAgendar(true), "agendar", argumentosAgendar);
    expect(r.ok).toBe(true);
    expect(gravacoes).toHaveLength(1);
  });
});

const consultasAgenda = () =>
  leituras.filter((l) => ["agendamentos", "medico_disponibilidades"].includes(l.tabela));
const argumentosAgendar = {
  medico_id: MEDICO,
  inicio: inicio.toISOString(),
  fim: fim.toISOString(),
  procedimento: "Consulta Cardiologia",
};

function contextoAgendar(confirmado = false) {
  const ctx = {
    ...contexto("sim, pode marcar"),
    pacienteId: PACIENTE,
    pacienteNome: "Paciente Fictício",
    podeAgendar: true,
  };
  if (confirmado)
    Object.assign(ctx.estado.appointment, {
      doctor_id: MEDICO,
      doctor_name: "Alex Louza",
      procedure: "Consulta Cardiologia",
      slot_inicio: inicio.toISOString(),
      slot_fim: fim.toISOString(),
      slot_confirmed_by_patient: true,
    });
  if (confirmado) resumoEntregueFixture(ctx.estado, CLINICA, true);
  return ctx;
}

beforeEach(() => {
  falharLeituraFicha = false;
  leituras.length = 0;
  auditoria.length = 0;
  gravacoes.length = 0;
  pesquisas.length = 0;
  resultadoCatalogo = {
    found: true,
    knowledge_status: "found",
    source: "nina_catalogo",
    source_type: "catalog",
    base_version: null,
    base_file: null,
    procedure: "Consulta Cardiologia",
    price: "R$ 120,00",
    doctors: ["Alex Louza"],
    units: [],
    days: ["Quarta"],
    notes: [],
    trace: [],
    instrucao: "Catálogo publicado.",
    records: [
      {
        id: CATALOGO,
        tipo: "profissional",
        medico: "Alex Louza",
        procedimento: "Consulta Cardiologia",
        preco_dinheiro: 120,
      },
    ],
  };
  banco = {
    nina_cat_servicos: [],
    nina_cat_profissionais: [
      {
        id: CATALOGO,
        clinica_id: CLINICA,
        nome: "Alex Louza",
        medico_id: null,
        status: "PUBLICADO",
        tipo_atendimento: "Hora marcada",
      },
    ],
    medicos: [
      { id: MEDICO, clinica_id: CLINICA, nome: "Alex Louza", ativo: true, especialidade_id: null },
    ],
    agendamentos: [
      {
        id: "vaga-a",
        clinica_id: CLINICA,
        medico_id: MEDICO,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        paciente_nome: "DISPONIVEL",
        status: "confirmado",
      },
    ],
    medico_disponibilidades: [
      {
        clinica_id: CLINICA,
        medico_id: MEDICO,
        ativo: true,
        dia_semana: inicio.getUTCDay(),
        hora_inicio: "13:00",
        hora_fim: "18:00",
      },
    ],
    especialidades: [],
    medico_agendas: [],
    nina_mensagens_templates: [],
  };
});

describe("executor real das ferramentas com banco simulado", () => {
  test("consulta do dia local inclui a noite após a virada UTC e exclui o dia seguinte", async () => {
    banco.agendamentos = [
      "2026-09-17T02:59:59.000Z", // dia 16 na clínica
      "2026-09-17T03:00:00.000Z", // início do dia 17
      "2026-09-18T02:30:00.000Z", // dia 17, 23:30
      "2026-09-18T03:00:00.000Z", // início do dia 18
    ].map((inicio, i) => ({
      id: String(i), clinica_id: CLINICA, medico_id: MEDICO,
      inicio, fim: new Date(new Date(inicio).getTime() + 60_000).toISOString(),
      paciente_nome: "DISPONIVEL", status: "confirmado",
    }));
    const slots = await consultarDisponibilidadeCore({
      clinicaId: CLINICA, medicoId: MEDICO, data: "2026-09-17",
    }, new Date("2026-09-16T12:00:00Z"));
    expect(slots.map(s => [s.data, s.hora])).toEqual([
      ["17/09/2026", "00:00"], ["17/09/2026", "23:30"],
    ]);
  });

  test("filtra a data antes de limitar resultados e não oferece horário já passado", async () => {
    banco.agendamentos = [
      "2026-09-16T15:00:00.000Z",
      "2026-09-17T15:00:00.000Z",
      "2026-09-17T18:00:00.000Z",
    ].map((inicio, i) => ({
      id: String(i), clinica_id: CLINICA, medico_id: MEDICO,
      inicio, fim: new Date(new Date(inicio).getTime() + 60_000).toISOString(),
      paciente_nome: "DISPONIVEL", status: "confirmado",
    }));
    const pedido = { clinicaId: CLINICA, medicoId: MEDICO, data: "2026-09-17", limite: 1 };
    const futuro = await consultarDisponibilidadeCore(pedido, new Date("2026-09-16T12:00:00Z"));
    expect(futuro.map(s => s.hora)).toEqual(["12:00"]);
    const hoje = await consultarDisponibilidadeCore(pedido, new Date("2026-09-17T16:00:00Z"));
    expect(hoje.map(s => s.hora)).toEqual(["15:00"]);
  });

  test("buscar_medicos separa a identidade do catálogo e a da agenda sem consultar vagas", async () => {
    const r = await executarFerramentaPaciente(
      contexto("Vocês têm cardiologista?"),
      "buscar_medicos",
      { nome: "Alex" },
    );
    expect(r.ok).toBe(true);
    expect(r.vinculos_agenda).toEqual([
      {
        catalogo_id: CATALOGO,
        nome_catalogo: "Alex Louza",
        medico_id: MEDICO,
        origem_vinculo: "nome_unico",
        nome_agenda: "Alex Louza",
        situacao: "vinculado",
        opcoes: [],
      },
    ]);
    expect((r.registros as Linha[])[0]).toMatchObject({
      id: CATALOGO,
      catalogo_id: CATALOGO,
      medico_id: MEDICO,
      preco_dinheiro: 120,
    });
    expect(consultasAgenda()).toHaveLength(0);
    expect(gravacoes).toHaveLength(0);
  });

  for (const origem of ["homologacao", "whatsapp"] as const) {
    test(`${origem}: aceite mantém ortopedia e converte o UUID publicado de Jorge antes de consultar`, async () => {
      banco.medicos![0]!.nome = "JORGE ANTONIO RIBEIRO DOS SANTOS";
      banco.nina_cat_profissionais![0]!.nome = "Jorge Ribeiro";
      banco.nina_cat_profissionais![0]!.medico_id = OUTRO;
      banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "JORGE RIBEIRO", ativo: false });
      resultadoCatalogo.doctors = ["Jorge Ribeiro"];
      resultadoCatalogo.records = [
        {
          id: CATALOGO,
          tipo: "profissional",
          medico: "Jorge Ribeiro",
          procedimento: "Consulta Ortopedia",
        },
      ];
      const memoria: ConhecimentoSessao = {
        versao: 1,
        clinicaId: CLINICA,
        sessionId: "sessao-teste",
        consulta: { termo: "ortopedia", medico: "Jorge Ribeiro" },
        referencias: [
          {
            registro: CATALOGO,
            versao: null,
            procedimento: "Ortopedia",
            medicoNome: "Jorge Ribeiro",
          },
        ],
      };
      const pesquisa = consultaDoNovoTurno({ mensagem: "sim por favor", anterior: memoria });
      const ctx = {
        ...contexto(
          "sim por favor",
          "Gostaria que eu verifique os horários disponíveis na agenda do Dr. Jorge Ribeiro para a próxima segunda-feira?",
        ),
        origem,
        teste: origem === "homologacao",
      };
      expect(pesquisa?.continuidade).toBe(true);
      await executarFerramentaPaciente(ctx, "consultar_base_conhecimento", pesquisa!.args);
      expect(pesquisas[0]).toMatchObject({ query: "ortopedia", medico: "Jorge Ribeiro" });
      const { resultado: busca, coletor } = await comColetor(() =>
        executarFerramentaPaciente(ctx, "buscar_medicos", { nome: "Jorge" }),
      );
      expect((busca.vinculos_agenda as Linha[])[0]!.medico_id).toBe(MEDICO);
      expect((busca.vinculos_agenda as Linha[])[0]!.origem_vinculo).toBe(
        "vinculo_inativo_reconciliado",
      );
      const vinculoAuditado = coletor.pacote().etapas.find((e) => e.dados.vinculos)?.dados
        .vinculos[0];
      expect(vinculoAuditado).toMatchObject({
        catalogo_id: CATALOGO,
        medico_id_publicado: OUTRO,
        medico_id: MEDICO,
        origem_vinculo: "vinculo_inativo_reconciliado",
      });
      // Compatibilidade com o modelo que ainda devolva o UUID antigo do catálogo.
      const r = await executarFerramentaPaciente(ctx, "consultar_disponibilidade", {
        medico_id: CATALOGO,
      });
      expect(r.ok).toBe(true);
      expect(ctx.estado.appointment.doctor_id).toBe(MEDICO);
      expect(
        consultasAgenda().every(
          (l) => JSON.stringify(l.filtros.medico_id) === JSON.stringify([MEDICO]),
        ),
      ).toBe(true);
      expect(gravacoes).toHaveLength(0);
      expect(banco.nina_cat_profissionais![0]!.medico_id).toBe(OUTRO);
    });
  }

  test("UUID publicado com dois médicos compatíveis pede escolha sem consultar vagas", async () => {
    banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "Alex Louza Filho", ativo: true });
    const r = await executarFerramentaPaciente(
      contexto("sim por favor", "Posso consultar vagas com Dr. Alex Louza?"),
      "proxima_vaga",
      { medico_id: CATALOGO },
    );
    expect(r.motivo).toBe("MEDICO_NAO_DEFINIDO");
    expect(r.opcoes).toHaveLength(2);
    expect(consultasAgenda()).toHaveLength(0);
  });

  test("cadastro inativo não resolve homônimos por ordem de retorno", async () => {
    banco.nina_cat_profissionais![0]!.medico_id = PACIENTE;
    banco.medicos!.push(
      { id: PACIENTE, clinica_id: CLINICA, nome: "Alex Louza", ativo: false },
      { id: OUTRO, clinica_id: CLINICA, nome: "Alex Silva Louza", ativo: true },
    );
    const r = await executarFerramentaPaciente(
      contexto("sim por favor", "Posso verificar vagas do Dr. Alex Louza?"),
      "proxima_vaga",
      { medico_id: CATALOGO },
    );
    expect(r.ok).toBe(false);
    expect(r.opcoes).toHaveLength(2);
    expect(consultasAgenda()).toHaveLength(0);
  });

  test.each(["nome_divergente", "outra_clinica"])(
    "vínculo inativo com %s não é substituído por coincidência do nome público",
    async (caso) => {
      banco.nina_cat_profissionais![0]!.medico_id = OUTRO;
      banco.medicos!.push({
        id: OUTRO,
        clinica_id: caso === "outra_clinica" ? OUTRO : CLINICA,
        nome: caso === "nome_divergente" ? "Antonio Cobucci" : "Alex Louza",
        ativo: false,
      });
      const r = await executarFerramentaPaciente(
        contexto("sim", "Posso consultar as vagas do Dr. Alex Louza?"),
        "proxima_vaga",
        { medico_id: CATALOGO },
      );
      expect(r.ok).toBe(false);
      expect(consultasAgenda()).toHaveLength(0);
    },
  );

  for (const situacao of [
    "outra_clinica",
    "rascunho",
    "arquivado",
    "medico_inativo",
    "vinculo_invalido",
  ] as const) {
    test(`catálogo ${situacao} não autoriza um vínculo nem consulta vagas`, async () => {
      const registro = banco.nina_cat_profissionais![0]!;
      if (situacao === "outra_clinica") registro.clinica_id = OUTRO;
      if (situacao === "rascunho") registro.status = "RASCUNHO";
      if (situacao === "arquivado") registro.status = "ARQUIVADO";
      if (situacao === "medico_inativo") banco.medicos![0]!.ativo = false;
      if (situacao === "vinculo_invalido") registro.medico_id = OUTRO;
      const r = await executarFerramentaPaciente(
        contexto("sim", "Posso verificar vagas com Dr. Alex Louza?"),
        "proxima_vaga",
        { medico_id: CATALOGO },
      );
      expect(r.ok).toBe(false);
      expect(consultasAgenda()).toHaveLength(0);
      expect(gravacoes).toHaveLength(0);
    });
  }

  test("vínculo explícito do catálogo é preservado ao devolver a identidade da agenda", async () => {
    banco.nina_cat_profissionais![0]!.medico_id = OUTRO;
    banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "Alex Silva Louza", ativo: true });
    const r = await executarFerramentaPaciente(
      contexto("Quais médicos atendem?"),
      "buscar_medicos",
      { nome: "Alex" },
    );
    expect((r.vinculos_agenda as Linha[])[0]!.medico_id).toBe(OUTRO);
    expect(consultasAgenda()).toHaveLength(0);
  });

  test("UUID do catálogo de outro médico não troca a escolha feita pelo paciente", async () => {
    banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "Antonio Cobucci", ativo: true });
    banco.nina_cat_profissionais![0]!.nome = "Antonio Cobucci";
    const r = await executarFerramentaPaciente(
      contexto("sim por favor", "Posso verificar vagas do Dr. Alex Louza?"),
      "proxima_vaga",
      { medico_id: CATALOGO },
    );
    expect(r.motivo).toBe("MEDICO_DIVERGENTE");
    expect(consultasAgenda()).toHaveLength(0);
  });

  test("vínculo resolvido não transforma uma agenda vazia em vaga ou reserva", async () => {
    banco.agendamentos = [];
    const ctx = contexto("sim por favor", "Posso verificar vagas com o Dr. Alex Louza?");
    const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: CATALOGO });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("NO_AVAILABILITY");
    expect(r.slots).toEqual([]);
    expect(ctx.estado.appointment.appointment_id).toBeNull();
    expect(gravacoes).toHaveLength(0);
  });

  for (const ferramenta of ["consultar_disponibilidade", "verificar_horario", "proxima_vaga"]) {
    test(`${ferramenta}: pergunta geral não toca a agenda nem resolve o médico`, async () => {
      const r = await executarFerramentaPaciente(
        contexto("vcs tem cardiologista?"),
        ferramenta,
        argumentos,
      );
      expect(r.ok).toBe(false);
      expect(r.consulta_realizada).toBe(false);
      expect(r.aguardando_paciente).toBe(true);
      expect(leituras).toHaveLength(0);
      expect(auditoria.some((r) => r.action === "NINA_TOOL")).toBe(true);
      expect("horarios" in r).toBe(false);
    });
    test(`${ferramenta}: aceite da oferta consulta apenas o médico definido`, async () => {
      const ctx = contexto("sim", "Gostaria que eu verificasse as vagas do Dr. Alex Louza?");
      const r = await executarFerramentaPaciente(ctx, ferramenta, argumentos);
      expect(r.ok).toBe(true);
      const consultas = leituras.filter((l) => l.tabela === "agendamentos");
      expect(consultas.length).toBeGreaterThan(0);
      expect(
        consultas.every((l) => JSON.stringify(l.filtros.medico_id) === JSON.stringify([MEDICO])),
      ).toBe(true);
      expect(ctx.estado.appointment.doctor_id).toBe(MEDICO);
      expect(ctx.estado.appointment.appointment_id).toBeNull();
    });
  }
  test("pedido direto de vagas com médico não exige uma confirmação repetida", async () => {
    const r = await executarFerramentaPaciente(
      contexto("Tem vaga com Dr. Alex Louza?"),
      "consultar_disponibilidade",
      { medico_id: MEDICO },
    );
    expect(r.ok).toBe(true);
    expect(consultasAgenda().length).toBeGreaterThan(0);
  });
  test("só querer saber se há vagas ainda é pedido explícito de consulta", async () => {
    const r = await executarFerramentaPaciente(
      contexto("Só quero saber se há vagas com Dr. Alex Louza"),
      "consultar_disponibilidade",
      { medico_id: MEDICO },
    );
    expect(r.ok).toBe(true);
    expect(consultasAgenda().length).toBeGreaterThan(0);
  });
  test("especialidade sozinha não permite consultar a agenda de todos", async () => {
    const r = await executarFerramentaPaciente(
      contexto("Quero ver vagas de cardiologia"),
      "proxima_vaga",
      { especialidade: "cardiologia" },
    );
    expect(r.motivo).toBe("MEDICO_NAO_DEFINIDO");
    expect(leituras).toHaveLength(0);
  });
  test("homônimos não são escolhidos consultando qual tem vaga", async () => {
    banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "Alex Silva", ativo: true });
    const r = await executarFerramentaPaciente(
      contexto("Tem vaga com Dr. Alex?"),
      "consultar_disponibilidade",
      { medico_id: "Dr. Alex" },
    );
    expect(r.motivo).toBe("MEDICO_NAO_DEFINIDO");
    expect(consultasAgenda()).toHaveLength(0);
    expect(r.opcoes).toHaveLength(2);
  });
  test("médico de outra clínica não passa pela resolução UUID", async () => {
    banco.medicos![0]!.clinica_id = OUTRO;
    const r = await executarFerramentaPaciente(
      contexto("Tem vaga com Dr. Alex Louza?"),
      "consultar_disponibilidade",
      { medico_id: MEDICO },
    );
    expect(r.ok).toBe(false);
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("argumentos do modelo não criam aceite do paciente", async () => {
    const r = await executarFerramentaPaciente(
      contexto("Quais dias o Dr. Alex atende?"),
      "consultar_disponibilidade",
      { ...argumentos, autorizado: true, paciente_confirmou: true },
    );
    expect(r.ok).toBe(false);
    expect(leituras).toHaveLength(0);
  });
  test("médico divergente da oferta aceita não tem agenda consultada", async () => {
    banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "Antonio Cobucci", ativo: true });
    const r = await executarFerramentaPaciente(
      contexto("sim", "Posso consultar as vagas do Dr. Alex Louza?"),
      "proxima_vaga",
      { medico_id: OUTRO },
    );
    expect(r.motivo).toBe("MEDICO_DIVERGENTE");
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("nome completo do paciente prevalece sobre UUID de homônimo enviado pelo modelo", async () => {
    banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "Alex Silva", ativo: true });
    const r = await executarFerramentaPaciente(
      contexto("Tem vagas com Dr. Alex Louza?"),
      "consultar_disponibilidade",
      { medico_id: OUTRO },
    );
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("MEDICO_DIVERGENTE");
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("UUID sugerido pelo modelo não resolve nome curto compartilhado por dois médicos", async () => {
    banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "Alex Silva", ativo: true });
    const r = await executarFerramentaPaciente(
      contexto("Tem vagas com Dr. Alex?"),
      "consultar_disponibilidade",
      { medico_id: MEDICO },
    );
    expect(r.ok).toBe(false);
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("nome completo correto permite consulta mesmo existindo outro Alex", async () => {
    banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "Alex Silva", ativo: true });
    const r = await executarFerramentaPaciente(
      contexto("Tem vagas com Dr. Alex Louza?"),
      "consultar_disponibilidade",
      { medico_id: MEDICO },
    );
    expect(r.ok).toBe(true);
    expect(consultasAgenda().length).toBeGreaterThan(0);
    expect(
      leituras
        .filter((l) => l.tabela === "agendamentos")
        .every((l) => JSON.stringify(l.filtros.medico_id) === JSON.stringify([MEDICO])),
    ).toBe(true);
  });

  test("agendar sem consentimento não consulta nem idempotência nem disponibilidade", async () => {
    const r = await executarFerramentaPaciente(contextoAgendar(), "agendar", argumentosAgendar);
    expect(r.ok).toBe(false);
    expect(r.erro).toBe("ACTION_NOT_AUTHORIZED");
    expect(r.motivos).toContain("CONSENTIMENTO_AUSENTE");
    expect(leituras).toHaveLength(0);
    expect(gravacoes).toHaveLength(0);
  });
  test("chamada agendar sem estado do servidor não serve como consentimento", async () => {
    const r = await executarFerramentaPaciente(
      { ...contextoAgendar(true), estado: undefined },
      "agendar",
      argumentosAgendar,
    );
    expect(r.ok).toBe(false);
    expect(consultasAgenda()).toHaveLength(0);
    expect(gravacoes).toHaveLength(0);
  });
  test("consentimento para outro slot não antecipa leitura de agenda", async () => {
    const ctx = contextoAgendar(true);
    ctx.estado.appointment.slot_inicio = new Date(inicio.getTime() + 3_600_000).toISOString();
    const r = await executarFerramentaPaciente(ctx, "agendar", argumentosAgendar);
    expect(r.ok).toBe(false);
    expect(r.motivos).toContain("CONSENTIMENTO_DE_OUTRO_SLOT");
    expect(consultasAgenda()).toHaveLength(0);
    expect(gravacoes).toHaveLength(0);
  });
  test("intervalo inválido é recusado antes de consultar a agenda", async () => {
    const r = await executarFerramentaPaciente(contextoAgendar(true), "agendar", {
      ...argumentosAgendar,
      fim: inicio.toISOString(),
    });
    expect(r.ok).toBe(false);
    expect(r.motivos).toContain("INTERVALO_INVALIDO");
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("agendamento consentido continua revalidando a vaga, gravando e conferindo o resultado", async () => {
    const ctx = contextoAgendar(true);
    const r = await executarFerramentaPaciente(ctx, "agendar", argumentosAgendar);
    expect(r.ok).toBe(true);
    expect(r.estado_acao).toBe("CREATED");
    expect(r.verificado_no_banco).toBe(true);
    expect(r.appointment_id).toBe(AGENDAMENTO);
    expect(consultasAgenda().length).toBeGreaterThan(0);
    expect(gravacoes).toHaveLength(1);
    expect(ctx.estado.appointment.appointment_id).toBe(AGENDAMENTO);
  });
  test("repetição autorizada encontra reserva existente sem duplicar a gravação", async () => {
    banco.agendamentos = [
      {
        ...argumentosAgendar,
        id: AGENDAMENTO,
        clinica_id: CLINICA,
        paciente_id: PACIENTE,
        status: "agendado",
      },
    ];
    const r = await executarFerramentaPaciente(contextoAgendar(true), "agendar", argumentosAgendar);
    expect(r.ok).toBe(true);
    expect(r.estado_acao).toBe("EXISTING");
    expect(r.appointment_id).toBe(AGENDAMENTO);
    expect(gravacoes).toHaveLength(0);
  });
});

describe("modalidades na consulta operacional", () => {
  for (const origem of ["whatsapp", "homologacao"] as const) {
    for (const [publicada, esperada, antecedencia] of [
      ["Hora marcada", "hora_marcada", true],
      ["Ordem de chegada com pré-agendamento", "chegada_com_pre_agendamento", false],
      ["Por numeração (ficha)", "ficha", true],
    ] as const) {
      test(`${origem}: escolha após oferta composta e sim consultam sem exigir data (${esperada})`, async () => {
        banco.nina_cat_profissionais![0]!.tipo_atendimento = publicada;
        const ctx: CtxNinaPaciente = { ...contexto("com o Alex Louza",
          "Quer verificar vagas na agenda? Se sim, qual profissional prefere?"), origem, teste: origem === "homologacao" };
        const escolhido = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: "Alex Louza" });
        expect(escolhido.ok).toBe(true);
        ctx.consultaAgenda = { mensagemAtual: "sim", medicoEscolhido: { id: MEDICO, nome: "Alex Louza" },
          historico: [{ role: "assistant", content: "Gostaria que eu consulte vagas e horários disponíveis na agenda para a sua consulta com ele?" }] };
        const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: "Alex Louza" });
        expect(r.ok).toBe(true);
        expect(r.proxima).toMatchObject({ medico_id: MEDICO, modalidade_atendimento: esperada,
          inicio: inicio.toISOString(), fim: fim.toISOString() });
        expect(String((r.proxima as Record<string, unknown>).orientacao).includes("15 minutos")).toBe(antecedencia);
        expect(consultasAgenda().length).toBeGreaterThan(0);
        expect(gravacoes).toHaveLength(0);
        expect(ctx.estado?.appointment.slot_inicio).toBeNull();
        expect(ctx.estado?.appointment.confirmation).toBeNull();
        expect(ctx.estado?.appointment.appointment_id).toBeNull();
      });
    }
  }
  test("todas as alternativas apresentadas podem ser escolhidas, inclusive a quarta", async () => {
    const base = banco.agendamentos![0]!;
    for (let i = 1; i <= 4; i++) banco.agendamentos!.push({ ...base, id: `vaga-${i}`,
      inicio: new Date(inicio.getTime() + i * 3_600_000).toISOString(),
      fim: new Date(fim.getTime() + i * 3_600_000).toISOString() });
    const ctx = contexto("Tem vaga com Dr. Alex Louza?");
    ctx.estado.appointment.doctor_id = MEDICO;
    ctx.estado.appointment.procedure = "Consulta Cardiologia";
    const r = await executarFerramentaPaciente(ctx, "verificar_horario", argumentos);
    expect(r.ok).toBe(true);
    expect(r.alternativas).toHaveLength(4);
    const ultima = ctx.estado.appointment.slot_options!.vagas.at(-1)!;
    expect(ultima.hora).toBe("18:00");
    ctx.consultaAgenda.mensagemAtual = "prefiro 18:00";
    const escolha = await executarFerramentaPaciente(ctx, "selecionar_horario", {
      medico_id: MEDICO, inicio: ultima.inicio, fim: ultima.fim,
    });
    expect(escolha.ok).toBe(true);
    expect(escolha.resumo_confirmacao).toContain("18:00");
  });
  for (const origem of ["whatsapp", "homologacao"] as const)
    for (const ferramenta of ["consultar_disponibilidade", "verificar_horario", "proxima_vaga"])
      test(`${origem}: ${ferramenta} sem pré-agendamento não consulta vagas nem solicita cadastro`, async () => {
        banco.nina_cat_profissionais![0]!.tipo_atendimento = "Ordem de chegada sem pré-agendamento";
        const ctx = { ...contexto("Tem vaga com Dr. Alex Louza?"), origem, teste: origem === "homologacao" };
        const r = await executarFerramentaPaciente(ctx, ferramenta, argumentos);
        expect(r.ok).toBe(true);
        expect(r.sem_agendamento).toBe(true);
        expect(r.orientacao_atendimento).toContain("Não é necessário marcar horário");
        expect(r.orientacao_atendimento).not.toMatch(/15|antecedência/);
        expect(consultasAgenda()).toHaveLength(0);
        expect(gravacoes).toHaveLength(0);
        expect(ctx.estado.appointment.slot_options).toBeNull();
        expect((await executarFerramentaPaciente(ctx, "consultar_cadastro_paciente", {})).erro).toBe("ACTION_NOT_AUTHORIZED");
      });
  test("ordem de chegada ambígua não produz opções de horário", async () => {
    banco.nina_cat_profissionais![0]!.tipo_atendimento = "Ordem de chegada";
    const r = await executarFerramentaPaciente(contexto("Tem vaga com Dr. Alex Louza?"), "consultar_disponibilidade", argumentos);
    expect(r.erro).toBe("MODALIDADE_NAO_DEFINIDA");
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("fallback usa a agenda da vaga, sem generalizar o booleano de outra agenda", async () => {
    banco.nina_cat_profissionais![0]!.tipo_atendimento = null;
    banco.agendamentos![0]!.agenda_id = "agenda-correta";
    banco.medico_agendas = [
      { id: "outra", clinica_id: CLINICA, medico_id: MEDICO, ordem_chegada: true },
      { id: "agenda-correta", clinica_id: CLINICA, medico_id: MEDICO, ordem_chegada: false },
    ];
    const ctx = contexto("Tem vaga com Dr. Alex Louza?");
    const r = await executarFerramentaPaciente(ctx, "consultar_disponibilidade", argumentos);
    expect(r.ok).toBe(true);
    expect(ctx.estado.appointment.slot_options?.vagas[0]?.modalidade).toBe("hora_marcada");
    banco.medico_agendas![1]!.ordem_chegada = true;
    expect((await executarFerramentaPaciente(ctx, "consultar_disponibilidade", argumentos)).erro).toBe("MODALIDADE_NAO_DEFINIDA");
  });
  test("ficha inclui cancelados e vagas, separa agendas e ignora outras clínicas", async () => {
    banco.nina_cat_profissionais![0]!.tipo_atendimento = "Por ficha";
    const ctx = contextoAgendar(true);
    ctx.estado.appointment.modalidade_atendimento = "ficha";
    resumoEntregueFixture(ctx.estado, CLINICA, true);
    const base = banco.agendamentos![0]!;
    banco.agendamentos!.push(
      { ...base, id: "cancelado", inicio: new Date(inicio.getTime() - 3_600_000).toISOString(), status: "cancelado", paciente_nome: "Cancelado" },
      { ...base, id: "outra-agenda", agenda_id: "outra", inicio: new Date(inicio.getTime() - 7_200_000).toISOString() },
      { ...base, id: "outra-clinica", clinica_id: OUTRO, inicio: new Date(inicio.getTime() - 10_800_000).toISOString() },
    );
    const r = await executarFerramentaPaciente(ctx, "agendar", argumentosAgendar);
    expect(r.ok).toBe(true);
    expect(r.ficha_numero).toBe("002");
    expect(resultadoAgendamentoConfirmado(r, ctx.estado, "Clínica")?.texto).toContain("*Sua ficha:* 002");
  });
  test("leitura de ficha percorre todas as páginas do dia", async () => {
    banco.nina_cat_profissionais![0]!.tipo_atendimento = "Por ficha";
    const ctx = contextoAgendar(true);
    ctx.estado.appointment.modalidade_atendimento = "ficha";
    resumoEntregueFixture(ctx.estado, CLINICA, true);
    const base = banco.agendamentos![0]!;
    for (let i = 1; i <= 1002; i++) banco.agendamentos!.push({ ...base, id: `cancelado-${i}`,
      inicio: new Date(inicio.getTime() - i * 6000).toISOString(), status: "cancelado", paciente_nome: "Cancelado" });
    const r = await executarFerramentaPaciente(ctx, "agendar", argumentosAgendar);
    expect(r.ok).toBe(true);
    expect(r.ficha_numero).toBe("1003");
  });
  test("falha ao ler ficha preserva sucesso comprovado e não inventa número", async () => {
    banco.nina_cat_profissionais![0]!.tipo_atendimento = "Por ficha";
    const ctx = contextoAgendar(true);
    ctx.estado.appointment.modalidade_atendimento = "ficha";
    resumoEntregueFixture(ctx.estado, CLINICA, true);
    falharLeituraFicha = true;
    const r = await executarFerramentaPaciente(ctx, "agendar", argumentosAgendar);
    expect(r.ok).toBe(true);
    expect(r.ficha_numero).toBeNull();
    expect(gravacoes).toHaveLength(1);
    expect(resultadoAgendamentoConfirmado(r, ctx.estado, "Clínica")?.texto).toContain("Não consegui consultar seu número");
  });
});

describe("regressão 08:00 versus 10:20 — consulta, escolha, resumo, aceite e gravação", () => {
  async function preparar(teste = true) {
    const data = inicio.toISOString().slice(0, 10);
    banco.agendamentos = ["08:00", "10:20"].map((hora, i) => ({
      id: `vaga-${i}`, clinica_id: CLINICA, medico_id: MEDICO, paciente_nome: "DISPONIVEL", status: "confirmado",
      inicio: new Date(`${data}T${hora}:00-03:00`).toISOString(),
      fim: new Date(Date.parse(`${data}T${hora}:00-03:00`) + 20 * 60_000).toISOString(),
    }));
    const ctx: CtxNinaPaciente = { ...contexto("Tem vaga com Dr. Alex Louza?"), podeAgendar: true,
      teste, origem: teste ? "homologacao" : "whatsapp", nomeUnidade: "Clínica Teste",
      pacienteId: PACIENTE, pacienteNome: "Paciente Fictício" };
    const estado = ctx.estado!;
    Object.assign(estado.appointment, { doctor_id: MEDICO, procedure: "Consulta Cardiologia" });
    const consulta = await executarFerramentaPaciente(ctx, "consultar_disponibilidade", { medico_id: MEDICO, data });
    expect(consulta.ok).toBe(true);
    expect(estado.appointment.time).toBeNull();
    expect(estado.appointment.slot_inicio).toBeNull();
    expect(estado.appointment.slot_confirmed_by_patient).toBe(false);
    expect(estado.appointment.slot_options?.vagas.map(v => v.hora)).toEqual(["08:00", "10:20"]);
    ctx.opcoesAgendamentoInicioTurno = true;
    ctx.consultaAgenda!.historico = [{ role: "assistant", content: "Há vagas às 08:00 e 10:20. Qual prefere?" }];
    const encaminhamentos: string[] = [];
    let handoffOk = true;
    const executar: typeof executarFerramentaPaciente = async (c, nome, args) => {
      if (nome === "consultar_cadastro_paciente") return { ok: true, campos_faltantes: [] };
      if (nome === "identificar_paciente") return { ok: true };
      return executarFerramentaPaciente(c, nome, args);
    };
    const turno = async (mensagem: string, entregar = true) => {
      ctx.consultaAgenda!.mensagemAtual = mensagem;
      const r = await aplicarGateIdentificacao({ mensagem, estado, ctx, executar,
        encaminharVagaIndisponivel: async motivo => { encaminhamentos.push(motivo); return handoffOk; } });
      if (entregar && r) ctx.consultaAgenda!.historico.push({ role: "user", content: mensagem }, { role: "assistant", content: r.texto });
      return r;
    };
    return { ctx, estado, turno, encaminhamentos, falharHandoff: () => { handoffOk = false; } };
  }
  for (const teste of [false, true]) {
    for (const [rotulo, modo, antecedencia] of [
      ["Hora marcada", "hora_marcada", true],
      ["Ordem de chegada com pré-agendamento", "chegada_com_pre_agendamento", false],
      ["Por numeração (ficha)", "ficha", true],
    ] as const) test(`${teste ? "homologação" : "real"}: reserva e confirmação respeitam ${rotulo}`, async () => {
      banco.nina_cat_profissionais![0]!.tipo_atendimento = rotulo;
      const t = await preparar(teste);
      const resumo = await t.turno("eu prefiro 10:20");
      expect(resumo?.texto).toContain("10:20");
      expect(t.estado.appointment.modalidade_atendimento).toBe(modo);
      if (modo === "chegada_com_pre_agendamento") {
        expect(resumo?.texto).toContain("quem chegar primeiro");
        expect(resumo?.texto).not.toContain("15 minutos");
      }
      const r = await t.turno("Sim");
      expect(r?.texto).toContain("10:20");
      expect(r?.texto.includes("15 minutos")).toBe(antecedencia);
      if (modo === "ficha") expect(r?.texto).toContain("*Sua ficha:* 002");
      expect(gravacoes).toHaveLength(1);
      expect(new Date(String(gravacoes[0]!.inicio)).getUTCHours()).toBe(13);
      expect(t.encaminhamentos).toHaveLength(0);
    });
    test(`${teste ? "homologação" : "real"}: modalidade alterada após resumo transfere sem reservar`, async () => {
      const t = await preparar(teste);
      await t.turno("vou 10:20");
      banco.nina_cat_profissionais![0]!.tipo_atendimento = "Ordem de chegada sem pré-agendamento";
      const r = await t.turno("Sim");
      expect(r?.origem).toBe("handoff");
      expect(r?.texto).toContain("forma de atendimento");
      expect(gravacoes).toHaveLength(0);
      expect(t.encaminhamentos[0]).toContain("MODALIDADE_ALTERADA");
    });
    for (const frase of ["10:20 fica melhor", "eu prefiro 10:20", "marca pra 10:20", "eu vou 10:20", "pode deixar às 10h20"]) {
      test(`${teste ? "homologação" : "real"}: ${frase} → resumo 10:20 → Sim → grava 10:20`, async () => {
        const t = await preparar(teste);
        const resumo = await t.turno(frase);
        expect(resumo?.texto).toContain("*Horário:* 10:20");
        expect(resumo?.texto).not.toContain("08:00");
        expect(resumo?.texto).toContain("Alex Louza");
        expect(gravacoes).toHaveLength(0);
        expect(t.estado.appointment.slot_confirmed_by_patient).toBe(false);
        const r = await t.turno("Sim");
        expect(r?.acoesConcluidas[0]?.confirmada).toBe(true);
        expect(gravacoes).toHaveLength(1);
        expect(gravacoes[0]!.inicio).toBe(t.estado.appointment.confirmation!.vaga.inicio);
        expect(gravacoes[0]!.medico_id).toBe(MEDICO);
        expect(gravacoes[0]!.procedimento).toBe("Consulta Cardiologia");
        expect(banco.agendamentos!.find(v => v.id === "vaga-0")!.paciente_nome).toBe("DISPONIVEL");
        expect(t.encaminhamentos).toHaveLength(0);
      });
    }
    for (const momento of ["antes_da_escolha", "apos_resumo"])
      test(`${teste ? "homologação" : "real"}: vaga perdida ${momento} transfere, sem reservar 08:00`, async () => {
        const t = await preparar(teste);
        if (momento === "apos_resumo") await t.turno("vou 10:20");
        banco.agendamentos!.find(v => v.id === "vaga-1")!.paciente_nome = "Outra pessoa";
        const r = await t.turno(momento === "apos_resumo" ? "Sim" : "vou 10:20");
        expect(r?.origem).toBe("handoff");
        expect(r?.texto).toContain("Não fiz nenhuma reserva alternativa");
        expect(t.encaminhamentos).toHaveLength(1);
        expect(gravacoes).toHaveLength(0);
        expect(t.estado.appointment.confirmation).toBeNull();
      });
  }
  test("aceite sem entrega do resumo não agenda; repete a confirmação correta", async () => {
    const t = await preparar();
    const resumo = await t.turno("marca pra 10:20", false);
    const r = await t.turno("Sim");
    expect(r?.texto).toBe(resumo?.texto);
    expect(gravacoes).toHaveLength(0);
    expect(t.estado.appointment.slot_confirmed_by_patient).toBe(false);
  });
  test("Sim diante de uma lista não autoriza a primeira vaga", async () => {
    const t = await preparar();
    expect((await t.turno("sim por favor"))?.chaveTemplate).toBe("fluxo.agendamento.escolher");
    expect(gravacoes).toHaveLength(0);
    const vaga = t.estado.appointment.slot_options!.vagas[0]!;
    const r = await executarFerramentaPaciente(t.ctx, "selecionar_horario", vaga);
    expect(r.ok).toBe(false);
    expect(t.estado.appointment.confirmation).toBeNull();
  });
  for (const frase of ["quero dez e vinte", "o segundo horário é melhor", "vou no último horário oferecido"])
    test(`escolha interpretada pelo modelo também é revalidada: ${frase}`, async () => {
      const t = await preparar();
      t.ctx.consultaAgenda!.mensagemAtual = frase;
      const vaga = t.estado.appointment.slot_options!.vagas[1]!;
      const r = await executarFerramentaPaciente(t.ctx, "selecionar_horario", vaga);
      expect(r.ok).toBe(true);
      expect(r.resumo_confirmacao).toContain("10:20");
      expect(gravacoes).toHaveLength(0);
    });
  test("modelo não pode substituir 10:20 por 08:00 nem inventar vaga", async () => {
    const t = await preparar(); t.ctx.consultaAgenda!.mensagemAtual = "marca pra 10:20";
    const vaga = t.estado.appointment.slot_options!.vagas[0]!;
    expect((await executarFerramentaPaciente(t.ctx, "selecionar_horario", vaga)).ok).toBe(false);
    expect((await executarFerramentaPaciente(t.ctx, "selecionar_horario", { ...vaga, medico_id: OUTRO })).ok).toBe(false);
    expect(gravacoes).toHaveLength(0);
  });
  test("horário fora da lista segue para nova consulta, sem escolher a primeira opção", async () => {
    const t = await preparar();
    expect(await t.turno("prefiro 16:00")).toBeNull();
    expect(t.estado.appointment.slot_inicio).toBeNull();
    expect(t.estado.appointment.confirmation).toBeNull();
    expect(gravacoes).toHaveLength(0);
  });
  test("falha ao encaminhar informa a falha sem prometer transferência", async () => {
    const t = await preparar(); t.falharHandoff();
    await t.turno("vou 10:20"); banco.agendamentos = [];
    const r = await t.turno("Sim");
    expect(r?.origem).toBe("erro");
    expect(r?.texto).toContain("Não consegui transferir");
    expect(gravacoes).toHaveLength(0);
  });
});
