import { beforeEach, describe, expect, mock, test } from "bun:test";
import { estadoVazio } from "../fluxo-estado-normalizar";
import { consultaDoNovoTurno, type ConhecimentoSessao } from "../confidence/conhecimento-sessao";
import type { ResultadoConhecimento } from "../knowledge-contract";
import { comColetor } from "../evidencias.server";
import { resumoEntregueFixture } from "./agendamento-fixture";
import { aplicarGateIdentificacao } from "../identificacao-gate.server";
import type { CtxNinaPaciente } from "../paciente-tools.server";

const CLINICA = "11111111-1111-4111-8111-111111111111";
const MEDICO = "22222222-2222-4222-8222-222222222222";
const OUTRO = "33333333-3333-4333-8333-333333333333";
const PACIENTE = "44444444-4444-4444-8444-444444444444";
const AGENDAMENTO = "55555555-5555-4555-8555-555555555555";
const CATALOGO = "66666666-6666-4666-8666-666666666666";
type Linha = Record<string, unknown>;
let banco: Record<string, Linha[]>;
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
      const ler = () => {
        leituras.push({ tabela, filtros: { ...filtros } });
        const linhas = banco[tabela]!.filter((r) => predicados.every((p) => p(r)));
        if (atualizacao) for (const linha of linhas) Object.assign(linha, atualizacao);
        return linhas;
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
        gte: (k: string, v: unknown) => { predicados.push((r) => String(r[k]) >= String(v)); return q; },
        lte: (k: string, v: unknown) => { predicados.push((r) => String(r[k]) <= String(v)); return q; },
        order: () => q,
        limit: () => q,
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
    const linha = { ...entrada.payload, id: AGENDAMENTO };
    const index = banco.agendamentos!.findIndex((r) => r.id === entrada.editing_id);
    if (index >= 0) banco.agendamentos![index] = linha;
    else banco.agendamentos!.push(linha);
    return { ok: true, id: AGENDAMENTO };
  },
}));

const { executarFerramentaPaciente } = await import("../paciente-tools.server");

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
    nina_cat_profissionais: [
      {
        id: CATALOGO,
        clinica_id: CLINICA,
        nome: "Alex Louza",
        medico_id: null,
        status: "PUBLICADO",
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
    nina_mensagens_templates: [],
  };
});

describe("executor real das ferramentas com banco simulado", () => {
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
        expect(r?.texto).toContain("Nenhum outro horário foi agendado");
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
