import { beforeEach, describe, expect, mock, test } from "bun:test";
import { estadoVazio } from "../fluxo-estado-normalizar";

const CLINICA = "11111111-1111-4111-8111-111111111111";
const MEDICO = "22222222-2222-4222-8222-222222222222";
const OUTRO = "33333333-3333-4333-8333-333333333333";
const PACIENTE = "44444444-4444-4444-8444-444444444444";
const AGENDAMENTO = "55555555-5555-4555-8555-555555555555";
type Linha = Record<string, unknown>;
let banco: Record<string, Linha[]>;
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
        gte: () => q,
        lte: () => q,
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
  return {
    clinicaId: CLINICA,
    telefone: null,
    pacienteId: null,
    pacienteNome: null,
    conversaId: null,
    origem: "homologacao" as const,
    teste: true,
    estado: estadoVazio(),
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
      slot_inicio: inicio.toISOString(),
      slot_fim: fim.toISOString(),
      slot_confirmed_by_patient: true,
    });
  return ctx;
}

beforeEach(() => {
  leituras.length = 0;
  auditoria.length = 0;
  gravacoes.length = 0;
  banco = {
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
  };
});

describe("executor real das ferramentas com banco simulado", () => {
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
