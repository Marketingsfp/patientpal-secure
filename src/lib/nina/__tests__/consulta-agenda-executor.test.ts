import { beforeEach, describe, expect, mock, test } from "bun:test";
import { estadoVazio } from "../fluxo-estado-normalizar";
import { consultaDoNovoTurno, type ConhecimentoSessao } from "../confidence/conhecimento-sessao";
import type { ResultadoConhecimento } from "../knowledge-contract";
import { comColetor } from "../evidencias.server";
import { resumoEntregueFixture } from "./agendamento-fixture";
import { aplicarGateIdentificacao } from "../identificacao-gate.server";
import type { CtxNinaPaciente } from "../paciente-tools.server";
import { resultadoAgendamentoConfirmado } from "../resposta/agendamento";
import { validarResultado } from "../tool-broker";
import { encaminhamentoSemVagas } from "../agenda-sem-vagas";
import { cardiologiaAlex, avaliacaoOdontologica } from "./fixtures/consultas-publicadas.fixture";
import { atendimentosEstruturados } from "../catalogo-estrutura";
import { servicoParaRegistro, type ServicoPublicado } from "../catalogo-conhecimento";
import { aceitarResumoEntregue } from "../agendamento-escolha";
import { normalizarEstado } from "../fluxo-estado-normalizar";

const CLINICA = "11111111-1111-4111-8111-111111111111";
const MEDICO = "22222222-2222-4222-8222-222222222222";
const OUTRO = "33333333-3333-4333-8333-333333333333";
const PACIENTE = "44444444-4444-4444-8444-444444444444";
const AGENDAMENTO = "55555555-5555-4555-8555-555555555555";
const CATALOGO = "66666666-6666-4666-8666-666666666666";
type Linha = Record<string, unknown>;
let banco: Record<string, Linha[]>;
let falharLeituraFicha = false;
let falharAgendaMedico: string | null = null;
let falharEscala = false;
let procedimentoGravadoDivergente = false;
let resultadoCatalogo: ResultadoConhecimento;
let cadastroResolvido: { id: string; criado: boolean } | null = null;
const pesquisas: unknown[] = [];
const leituras: Array<{ tabela: string; filtros: Record<string, unknown> }> = [];
const auditoria: Linha[] = [];
const gravacoes: Linha[] = [];
const inicio = new Date(Date.now() + 2 * 86_400_000);
inicio.setUTCHours(17, 0, 0, 0);
const fim = new Date(inicio.getTime() + 30 * 60_000);

function estruturaModalidadeServico(nome: string, modalidade = "hora_marcada") {
  return { complementos: [{ chave: atendimentosEstruturados(null, null, undefined, nome)[0]!.chave, modalidade }] };
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    async rpc(nome: string, args: Linha) {
      if (nome !== "nina_resolver_cadastro" || !cadastroResolvido) throw new Error("RPC inesperada");
      expect(args._telefone).toBe("55000100391");
      expect(args._nome).toBe("PACIENTE HOMONIMO");
      expect(args._data_nascimento).toBe("1990-01-02");
      return { data: { ok: true, paciente_id: cadastroResolvido.id, criado: cadastroResolvido.criado }, error: null };
    },
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
        if (tabela === "medico_disponibilidades" && falharEscala) throw new Error("Falha simulada de escala");
        if (tabela === "agendamentos" && falharAgendaMedico &&
          (filtros.medico_id as string[] | undefined)?.includes(falharAgendaMedico))
          throw new Error("Falha simulada de agenda");
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
    const linha: Linha = { ...banco.agendamentos![index], ...entrada.payload, id: AGENDAMENTO };
    if (procedimentoGravadoDivergente) linha.procedimento = "Consulta — GINECOLOGIA";
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
      expect(r?.texto).toBe("");
      expect(r?.estado).toBe("descartar");
      expect(r?.restricoes).toContain("handoff_sfp_silencioso");
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
  cadastroResolvido = null;
  procedimentoGravadoDivergente = false;
  falharEscala = false;
  falharLeituraFicha = false;
  falharAgendaMedico = null;
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

function vincularProcedimentoTeste(servico: Linha) {
  servico.procedimento_id = "procedimento-operacional";
  banco.procedimentos = [{ id: "procedimento-operacional", clinica_id: CLINICA, ativo: true, tipo: "exame", nome: "Nome operacional diferente" }];
  banco.medico_agenda_procedimentos = [{ clinica_id: CLINICA, procedimento_id: "procedimento-operacional", agenda_id: "agenda-exame" }];
  banco.medico_agendas = [{ id: "agenda-exame", clinica_id: CLINICA, medico_id: MEDICO, ativo: true, ordem_chegada: false }];
  banco.agendamentos![0]!.agenda_id = "agenda-exame";
}

describe("procedimentos do Lead 01 não viram consultas", () => {
  async function iniciar(nome = "Bioimpedância", medico = "Mariana Portugal") {
    banco.medicos![0]!.nome = medico;
    Object.assign(banco.nina_cat_profissionais![0]!, { nome: medico, tipo_atendimento: "Ordem de chegada",
      especialidades: [{ nome: "Nutrição" }] });
    const servico = { id: PACIENTE, clinica_id: CLINICA, status: "PUBLICADO", nome,
      executantes: [{ nome: medico }], estrutura: estruturaModalidadeServico(nome),
      valor: 100, formas_pagamento: [], descricao_publica: null, valor_observacao: null, preparo: null, restricoes: null };
    vincularProcedimentoTeste(servico);
    banco.nina_cat_servicos!.push(servico);
    resultadoCatalogo = { ...resultadoCatalogo, tipo_atendimento: "exame_procedimento", procedure: nome,
      records: [servicoParaRegistro(servico as ServicoPublicado)], doctors: [medico] };
    const ctx: CtxNinaPaciente = { ...contexto(`Quero ${nome}`), podeAgendar: true, pacienteId: PACIENTE, pacienteNome: "Paciente Fictício" };
    Object.assign(ctx.estado!.patient, { id: PACIENTE, identified: true, validated: true });
    await executarFerramentaPaciente(ctx, "consultar_base_conhecimento", { termo: nome, tipo_atendimento: "exame_procedimento" });
    return { ctx, servico };
  }
  async function escolher(ctx: CtxNinaPaciente) {
    const vagas = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
    expect(vagas.ok, JSON.stringify(vagas)).toBe(true);
    ctx.consultaAgenda!.mensagemAtual = "14:00";
    const selecionada = await executarFerramentaPaciente(ctx, "selecionar_horario", argumentosAgendar);
    expect(selecionada.ok, JSON.stringify(selecionada)).toBe(true);
    return selecionada;
  }
  test.each([true, false])("cadastro %s: identificação e reserva usam o mesmo ID do Clínica OS", async criado => {
    const { ctx } = await iniciar();
    const escolha = await escolher(ctx);
    ctx.pacienteId = null;
    ctx.pacienteNome = null;
    Object.assign(ctx.estado!.patient, { id: null, identified: false, validated: false });
    ctx.telefone = "55000100391";
    cadastroResolvido = { id: "77777777-7777-4777-8777-777777777777", criado };
    const cadastro = await executarFerramentaPaciente(ctx, "identificar_paciente", {
      nome: "Paciente Homonimo", data_nascimento: "02/01/1990", telefone: "21911112222",
    });
    expect(cadastro).toMatchObject({ ok: true, paciente: { cadastro: criado ? "novo" : "existente" } });
    expect(gravacoes).toHaveLength(0);
    expect(aceitarResumoEntregue(ctx.estado!, CLINICA, [{ role: "assistant", content: String(escolha.resumo_confirmacao) }])).toBe(true);
    const r = await executarFerramentaPaciente(ctx, "agendar", { ...argumentosAgendar, procedimento: "Bioimpedância" });
    expect(r).toMatchObject({ ok: true, verificado_no_banco: true });
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0]!.paciente_id).toBe(cadastroResolvido.id);
    expect(banco.agendamentos!.find(row => row.id === AGENDAMENTO)?.paciente_id).toBe(cadastroResolvido.id);
  });
  test.each([
    ["Aplicação de varizes", "André Luis", "Angiologia"],
    ["Curva tensional", "João Hélio", "Oftalmologia"],
    ["Ecobiometria", "João Hélio", "Oftalmologia"],
    ["Ecocardiograma", "Rosângela Riolino", "Cardiologia"],
    ["Infiltração visco ácido hialurônico 1", "Eugenio Cesar", "Ortopedia"],
    ["Bioimpedância", "Mariana Portugal", "Nutrição"],
  ])("%s: preserva fonte, executante, resumo e gravação", async (nome, medico, especialidade) => {
    const { ctx } = await iniciar(nome, medico);
    const quantidadeBuscas = pesquisas.length;
    const auxiliar = await executarFerramentaPaciente(ctx, "buscar_medicos", { nome: medico, especialidade });
    expect(auxiliar).toMatchObject({ ok: true, tipo_atendimento: "exame_procedimento", procedure: nome,
      pedido_interpretado: { atendimento: nome }, vinculos_agenda: [{ catalogo_id: PACIENTE, medico_id: MEDICO }] });
    expect(pesquisas).toHaveLength(quantidadeBuscas); // não pesquisa uma consulta para resolver o executante
    // Uma pesquisa auxiliar posterior não pode substituir a identidade do pedido.
    ctx.estado!.knowledge_context = { versao: 1, clinicaId: CLINICA, sessionId: ctx.estado!.session_id!,
      consulta: { termo: especialidade, tipo_atendimento: "consulta" },
      referencias: [{ registro: CATALOGO, versao: null, procedimento: `Consulta ${especialidade}`, medicoNome: medico }] };
    ctx.estado = normalizarEstado(JSON.parse(JSON.stringify(ctx.estado)));
    const selecionada = await escolher(ctx);
    expect(selecionada.resumo_confirmacao).toContain(nome);
    expect(selecionada.resumo_confirmacao).not.toContain(`Consulta ${especialidade}`);
    expect(ctx.estado!.appointment.confirmation!.vaga).toMatchObject({ procedimento: nome, catalogo_id: PACIENTE,
      tipo_atendimento: "exame_procedimento", modalidade: "hora_marcada" });
    expect(gravacoes).toHaveLength(0);
    expect(aceitarResumoEntregue(ctx.estado!, CLINICA, [{ role: "assistant", content: String(selecionada.resumo_confirmacao) }])).toBe(true);
    const gravado = await executarFerramentaPaciente(ctx, "agendar", { ...argumentosAgendar, procedimento: nome });
    expect(gravado).toMatchObject({ ok: true, verificado_no_banco: true, agendamento: { procedimento: nome } });
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0]!.procedimento).toBe(nome);
    expect(banco.agendamentos!.find(r => r.id === AGENDAMENTO)?.procedimento).toBe(nome);
  });
  test.each(["arquivado", "outra_clinica", "executante_removido"])("vínculo %s impede oferecer consulta substituta", async modo => {
    const { ctx, servico } = await iniciar();
    if (modo === "arquivado") servico.status = "ARQUIVADO";
    else if (modo === "outra_clinica") servico.clinica_id = OUTRO;
    else servico.executantes = [];
    const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
    expect(r).toMatchObject({ ok: false, codigo: "ATENDIMENTO_AGENDA_NAO_VINCULADO" });
    expect(gravacoes).toHaveLength(0);
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("modalidade da consulta não supre modalidade ausente no procedimento", async () => {
    const { ctx, servico } = await iniciar();
    servico.estrutura.complementos = [];
    banco.medico_agendas![0]!.ordem_chegada = null;
    banco.nina_cat_profissionais![0]!.tipo_atendimento = "Hora marcada";
    const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
    expect(r).toMatchObject({ ok: false, erro: "MODALIDADE_NAO_DEFINIDA" });
    expect(gravacoes).toHaveLength(0);
  });
  test("consulta diferente não pode ser gravada com o aceite do procedimento", async () => {
    const { ctx } = await iniciar();
    const r = await escolher(ctx);
    aceitarResumoEntregue(ctx.estado!, CLINICA, [{ role: "assistant", content: String(r.resumo_confirmacao) }]);
    const errado = await executarFerramentaPaciente(ctx, "agendar", { ...argumentosAgendar, procedimento: "Consulta Nutrição" });
    expect(errado.ok).toBe(false);
    expect(gravacoes).toHaveLength(0);
    // Mesmo adulterando o nome nos dois campos, o pedido original é independente.
    ctx.estado!.appointment.procedure = "Consulta Nutrição";
    ctx.estado!.appointment.confirmation!.vaga.procedimento = "Consulta Nutrição";
    const adulterado = await executarFerramentaPaciente(ctx, "agendar", { ...argumentosAgendar, procedimento: "Consulta Nutrição" });
    expect(adulterado).toMatchObject({ ok: false, codigo: "ATENDIMENTO_AGENDA_NAO_VINCULADO" });
    expect(gravacoes).toHaveLength(0);
  });
  test("executante com nome publicado diferente usa o vínculo explícito da agenda", async () => {
    const { ctx, servico } = await iniciar();
    servico.executantes = [{ nome: "Dra. Mariana", medico_id: MEDICO } as { nome: string }];
    const r = await executarFerramentaPaciente(ctx, "buscar_medicos", { nome: "Dra. Mariana" });
    expect(r).toMatchObject({ ok: true, vinculos_agenda: [{ medico_id: MEDICO }] });
    expect((await escolher(ctx)).resumo_confirmacao).toContain("Bioimpedância");
  });
  test("vínculo explícito inválido não é substituído pela coincidência de nome", async () => {
    const { ctx, servico } = await iniciar();
    servico.executantes = [{ nome: "Mariana Portugal", medico_id: OUTRO } as { nome: string }];
    const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
    expect(r).toMatchObject({ ok: false, codigo: "ATENDIMENTO_AGENDA_NAO_VINCULADO" });
    expect(gravacoes).toHaveLength(0);
  });
  test("nome de executante não reconhecido pede esclarecimento sem perder o serviço", async () => {
    const { ctx } = await iniciar();
    const r = await executarFerramentaPaciente(ctx, "buscar_medicos", { nome: "Nome inexistente" });
    expect(r).toMatchObject({ ok: true, tipo_atendimento: "exame_procedimento", procedure: "Bioimpedância",
      esclarecimento: { tipo: "profissional", motivo: "medico_nao_identificado", atendimento: "Bioimpedância" } });
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("remoção de executante depois do aceite impede a gravação", async () => {
    const { ctx, servico } = await iniciar();
    const r = await escolher(ctx);
    aceitarResumoEntregue(ctx.estado!, CLINICA, [{ role: "assistant", content: String(r.resumo_confirmacao) }]);
    servico.executantes = [];
    const gravado = await executarFerramentaPaciente(ctx, "agendar", { ...argumentosAgendar, procedimento: "Bioimpedância" });
    expect(gravado).toMatchObject({ ok: false, codigo: "ATENDIMENTO_AGENDA_NAO_VINCULADO" });
    expect(gravacoes).toHaveLength(0);
  });
  test("primeiro disponível não troca procedimento ativo por consulta", async () => {
    const { ctx } = await iniciar();
    const r = await executarFerramentaPaciente(ctx, "consultar_primeiro_disponivel", { tipo: "consulta", atendimento: "Nutrição" });
    expect(r).toMatchObject({ ok: false, codigo: "ATENDIMENTO_AGENDA_NAO_VINCULADO" });
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("sigla CVC preserva ID e exclui outra agenda do mesmo executante", async () => {
    const { ctx } = await iniciar("CVC (CAMPO VISUAL COMPUTADORIZADO)");
    banco.agendamentos!.unshift({ ...banco.agendamentos![0], id: "outra-vaga", agenda_id: "outra-agenda",
      inicio: new Date(inicio.getTime() - 3600000).toISOString() });
    ctx.consultaAgenda!.mensagemAtual = "o primeiro disponível";
    const r = await executarFerramentaPaciente(ctx, "consultar_primeiro_disponivel", { tipo: "procedimento", atendimento: "CVC" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.proxima).toMatchObject({ inicio: inicio.toISOString() });
    expect(ctx.estado!.appointment.slot_options?.vagas[0]).toMatchObject({ procedimento_id: "procedimento-operacional", agenda_id: "agenda-exame" });
    expect(gravacoes).toHaveLength(0);
  });
  test.each(["sem_id", "outra_clinica", "inativo", "consulta", "sem_agenda", "agenda_inativa", "vinculo_alterado"])("%s é pendência de vínculo, não falta de vagas", async caso => {
    const { ctx, servico } = await iniciar();
    if (caso === "sem_id") (servico as Linha).procedimento_id = null;
    if (caso === "outra_clinica") banco.procedimentos![0]!.clinica_id = OUTRO;
    if (caso === "inativo") banco.procedimentos![0]!.ativo = false;
    if (caso === "consulta") banco.procedimentos![0]!.tipo = "consulta";
    if (caso === "sem_agenda") banco.medico_agenda_procedimentos = [];
    if (caso === "agenda_inativa") banco.medico_agendas![0]!.ativo = false;
    if (caso === "vinculo_alterado") ctx.estado!.appointment.procedimento_solicitado!.procedimento_id = "outro-id";
    const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
    expect(r).toMatchObject({ ok: false, codigo: "PROCEDIMENTO_AGENDA_NAO_VINCULADO", encaminhar_para_humano: true });
    expect(gravacoes).toHaveLength(0);
  });
  test("primeiro disponível com executante genérico sem vínculo informa falha da agenda do procedimento", async () => {
    const { ctx, servico } = await iniciar("Mamografia");
    servico.executantes = [{ nome: "Técnica" }];
    const r = await executarFerramentaPaciente(ctx, "consultar_primeiro_disponivel", { tipo: "procedimento", atendimento: "Mamografia" });
    expect(r).toMatchObject({ ok: false, codigo: "ATENDIMENTO_AGENDA_NAO_VINCULADO", comparacao_completa: false });
    expect(r.erro).not.toBe("DOCTOR_NOT_FOUND");
    expect(gravacoes).toHaveLength(0);
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("alterar o vínculo após o aceite não grava outra identidade", async () => {
    const { ctx, servico } = await iniciar();
    const r = await escolher(ctx);
    aceitarResumoEntregue(ctx.estado!, CLINICA, [{ role: "assistant", content: String(r.resumo_confirmacao) }]);
    (servico as Linha).procedimento_id = "procedimento-substituto";
    const gravado = await executarFerramentaPaciente(ctx, "agendar", { ...argumentosAgendar, procedimento: "Bioimpedância" });
    expect(gravado).toMatchObject({ ok: false, codigo: "PROCEDIMENTO_AGENDA_NAO_VINCULADO" });
    expect(gravacoes).toHaveLength(0);
  });
  test("renomear a publicação não quebra o vínculo operacional já selecionado", async () => {
    const { ctx, servico } = await iniciar();
    const r = await escolher(ctx);
    aceitarResumoEntregue(ctx.estado!, CLINICA, [{ role: "assistant", content: String(r.resumo_confirmacao) }]);
    servico.nome = "Bioimpedância corporal";
    servico.estrutura = estruturaModalidadeServico(servico.nome);
    const gravado = await executarFerramentaPaciente(ctx, "agendar", { ...argumentosAgendar, procedimento: "Bioimpedância" });
    expect(gravado).toMatchObject({ ok: true, atendimento: { procedimento_id: "procedimento-operacional" } });
    expect(gravacoes).toHaveLength(1);
  });
  test("releitura detecta serviço gravado divergente e não anuncia sucesso", async () => {
    const { ctx } = await iniciar();
    const r = await escolher(ctx);
    aceitarResumoEntregue(ctx.estado!, CLINICA, [{ role: "assistant", content: String(r.resumo_confirmacao) }]);
    procedimentoGravadoDivergente = true;
    const gravado = await executarFerramentaPaciente(ctx, "agendar", { ...argumentosAgendar, procedimento: "Bioimpedância" });
    expect(gravado).toMatchObject({ ok: false, erro: "APPOINTMENT_UNCERTAIN" });
    expect(ctx.estado!.appointment.appointment_id).toBeNull();
  });
});

describe("pesquisa com atendimento e objetivos separados", () => {
  test("encaminha a categoria de exame até a busca, mesmo quando há intenção de agendar", async () => {
    const r = await executarFerramentaPaciente(contexto("Quero marcar ECG"), "consultar_base_conhecimento", {
      termo: "ECG", tipo_atendimento: "exame_procedimento", objetivos: ["agendamento"],
    });
    expect(r.ok).toBe(true);
    expect(pesquisas[0]).toMatchObject({ query: "ECG", tipo_atendimento: "exame_procedimento" });
    expect(r.pedido_interpretado).toMatchObject({ tipo_atendimento: "exame_procedimento" });
    expect(consultasAgenda()).toHaveLength(0);
  });
  test.each([
    ["buscar_medicos", { especialidade: "Cardiologia" }, "consulta"],
    ["buscar_procedimentos", { termo: "ECG" }, "exame_procedimento"],
  ] as const)("%s também separa as categorias na fonte", async (nome, args, tipo_atendimento) => {
    await executarFerramentaPaciente(contexto("Informações"), nome, args);
    expect(pesquisas[0]).toMatchObject({ tipo_atendimento });
  });
  for (const origem of ["homologacao", "whatsapp"] as const) {
    test(`${origem}: valor, horários e médicos não viram termos de busca nem intenção de agendar`, async () => {
      const ctx = { ...contexto("Qual o valor de cardiologia, quais médicos atendem e em quais dias?"), origem };
      const objetivos = ["valor", "horarios", "medicos"];
      const r = await executarFerramentaPaciente(ctx, "consultar_base_conhecimento", {
        termo: "cardiologia", objetivos, tipo_atendimento: "consulta",
      });
      expect(r.ok).toBe(true);
      expect(pesquisas).toEqual([{
        clinicaId: CLINICA, query: "cardiologia", tipo_atendimento: "consulta", medico: null, dia: null, canal: "whatsapp",
      }]);
      expect(r.pedido_interpretado).toEqual({ atendimento: "cardiologia", tipo_atendimento: "consulta", objetivos });
      expect(ctx.estado.appointment.intent_confirmed).not.toBe(true);
      expect(consultasAgenda()).toHaveLength(0);
      expect(gravacoes).toHaveLength(0);
    });
  }
});

describe("primeiro disponível entre todos os profissionais publicados", () => {
  const oferta = "Você prefere escolher um desses profissionais ou quer que eu consulte quem tem a disponibilidade mais próxima?";
  const pedido = { tipo: "consulta", atendimento: "Cardiologia" };
  const chamar = (mensagem = "o primeiro disponível", args: Record<string, unknown> = pedido) => {
    const ctx = contexto(mensagem, oferta);
    return { ctx, resultado: executarFerramentaPaciente(ctx, "consultar_primeiro_disponivel", args) };
  };
  beforeEach(() => {
    Object.assign(banco.nina_cat_profissionais![0]!, {
      especialidades: [{ nome: "Cardiologia" }], atende_consultorio: true,
      formas_pagamento: [{ forma: "Dinheiro", valor: 120 }, { forma: "Cartão", valor: 145 }],
    });
    banco.nina_cat_profissionais!.push({ ...banco.nina_cat_profissionais![0],
      id: AGENDAMENTO, nome: "Maria Teste", medico_id: OUTRO,
      formas_pagamento: [{ forma: "Dinheiro", valor: 200 }, { forma: "Cartão", valor: 230 }],
      tipo_atendimento: "Ordem de chegada com pré-agendamento" });
    banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "Maria Teste", ativo: true, especialidade_id: null });
    banco.agendamentos!.push({ ...banco.agendamentos![0], id: "vaga-b", medico_id: OUTRO,
      inicio: new Date(inicio.getTime() - 60 * 60_000).toISOString(),
      fim: new Date(fim.getTime() - 60 * 60_000).toISOString() });
  });
  for (const origem of ["homologacao", "whatsapp"] as const) {
    test(`${origem}: compara ambos e devolve a médica mais próxima com seus preços e modalidade`, async () => {
      const ctx = { ...contexto("o primeiro disponível", oferta), origem, teste: origem === "homologacao" };
      const r = await executarFerramentaPaciente(ctx, "consultar_primeiro_disponivel", pedido);
      expect(r.ok).toBe(true);
      expect(r.proxima).toMatchObject({ medico_id: OUTRO, medico: "Maria Teste",
        modalidade_atendimento: "chegada_com_pre_agendamento", registro: { preco_dinheiro: 200, preco_cartao: 230 } });
      expect((r.proxima as Linha).orientacao).not.toContain("30 minutos");
      expect(leituras.filter(l => l.tabela === "agendamentos").flatMap(l => l.filtros.medico_id)).toContain(MEDICO);
      expect(ctx.estado.appointment.slot_options?.vagas[0]).toMatchObject({ medico_id: OUTRO, procedimento: "Consulta — Cardiologia" });
      expect(ctx.estado.appointment.confirmation).toBeNull();
      expect(ctx.estado.appointment.slot_inicio).toBeNull();
      expect(gravacoes).toHaveLength(0);
    });
  }
  test("um médico sem vagas não impede comparar o outro", async () => {
    banco.agendamentos = banco.agendamentos!.filter(s => s.medico_id === MEDICO);
    const r = await chamar().resultado;
    expect(r.proxima).toMatchObject({ medico_id: MEDICO, modalidade_atendimento: "hora_marcada" });
    expect((r.proxima as Linha).orientacao).toContain("30 minutos");
    expect(encaminhamentoSemVagas(validarResultado("consultar_primeiro_disponivel", r), pedido)).toBeNull();
  });
  test("nenhuma vaga em todas as agendas aciona a regra de encaminhamento", async () => {
    banco.agendamentos = [];
    const r = await chamar().resultado;
    expect(r).toMatchObject({ ok: true, reason: "NO_AVAILABILITY" });
    expect(encaminhamentoSemVagas(validarResultado("consultar_primeiro_disponivel", r), pedido)).not.toBeNull();
  });
  test("empate mostra ambos e não seleciona silenciosamente", async () => {
    Object.assign(banco.agendamentos![1]!, { inicio: inicio.toISOString(), fim: fim.toISOString() });
    const { ctx, resultado } = chamar();
    const r = await resultado;
    expect((r.empatados as Linha[])).toHaveLength(1);
    expect(ctx.estado.appointment.slot_options?.vagas).toHaveLength(2);
    expect(ctx.estado.appointment.confirmation).toBeNull();
  });
  test("respeita o dia pedido sem oferecer a próxima data", async () => {
    const data = new Date(inicio.getTime() + 86_400_000).toISOString().slice(0, 10);
    const r = await chamar("primeiro disponível", { ...pedido, data }).resultado;
    expect(r).toMatchObject({ reason: "NO_AVAILABILITY" });
  });
  test("mantém todos os candidatos, inclusive além dos seis primeiros do catálogo", async () => {
    for (let i = 0; i < 8; i++) {
      const id = `77777777-7777-4777-8777-${String(i).padStart(12, "0")}`;
      banco.nina_cat_profissionais!.unshift({ ...banco.nina_cat_profissionais![0], id, nome: `Teste ${i}`, medico_id: id });
      banco.medicos!.push({ id, clinica_id: CLINICA, nome: `Teste ${i}`, ativo: true });
    }
    const r = await chamar().resultado;
    expect(r.proxima).toMatchObject({ medico_id: OUTRO });
  });
  test("paginação não perde a vaga depois de 800 horários ocupados", async () => {
    banco.agendamentos = [...Array.from({ length: 805 }, (_, i) => ({ ...banco.agendamentos![0], id: `ocupado-${i}`, paciente_nome: "PACIENTE SIMULADO" })), ...banco.agendamentos!];
    const r = await chamar().resultado;
    expect(r.proxima).toMatchObject({ medico_id: OUTRO });
  });
  test("não inclui especialidade diferente, rascunho ou outra clínica", async () => {
    banco.nina_cat_profissionais![1]!.especialidades = [{ nome: "Dermatologia" }];
    banco.nina_cat_profissionais!.push({ ...banco.nina_cat_profissionais![0], id: PACIENTE, medico_id: OUTRO, status: "RASCUNHO" });
    banco.nina_cat_profissionais!.push({ ...banco.nina_cat_profissionais![0], id: OUTRO, medico_id: OUTRO, clinica_id: OUTRO });
    const r = await chamar().resultado;
    expect(r.proxima).toMatchObject({ medico_id: MEDICO });
  });
  test("SFP mantém encaminhamento obrigatório", async () => {
    banco.nina_cat_profissionais![1]!.nome = "SFP";
    const r = await chamar().resultado;
    expect(r).toMatchObject({ ok: false, erro: "PROFISSIONAL_SFP" });
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("falha em uma agenda não permite afirmar qual é a mais próxima", async () => {
    falharAgendaMedico = OUTRO;
    const { ctx, resultado } = chamar();
    const r = await resultado;
    expect(r).toMatchObject({ ok: false, codigo: "AGENDA_QUERY_FAILED" });
    expect(r.proxima).toBeUndefined();
    expect(ctx.estado.appointment.slot_options).toBeNull();
  });
  test("sem pré-agendamento aparece como comparecimento e não como vaga para reservar", async () => {
    banco.nina_cat_profissionais![1]!.tipo_atendimento = "Ordem de chegada sem pré-agendamento";
    const r = await chamar().resultado;
    expect((r.sem_pre_agendamento as Linha[])[0]).toMatchObject({ medico: "Maria Teste", sem_agendamento: true });
    expect((r.sem_pre_agendamento as Linha[])[0]!.orientacao).not.toContain("30 minutos");
    expect(r.proxima).toMatchObject({ medico_id: MEDICO });
  });
  test("ficha traz sua modalidade e orientação de antecedência", async () => {
    banco.nina_cat_profissionais![1]!.tipo_atendimento = "Por ficha";
    const r = await chamar().resultado;
    expect(r.proxima).toMatchObject({ modalidade_atendimento: "ficha" });
    expect((r.proxima as Linha).orientacao).toContain("30 minutos");
  });
  test.each(["preciso de quem consiga me atender antes da viagem", "tanto faz a pessoa, quanto antes melhor"])(
    "decisão contextual do modelo chega à comparação sem filtro literal: %s", async (mensagem) => {
    const { ctx, resultado } = chamar(mensagem);
    const r = await resultado;
    expect(r.ok).toBe(true);
    expect(r.proxima).toMatchObject({ medico_id: OUTRO });
    expect(ctx.estado.appointment.confirmation).toBeNull();
    expect(ctx.estado.appointment.slot_inicio).toBeNull();
    expect(gravacoes).toHaveLength(0);
  });
  test("preço de outra especialidade do mesmo médico não entra na proposta", async () => {
    banco.nina_cat_profissionais![1]!.especialidades = [{ nome: "Cardiologia" }, { nome: "Dermatologia" }];
    banco.nina_cat_profissionais![1]!.formas_pagamento = [
      { forma: "Dinheiro", valor: 200, condicao: "Consulta Cardiologia" },
      { forma: "Dinheiro", valor: 50, condicao: "Consulta Dermatologia" },
    ];
    const r = await chamar().resultado;
    const registro = (r.proxima as Linha).registro as Linha;
    expect((registro.extras as Linha).formas_pagamento).toEqual([
      { forma: "Dinheiro", valor: 200, condicao: "Consulta Cardiologia" },
    ]);
    expect(registro.procedimento).toBe("Consulta — Cardiologia");
  });
  test("período é respeitado antes de escolher qual profissional está mais próximo", async () => {
    const data = inicio.toISOString().slice(0, 10);
    Object.assign(banco.agendamentos![0]!, { inicio: `${data}T09:00:00-03:00`, fim: `${data}T09:30:00-03:00` });
    Object.assign(banco.agendamentos![1]!, { inicio: `${data}T14:00:00-03:00`, fim: `${data}T14:30:00-03:00` });
    const r = await chamar("primeiro disponível à tarde", { ...pedido, periodo: "tarde" }).resultado;
    expect(r.proxima).toMatchObject({ medico_id: OUTRO, hora: "14:00" });
  });
  test("busca cobre a janela de 60 dias declarada", async () => {
    const distante = new Date(inicio.getTime() + 40 * 86_400_000).toISOString();
    banco.agendamentos = [{ ...banco.agendamentos![0], inicio: distante, fim: new Date(Date.parse(distante) + 30 * 60_000).toISOString() }];
    const r = await chamar().resultado;
    expect(r.proxima).toMatchObject({ medico_id: MEDICO, inicio: distante });
  });
  test("procedimento considera somente seus executantes e guarda seu nome", async () => {
    banco.nina_cat_servicos!.push({ id: PACIENTE, clinica_id: CLINICA, status: "PUBLICADO", nome: "Exame Teste",
      estrutura: estruturaModalidadeServico("Exame Teste"),
      executantes: [{ nome: "Alex Louza" }], formas_pagamento: [{ forma: "Dinheiro", valor: 80 }], valor: 80 });
    vincularProcedimentoTeste(banco.nina_cat_servicos![0]!);
    const { ctx, resultado } = chamar("primeiro disponível", { tipo: "procedimento", atendimento: "Exame Teste" });
    const r = await resultado;
    expect(r.proxima).toMatchObject({ medico_id: MEDICO, registro: { procedimento: "Exame Teste", preco_dinheiro: 80 } });
    expect(ctx.estado.appointment.slot_options?.vagas[0]?.procedimento).toBe("Exame Teste");
  });
  test("atendimento inexistente não consulta agendas de outra especialidade", async () => {
    const r = await chamar("primeiro disponível", { ...pedido, atendimento: "Otorrinolaringologia" }).resultado;
    expect(r).toMatchObject({ ok: false, encaminhar_para_humano: true });
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("a comparação não modifica uma vaga já confirmada", async () => {
    const ctx = contextoAgendar(true);
    ctx.consultaAgenda = { mensagemAtual: "primeiro disponível", historico: [{ role: "assistant", content: oferta }] };
    const confirmacao = JSON.stringify(ctx.estado.appointment.confirmation);
    const r = await executarFerramentaPaciente(ctx, "consultar_primeiro_disponivel", pedido);
    expect(r.ok).toBe(true);
    expect(JSON.stringify(ctx.estado.appointment.confirmation)).toBe(confirmacao);
    expect(gravacoes).toHaveLength(0);
  });
});

describe("consulta com preventivo conserva o atendimento publicado", () => {
  const comPreventivo = "CONSULTA + PREVENTIVO — GINECOLOGIA";
  function preparar(variante: "com" | "sem", origem: "homologacao" | "whatsapp" = "homologacao") {
    Object.assign(banco.nina_cat_profissionais![0]!, {
      especialidades: [{ nome: "GINECOLOGIA" }, { nome: "CLÍNICO GERAL" }],
      observacao_publica: "CONSULTA + PREVENTIVO\nEspecialidade: GINECOLOGIA\nDinheiro: R$ 172,00\nPix/cartão: R$ 205,00\nObservação: Agendado\n\n" +
        "CONSULTA GINECOLOGIA\nEspecialidade: GINECOLOGIA\nDinheiro: R$ 120,00\nPix/cartão: R$ 145,00\nObservação: Agendado\n\n" +
        "CONSULTA CLÍNICO GERAL\nEspecialidade: CLÍNICO GERAL\nDinheiro: R$ 100,00\nObservação: Agendado",
      formas_pagamento: [{ forma: "Dinheiro", condicao: "Consulta + Preventivo", valor: 172 },
        { forma: "Dinheiro", condicao: "Consulta Ginecologia", valor: 120 },
        { forma: "Dinheiro", condicao: "Consulta Clínico Geral", valor: 100 }],
    });
    const ctx: CtxNinaPaciente = { ...contexto("Primeira data com Alex Louza"), origem,
      teste: origem === "homologacao", podeAgendar: true, pacienteId: PACIENTE, pacienteNome: "Paciente Fictício" };
    ctx.estado!.knowledge_context = { versao: 1, clinicaId: CLINICA, sessionId: ctx.estado!.session_id!,
      consulta: { termo: "Ginecologia", tipo_atendimento: "consulta" },
      referencias: [{ registro: CATALOGO, versao: null, procedimento: "Consulta — GINECOLOGIA", medicoNome: "Alex Louza" }],
      atendimentoConsulta: { especialidade: "GINECOLOGIA", preventivo: variante } };
    return ctx;
  }
  for (const origem of ["homologacao", "whatsapp"] as const) for (const variante of ["com", "sem"] as const) {
    test(`${origem}: ${variante} preventivo → vaga → dados → resumo → aceite → agenda → conclusão`, async () => {
      const ctx = preparar(variante, origem);
      ctx.estado!.knowledge_context!.consulta.termo = `ginecologia ${variante} preventivo`;
      const procedimento = variante === "com" ? comPreventivo : "CONSULTA GINECOLOGIA";
      const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
      expect(r.ok).toBe(true);
      expect(ctx.estado!.appointment.slot_options?.vagas[0]?.procedimento).toBe(procedimento);
      ctx.estado = JSON.parse(JSON.stringify(ctx.estado));
      ctx.opcoesAgendamentoInicioTurno = true;
      ctx.consultaAgenda = { mensagemAtual: "Escolho 14:00", historico: [{ role: "assistant", content: "Disponível às 14:00. Qual prefere?" }] };
      const dados = await aplicarGateIdentificacao({ mensagem: "Escolho 14:00", estado: ctx.estado!, ctx, executar: executarFerramentaPaciente });
      expect(dados?.camposPendentes).toContain("nome");
      ctx.consultaAgenda = { mensagemAtual: "Paciente Fictício, 02/01/1990, (21) 99999-0000", historico: [{ role: "assistant", content: dados!.texto }] };
      const executar: typeof executarFerramentaPaciente = async (c, nome, args) =>
        nome === "consultar_cadastro_paciente" ? { ok: true, campos_faltantes: [] }
          : nome === "identificar_paciente" ? { ok: true } : executarFerramentaPaciente(c, nome, args);
      const resumo = await aplicarGateIdentificacao({ mensagem: ctx.consultaAgenda.mensagemAtual, estado: ctx.estado!, ctx, executar });
      expect(resumo?.texto).toContain(procedimento);
      expect(gravacoes).toHaveLength(0);
      ctx.estado = JSON.parse(JSON.stringify(ctx.estado));
      ctx.consultaAgenda = { mensagemAtual: "Sim, confirmo.", historico: [{ role: "assistant", content: resumo!.texto }] };
      const confirmado = await aplicarGateIdentificacao({ mensagem: ctx.consultaAgenda.mensagemAtual, estado: ctx.estado!, ctx, executar });
      expect(confirmado?.acoesConcluidas[0]?.confirmada).toBe(true);
      expect(confirmado?.texto).toContain(procedimento);
      expect(gravacoes).toHaveLength(1);
      expect(banco.agendamentos![0]!.procedimento).toBe(procedimento);
      expect(gravacoes[0]!.forma_pagamento_prevista).toBeNull();
    });
  }
  test("primeiro disponível revalida a variante e mantém somente seus preços e condições", async () => {
    preparar("com");
    const { candidatosPrimeiraVaga } = await import("../primeiro-disponivel-catalogo.server");
    const candidatos = await candidatosPrimeiraVaga(CLINICA, "consulta", "Ginecologia", { especialidade: "GINECOLOGIA", preventivo: "com" });
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]!.registro).toMatchObject({ procedimento: comPreventivo, preco_dinheiro: "R$ 172,00", preco_cartao: "R$ 205,00" });
    expect(candidatos[0]!.registro.observacoes).not.toContain("120,00");
    expect(candidatos[0]!.registro.observacoes).not.toContain("CLÍNICO GERAL");
    const ctx = preparar("sem");
    expect((await executarFerramentaPaciente(ctx, "consultar_primeiro_disponivel", { tipo: "consulta", atendimento: "Ginecologia" })).ok).toBe(true);
    expect(ctx.estado!.appointment.slot_options?.vagas[0]?.procedimento).toBe("CONSULTA GINECOLOGIA");
  });
  test.each(["ginecologia preventivo", "consulta com preventivo", "consulta + preventivo"])("%s vincula o título composto sem depender de uma busca genérica anterior", async termo => {
    const ctx = preparar("com");
    ctx.estado!.knowledge_context!.consulta.termo = termo;
    delete ctx.estado!.knowledge_context!.atendimentoConsulta;
    const r = await executarFerramentaPaciente(ctx, "consultar_primeiro_disponivel", { tipo: "consulta", atendimento: termo });
    expect(r.ok).toBe(true);
    expect(ctx.estado!.appointment.slot_options?.vagas[0]?.procedimento).toBe(comPreventivo);
  });
  test("trocar de médico não autoriza trocar o atendimento", async () => {
    const ctx = preparar("com");
    banco.nina_cat_profissionais![0]!.observacao_publica = "CONSULTA GINECOLOGIA\nEspecialidade: GINECOLOGIA\nObservação: Agendado";
    // O atendimento ausente agora é bloqueado antes da consulta de vagas:
    // não se usa a modalidade da variante sem preventivo.
    expect((await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO })).erro).toBe("MODALIDADE_NAO_DEFINIDA");
    expect(gravacoes).toHaveLength(0);
  });
  test("o título específico pode ser pesquisado diretamente sem virar duas variantes", async () => {
    preparar("com");
    const { candidatosPrimeiraVaga } = await import("../primeiro-disponivel-catalogo.server");
    const candidatos = await candidatosPrimeiraVaga(CLINICA, "consulta", "Consulta + Preventivo");
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]!.registro.procedimento).toBe(comPreventivo);
  });
  test("médico com uma única consulta publicada conserva o preventivo mesmo após pesquisa genérica", async () => {
    const ctx = preparar("com");
    delete ctx.estado!.knowledge_context!.atendimentoConsulta;
    banco.nina_cat_profissionais![0]!.observacao_publica = "CONSULTA + PREVENTIVO\nEspecialidade: GINECOLOGIA\nObservação: Agendado";
    expect((await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO })).ok).toBe(true);
    expect(ctx.estado!.appointment.procedure).toBe(comPreventivo);
  });
  test("duas variantes não são reduzidas à mesma especialidade", async () => {
    const ctx = preparar("com");
    delete ctx.estado!.knowledge_context!.atendimentoConsulta;
    expect((await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO })).codigo).toBe("ATENDIMENTO_AGENDA_NAO_VINCULADO");
  });
  test("mudança para sem preventivo invalida o resumo antigo, sem reservar", async () => {
    const ctx = contextoAgendar(true);
    ctx.estado.appointment.procedure = comPreventivo;
    ctx.estado.appointment.confirmation!.vaga.procedimento = comPreventivo;
    const r = await aplicarGateIdentificacao({ mensagem: "Agora quero sem preventivo", estado: ctx.estado, ctx, executar: executarFerramentaPaciente });
    expect(r).toBeNull();
    expect(ctx.estado.appointment.confirmation).toBeNull();
    expect(ctx.estado.appointment.slot_options).toBeNull();
    expect(gravacoes).toHaveLength(0);
  });
  test.each([false, true])("procedimento divergente não confirma sucesso nem duplica (existente=%s)", async existente => {
    const ctx = contextoAgendar(true);
    procedimentoGravadoDivergente = true;
    if (existente) banco.agendamentos = [{ ...argumentosAgendar, procedimento: "Consulta — GINECOLOGIA", id: AGENDAMENTO,
      clinica_id: CLINICA, paciente_id: PACIENTE, status: "agendado" }];
    const r = await executarFerramentaPaciente(ctx, "agendar", argumentosAgendar);
    expect(r.erro).toBe("APPOINTMENT_UNCERTAIN");
    expect(r.divergencias).toContain("procedimento");
    expect(ctx.estado.appointment.appointment_id).toBeNull();
    expect(gravacoes).toHaveLength(existente ? 0 : 1);
    const repeticao = await executarFerramentaPaciente(ctx, "agendar", argumentosAgendar);
    expect(repeticao.erro).toBe("APPOINTMENT_UNCERTAIN");
    expect(gravacoes).toHaveLength(existente ? 0 : 1);
  });
});

describe("regressões dos cadastros publicados: infantil e odontologia", () => {
  const casos = [
    { publicado: cardiologiaAlex, termo: "cardiologia infantil", procedimento: "CONSULTA CARDIOLOGIA INFANTIL", modo: "hora_marcada", valor: "R$ 160,00" },
    { publicado: cardiologiaAlex, termo: "cardiologia", procedimento: "CONSULTA CARDIOLOGIA", modo: "hora_marcada", valor: "R$ 120,00" },
    { publicado: avaliacaoOdontologica("Karen", "Seg/ter/quinta/sab 08:00h"), termo: "odontologia", procedimento: "AVALIAÇÃO ODONTOLÓGICA — ODONTOLOGIA", modo: "chegada_sem_pre_agendamento", valor: "Gratuito" },
    { publicado: avaliacaoOdontologica("Raiani", "Quarta/sex 08:00h"), termo: "avaliação odontológica", procedimento: "AVALIAÇÃO ODONTOLÓGICA — ODONTOLOGIA", modo: "chegada_sem_pre_agendamento", valor: "Gratuito" },
  ] as const;
  function preparar(caso: typeof casos[number], origem: "homologacao" | "whatsapp" = "homologacao") {
    Object.assign(banco.nina_cat_profissionais![0]!, caso.publicado);
    banco.medicos![0]!.nome = caso.publicado.nome;
    const ctx: CtxNinaPaciente = { ...contexto(`Quero agendar ${caso.termo} com ${caso.publicado.nome}`), origem,
      teste: origem === "homologacao", podeAgendar: true, pacienteId: PACIENTE, pacienteNome: "Paciente Fictício" };
    ctx.estado!.knowledge_context = { versao: 1, clinicaId: CLINICA, sessionId: ctx.estado!.session_id!,
      consulta: { termo: caso.termo, tipo_atendimento: "consulta" },
      referencias: [{ registro: CATALOGO, versao: null, procedimento: caso.procedimento, medicoNome: caso.publicado.nome }] };
    return ctx;
  }
  for (const caso of casos) {
    test(`${caso.publicado.nome}/${caso.termo}: um candidato com preços e condições próprios`, async () => {
      preparar(caso);
      const { candidatosPrimeiraVaga } = await import("../primeiro-disponivel-catalogo.server");
      for (const pedido of [caso.termo, [{ registro: CATALOGO, procedimento: caso.procedimento }]]) {
        const candidatos = await candidatosPrimeiraVaga(CLINICA, "consulta", pedido);
        expect(candidatos).toHaveLength(1);
        expect(candidatos[0]).toMatchObject({ medicoId: MEDICO, registro: { procedimento: caso.procedimento, preco_dinheiro: caso.valor } });
        expect(candidatos[0]!.registro.extras?.modalidade_atendimento).toBe(caso.modo);
      }
    });
    for (const ferramenta of ["consultar_disponibilidade", "verificar_horario", "proxima_vaga", "consultar_primeiro_disponivel"]) {
      test(`${caso.publicado.nome}/${caso.termo}: ${ferramenta} respeita o atendimento`, async () => {
        const ctx = preparar(caso);
        const r = await executarFerramentaPaciente(ctx, ferramenta, ferramenta === "consultar_primeiro_disponivel"
          ? { tipo: "consulta", atendimento: caso.termo } : { ...argumentos, medico_id: MEDICO });
        expect(r.ok).toBe(true);
        if (caso.modo === "chegada_sem_pre_agendamento") {
          expect(ctx.estado!.appointment.slot_options?.vagas ?? []).toHaveLength(0);
          expect(consultasAgenda()).toHaveLength(0);
          if (ferramenta === "consultar_primeiro_disponivel") expect(r.sem_pre_agendamento).toHaveLength(1);
          else expect(r.sem_agendamento).toBe(true);
        } else {
          expect(ctx.estado!.appointment.slot_options?.vagas[0]).toMatchObject({ procedimento: caso.procedimento, modalidade: caso.modo });
        }
        expect(gravacoes).toHaveLength(0);
      });
    }
    for (const origem of ["homologacao", "whatsapp"] as const) {
      test(`${origem}/${caso.publicado.nome}/${caso.termo}: respeita se a modalidade permite agendar`, async () => {
        const ctx = preparar(caso, origem);
        expect((await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO })).ok).toBe(true);
        if (caso.modo === "chegada_sem_pre_agendamento") {
          expect((await executarFerramentaPaciente(ctx, "consultar_cadastro_paciente", {})).erro).toBe("ACTION_NOT_AUTHORIZED");
          expect(consultasAgenda()).toHaveLength(0);
          expect(gravacoes).toHaveLength(0);
          return;
        }
        ctx.estado = JSON.parse(JSON.stringify(ctx.estado));
        ctx.opcoesAgendamentoInicioTurno = true;
        ctx.consultaAgenda = { mensagemAtual: "Escolho 14:00", historico: [{ role: "assistant", content: "Disponível às 14:00. Qual prefere?" }] };
        const dados = await aplicarGateIdentificacao({ mensagem: ctx.consultaAgenda.mensagemAtual, estado: ctx.estado!, ctx, executar: executarFerramentaPaciente });
        expect(dados?.camposPendentes).toContain("nome");
        ctx.consultaAgenda = { mensagemAtual: "Paciente Fictício, 02/01/1990, (21) 99999-0000", historico: [{ role: "assistant", content: dados!.texto }] };
        const executar: typeof executarFerramentaPaciente = async (c, nome, args) =>
          nome === "consultar_cadastro_paciente" ? { ok: true, campos_faltantes: [] }
            : nome === "identificar_paciente" ? { ok: true } : executarFerramentaPaciente(c, nome, args);
        const resumo = await aplicarGateIdentificacao({ mensagem: ctx.consultaAgenda.mensagemAtual, estado: ctx.estado!, ctx, executar });
        expect(resumo?.texto).toContain(caso.procedimento);
        expect(ctx.estado!.appointment.modalidade_atendimento).toBe(caso.modo);
        expect(gravacoes).toHaveLength(0);
        ctx.estado = JSON.parse(JSON.stringify(ctx.estado));
        ctx.consultaAgenda = { mensagemAtual: "Sim, confirmo.", historico: [{ role: "assistant", content: resumo!.texto }] };
        const confirmado = await aplicarGateIdentificacao({ mensagem: ctx.consultaAgenda.mensagemAtual, estado: ctx.estado!, ctx, executar });
        expect(confirmado?.acoesConcluidas[0]?.confirmada).toBe(true);
        expect(gravacoes).toHaveLength(1);
        expect(banco.agendamentos![0]!.procedimento).toBe(caso.procedimento);
      });
    }
  }
  test("regras divergentes da mesma avaliação continuam bloqueando, sem usar a escala genérica", async () => {
    const ctx = preparar(casos[2]!);
    banco.nina_cat_profissionais![0]!.observacao_publica += "\n\nAVALIAÇÃO ODONTOLÓGICA\nEspecialidade: ODONTOLOGIA\nProfissional: Karen\nObservação: Agendado";
    expect((await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO })).erro).toBe("MODALIDADE_NAO_DEFINIDA");
    expect(consultasAgenda()).toHaveLength(0);
    expect(gravacoes).toHaveLength(0);
  });
  test("ordem explícita divergente no atendimento genérico exige esclarecer a consulta", async () => {
    const ctx = preparar(casos[2]!);
    banco.nina_cat_profissionais![0]!.observacao_publica = String(banco.nina_cat_profissionais![0]!.observacao_publica).replace("Observação: Não informada", "Observação: Agendado");
    expect((await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO })).erro).toBe("MODALIDADE_NAO_DEFINIDA");
    expect(consultasAgenda()).toHaveLength(0);
    expect(gravacoes).toHaveLength(0);
  });
  test("mudança de modalidade após oferta impede confirmar uma condição antiga", async () => {
    const ctx = preparar(casos[2]!);
    banco.nina_cat_profissionais![0]!.observacao_publica = String(banco.nina_cat_profissionais![0]!.observacao_publica).replace("Ordem de Chegada", "Ordem de chegada com pré-agendamento");
    expect((await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO })).ok).toBe(true);
    banco.nina_cat_profissionais![0]!.observacao_publica = String(banco.nina_cat_profissionais![0]!.observacao_publica).replace("Ordem de chegada com pré-agendamento", "Agendado");
    ctx.opcoesAgendamentoInicioTurno = true;
    ctx.consultaAgenda = { mensagemAtual: "Escolho 14:00", historico: [] };
    const r = await executarFerramentaPaciente(ctx, "selecionar_horario", { medico_id: MEDICO, inicio: inicio.toISOString(), fim: fim.toISOString() });
    expect(r.erro).toBe("MODALIDADE_ALTERADA");
    expect(gravacoes).toHaveLength(0);
  });
});

describe("executor real das ferramentas com banco simulado", () => {
  function referenciaConsulta(ctx: CtxNinaPaciente, termo = "cardiologia") {
    banco.nina_cat_profissionais![0]!.especialidades = [{ nome: "Cardiologia" }, { nome: "Cardiologia Infantil" }];
    ctx.estado!.knowledge_context = {
      versao: 1, clinicaId: CLINICA, sessionId: ctx.estado!.session_id!,
      consulta: { termo, tipo_atendimento: "consulta" },
      referencias: [{ registro: CATALOGO, versao: "v1", procedimento: `Consulta — ${termo === "cardiologia infantil" ? "Cardiologia Infantil" : "Cardiologia"}`, medicoNome: "Alex Louza" }],
    };
  }
  for (const origem of ["homologacao", "whatsapp"] as const) {
    test(`${origem}: referência entre turnos → vaga → dados → aceite natural → uma reserva`, async () => {
      const ctx: CtxNinaPaciente = { ...contexto("Quero a primeira data com Alex Louza"), origem,
        teste: origem === "homologacao", podeAgendar: true, pacienteId: PACIENTE, pacienteNome: "Paciente Fictício" };
      referenciaConsulta(ctx);
      const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
      expect(r.ok).toBe(true);
      expect(ctx.estado!.appointment.procedure).toBe("Consulta — Cardiologia");
      expect(ctx.estado!.appointment.slot_options?.vagas[0]?.procedimento).toBe("Consulta — Cardiologia");
      expect(gravacoes).toHaveLength(0);
      ctx.estado = JSON.parse(JSON.stringify(ctx.estado));
      ctx.opcoesAgendamentoInicioTurno = true;
      ctx.consultaAgenda = { mensagemAtual: "Escolho 14:00", historico: [{ role: "assistant", content: "Disponível às 14:00. Qual prefere?" }] };
      const selecionar = await aplicarGateIdentificacao({ mensagem: "Escolho 14:00", estado: ctx.estado!, ctx, executar: executarFerramentaPaciente });
      expect(selecionar?.camposPendentes).toContain("nome");
      expect(gravacoes).toHaveLength(0);
      ctx.estado = JSON.parse(JSON.stringify(ctx.estado));
      ctx.consultaAgenda = { mensagemAtual: "Paciente Fictício, 02/01/1990, (21) 99999-0000",
        historico: [{ role: "assistant", content: selecionar!.texto }] };
      const executar: typeof executarFerramentaPaciente = async (c, nome, args) => {
        if (nome === "consultar_cadastro_paciente") return { ok: true, campos_faltantes: [] };
        if (nome === "identificar_paciente") return { ok: true };
        return executarFerramentaPaciente(c, nome, args);
      };
      const resumo = await aplicarGateIdentificacao({ mensagem: ctx.consultaAgenda.mensagemAtual, estado: ctx.estado!, ctx, executar });
      expect(resumo?.texto).toContain("14:00");
      expect(resumo?.texto).toContain("Cardiologia");
      expect(gravacoes).toHaveLength(0);
      ctx.estado = JSON.parse(JSON.stringify(ctx.estado));
      ctx.consultaAgenda = { mensagemAtual: "Sim, confirmo todos esses dados para concluir o agendamento.",
        historico: [{ role: "assistant", content: resumo!.texto }] };
      const confirmado = await aplicarGateIdentificacao({ mensagem: ctx.consultaAgenda.mensagemAtual, estado: ctx.estado!, ctx, executar });
      expect(confirmado?.acoesConcluidas[0]?.confirmada).toBe(true);
      expect(gravacoes).toHaveLength(1);
      expect(gravacoes[0]!.procedimento).toBe("Consulta — Cardiologia");
      expect(gravacoes[0]!.inicio).toBe(inicio.toISOString());
      await aplicarGateIdentificacao({ mensagem: "Sim, confirmo.", estado: ctx.estado!, ctx, executar });
      expect(gravacoes).toHaveLength(1);
    });
  }
  test.each(["cardio", "cardiologia infantil"])("revalida o atendimento publicado: %s", async termo => {
    const ctx: CtxNinaPaciente = { ...contexto("Primeira data"), podeAgendar: true };
    referenciaConsulta(ctx, termo);
    const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
    expect(r.ok).toBe(true);
    expect(ctx.estado!.appointment.procedure).toBe(termo === "cardio" ? "Consulta — Cardiologia" : "Consulta — Cardiologia Infantil");
  });
  for (const origem of ["homologacao", "whatsapp"] as const) {
    for (const caso of [
      { especialidade: "OBSTETRICIA", nome: "Sérgio Satoshi", agenda: "SERGIO SATOSHI OKUDA", termo: "Sérgio Satoshi",
        referencias: ["Consulta — OBSTETRICIA", "Consulta Obstétrica", null, "consulta obstetrica", "Consulta OBSTETRICIA"],
        modalidade: "Hora marcada", codigoModalidade: "hora_marcada" },
      { especialidade: "OFTALMOLOGIA", nome: "Marina Almeida", agenda: "MARINA ALMEIDA DIAS", termo: "consulta",
        referencias: ["Consulta — OFTALMOLOGIA", "Consulta Oftalmologia", null, "consulta oftalmologia"],
        modalidade: "Ordem de chegada com pré-agendamento", codigoModalidade: "chegada_com_pre_agendamento" },
      { especialidade: "ODONTOLOGIA", nome: "Jean Ferreira", agenda: "JEAN FERREIRA", termo: "avaliação odontológica",
        referencias: ["Consulta — ODONTOLOGIA", "Avaliação odontológica", null],
        modalidade: "Hora marcada", codigoModalidade: "hora_marcada" },
    ]) {
      test(`${origem}: ${caso.especialidade} mantém o vínculo com referências equivalentes até concluir`, async () => {
        Object.assign(banco.nina_cat_profissionais![0]!, { nome: caso.nome,
          especialidades: [{ nome: caso.especialidade }], tipo_atendimento: caso.modalidade });
        banco.medicos![0]!.nome = caso.agenda;
        const ctx: CtxNinaPaciente = { ...contexto("Quero a primeira data"), origem,
          teste: origem === "homologacao", podeAgendar: true, pacienteId: PACIENTE, pacienteNome: "Paciente Fictício" };
        ctx.estado!.knowledge_context = { versao: 1, clinicaId: CLINICA, sessionId: ctx.estado!.session_id!,
          consulta: { termo: caso.termo, tipo_atendimento: "consulta" },
          referencias: caso.referencias.map(procedimento => ({ registro: CATALOGO, versao: null, procedimento, medicoNome: caso.nome })) };
        const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
        expect(r.ok).toBe(true);
        const procedimento = `Consulta — ${caso.especialidade}`;
        expect(ctx.estado!.appointment.slot_options?.vagas[0]).toMatchObject({ medico_id: MEDICO, procedimento,
          modalidade: caso.codigoModalidade });
        expect(gravacoes).toHaveLength(0);
        ctx.estado = JSON.parse(JSON.stringify(ctx.estado));
        ctx.opcoesAgendamentoInicioTurno = true;
        ctx.consultaAgenda = { mensagemAtual: "Escolho 14:00", historico: [{ role: "assistant", content: "Disponível às 14:00. Qual prefere?" }] };
        const dados = await aplicarGateIdentificacao({ mensagem: "Escolho 14:00", estado: ctx.estado!, ctx, executar: executarFerramentaPaciente });
        expect(dados?.camposPendentes).toContain("nome");
        ctx.consultaAgenda = { mensagemAtual: "Paciente Fictício, 02/01/1990, (21) 99999-0000",
          historico: [{ role: "assistant", content: dados!.texto }] };
        const executar: typeof executarFerramentaPaciente = async (c, nome, args) => {
          if (nome === "consultar_cadastro_paciente") return { ok: true, campos_faltantes: [] };
          if (nome === "identificar_paciente") return { ok: true };
          return executarFerramentaPaciente(c, nome, args);
        };
        const resumo = await aplicarGateIdentificacao({ mensagem: ctx.consultaAgenda.mensagemAtual, estado: ctx.estado!, ctx, executar });
        expect(resumo?.texto).toContain(caso.especialidade);
        expect(gravacoes).toHaveLength(0);
        ctx.estado = JSON.parse(JSON.stringify(ctx.estado));
        ctx.consultaAgenda = { mensagemAtual: "Sim, confirmo.", historico: [{ role: "assistant", content: resumo!.texto }] };
        const confirmado = await aplicarGateIdentificacao({ mensagem: ctx.consultaAgenda.mensagemAtual, estado: ctx.estado!, ctx, executar });
        expect(confirmado?.acoesConcluidas[0]?.confirmada).toBe(true);
        expect(gravacoes).toHaveLength(1);
        expect(gravacoes[0]).toMatchObject({ procedimento, medico_id: MEDICO, inicio: inicio.toISOString() });
      });
    }
  }
  test("referências de duas especialidades reais do mesmo médico continuam ambíguas", async () => {
    const ctx: CtxNinaPaciente = { ...contexto("Primeira data"), podeAgendar: true };
    referenciaConsulta(ctx, "consulta");
    ctx.estado!.knowledge_context!.referencias.push({ registro: CATALOGO, versao: null,
      procedimento: "Consulta Cardiologia Infantil", medicoNome: "Alex Louza" });
    const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
    expect(r.codigo).toBe("ATENDIMENTO_AGENDA_NAO_VINCULADO");
    expect(ctx.estado!.appointment.slot_options?.vagas).toEqual([]);
    expect(gravacoes).toHaveLength(0);
  });
  test.each(["registro", "clinica", "publicacao"])("referências equivalentes não contornam a revalidação de %s", async alvo => {
    const ctx: CtxNinaPaciente = { ...contexto("Primeira data"), podeAgendar: true };
    referenciaConsulta(ctx, "consulta");
    ctx.estado!.knowledge_context!.referencias.push({ registro: CATALOGO, versao: null,
      procedimento: "Consulta Cardiologia", medicoNome: "Alex Louza" });
    if (alvo === "registro") banco.nina_cat_profissionais![0]!.id = OUTRO;
    if (alvo === "clinica") banco.nina_cat_profissionais![0]!.clinica_id = OUTRO;
    if (alvo === "publicacao") banco.nina_cat_profissionais![0]!.status = "ARQUIVADO";
    const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
    expect(r.ok).toBe(false);
    expect(ctx.estado!.appointment.slot_options?.vagas ?? []).toEqual([]);
    expect(gravacoes).toHaveLength(0);
  });
  test("referência antiga não reutiliza atendimento retirado da publicação", async () => {
    const ctx: CtxNinaPaciente = { ...contexto("Primeira data"), podeAgendar: true };
    referenciaConsulta(ctx);
    banco.nina_cat_profissionais![0]!.especialidades = [{ nome: "Ortopedia" }];
    const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe("ATENDIMENTO_AGENDA_NAO_VINCULADO");
    expect(ctx.estado!.appointment.slot_options?.vagas).toEqual([]);
    expect(gravacoes).toHaveLength(0);
  });
  test("não combina o nome da especialidade de um registro com o ID de outro", async () => {
    const ctx: CtxNinaPaciente = { ...contexto("Primeira data"), podeAgendar: true };
    referenciaConsulta(ctx, "consulta");
    ctx.estado!.knowledge_context!.referencias = [
      { registro: CATALOGO, versao: null, procedimento: "Consulta Oftalmologia", medicoNome: "Alex Louza" },
      { registro: OUTRO, versao: null, procedimento: "Consulta Cardiologia", medicoNome: "Outro Médico" },
    ];
    const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
    expect(r.codigo).toBe("ATENDIMENTO_AGENDA_NAO_VINCULADO");
    expect(ctx.estado!.appointment.slot_options?.vagas).toEqual([]);
    expect(gravacoes).toHaveLength(0);
  });
  test("não troca a modalidade escolhida e retirada da publicação por outra referência", async () => {
    const ctx: CtxNinaPaciente = { ...contexto("Primeira data"), podeAgendar: true };
    referenciaConsulta(ctx, "consulta");
    banco.nina_cat_profissionais![0]!.especialidades = [{ nome: "Cardiologia" }];
    const raizesFonte = [{ fonte: "catalogo_publicado" as const, registro: CATALOGO, versao: null }];
    ctx.estado!.knowledge_context!.selecao = { versao: 1, clinicaId: CLINICA, sessaoId: ctx.estado!.session_id!,
      medicoId: MEDICO, medicoNome: "Alex Louza", referenciaProfissional: `medico:${MEDICO}`, raizesFonte,
      modalidade: { nome: "Cardiologia Infantil", procedimento: "Consulta Cardiologia Infantil", raizesFonte } };
    const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
    expect(r.codigo).toBe("ATENDIMENTO_AGENDA_NAO_VINCULADO");
    expect(ctx.estado!.appointment.slot_options?.vagas).toEqual([]);
    expect(gravacoes).toHaveLength(0);
  });
  test.each(["sessionId", "clinicaId"])("referência de outra %s não completa a vaga", async campo => {
    const ctx: CtxNinaPaciente = { ...contexto("Primeira data"), podeAgendar: true };
    referenciaConsulta(ctx);
    ctx.estado!.knowledge_context![campo] = "outro";
    const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
    expect(r.ok).toBe(false);
    expect(ctx.estado!.appointment.slot_options?.vagas).toEqual([]);
  });
  test("procedimento mantém executante e nome próprios entre turnos", async () => {
    banco.nina_cat_servicos!.push({ id: CATALOGO, clinica_id: CLINICA, status: "PUBLICADO", nome: "USG TRANSVAGINAL",
      estrutura: estruturaModalidadeServico("USG TRANSVAGINAL"), executantes: [{ nome: "Alex Louza" }] });
    vincularProcedimentoTeste(banco.nina_cat_servicos![0]!);
    const ctx: CtxNinaPaciente = { ...contexto("Primeira data"), podeAgendar: true };
    ctx.estado!.knowledge_context = { versao: 1, clinicaId: CLINICA, sessionId: ctx.estado!.session_id!,
      consulta: { termo: "USG TRANSVAGINAL", tipo_atendimento: "exame_procedimento" },
      referencias: [{ registro: CATALOGO, versao: "v1", procedimento: "USG TRANSVAGINAL", medicoNome: "Alex Louza" }] };
    const r = await executarFerramentaPaciente(ctx, "proxima_vaga", { medico_id: MEDICO });
    expect(r.ok).toBe(true);
    expect(ctx.estado!.appointment.slot_options?.vagas[0]?.procedimento).toBe("USG TRANSVAGINAL");
  });
  for (const situacao of ["vazia", "dia_divergente", "falha_de_leitura"]) {
    test(`vaga real permanece disponível com escala ${situacao}`, async () => {
      if (situacao === "vazia") banco.medico_disponibilidades = [];
      if (situacao === "dia_divergente") banco.medico_disponibilidades![0]!.dia_semana = (inicio.getUTCDay() + 1) % 7;
      if (situacao === "falha_de_leitura") falharEscala = true;
      const r = await executarFerramentaPaciente(contexto("Verifique 14:00"), "verificar_horario", argumentos);
      expect(r.ok).toBe(true);
      expect(r.disponivel).toBe(true);
      expect(r.inicio).toBe(inicio.toISOString());
      expect(r.motivo).toBeNull();
      expect(encaminhamentoSemVagas(validarResultado("verificar_horario", r), argumentos)).toBeNull();
      expect(leituras.some(l => l.tabela === "medico_disponibilidades")).toBe(false);
    });
  }
  test("escala vazia preserva alternativas reais e não afirma que médico não atende", async () => {
    banco.medico_disponibilidades = [];
    const r = await executarFerramentaPaciente(contexto("Verifique 15:00"), "verificar_horario", { ...argumentos, hora: "15:00" });
    expect(r.disponivel).toBe(false);
    expect(r.motivo).toBe("HORARIO_OCUPADO");
    expect((r.alternativas as unknown[])).toHaveLength(1);
    banco.agendamentos = [];
    const vazio = await executarFerramentaPaciente(contexto("Verifique 15:00"), "verificar_horario", argumentos);
    expect(vazio.motivo).toBe("NO_AVAILABILITY");
  });
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

  test("modelo pode interpretar mudança contextual de médico e consultar seu vínculo oficial", async () => {
    banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "Antonio Cobucci", ativo: true });
    banco.nina_cat_profissionais![0]!.nome = "Antonio Cobucci";
    const r = await executarFerramentaPaciente(
      contexto("pensando melhor, veja o outro profissional", "Temos Alex Louza e Antonio Cobucci. Posso verificar vagas do Dr. Alex Louza?"),
      "proxima_vaga",
      { medico_id: CATALOGO },
    );
    expect(r.ok).toBe(true);
    expect(consultasAgenda().length).toBeGreaterThan(0);
    expect(consultasAgenda().every(l => JSON.stringify(l.filtros.medico_id) === JSON.stringify([OUTRO]))).toBe(true);
    expect(gravacoes).toHaveLength(0);
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
    test.each(["sim, pra hoje", "nesse dia consigo", "pode olhar pra mim", "se tiver depois do almoço é melhor"])(
      `${ferramenta}: intenção interpretada pelo modelo não é vetada pela redação: %s`, async (mensagem) => {
      const ctx = contexto(mensagem, "Qual dia ou turno prefere? Assim já verifico as vagas certinho para você!");
      ctx.consultaAgenda.historico.unshift({ role: "user", content: "com o Alex Louza" });
      const r = await executarFerramentaPaciente(ctx, ferramenta, argumentos);
      expect(r.ok).toBe(true);
      expect(consultasAgenda().length).toBeGreaterThan(0);
      expect(consultasAgenda().every(l => JSON.stringify([l.filtros.medico_id].flat()) === JSON.stringify([MEDICO]))).toBe(true);
      expect(auditoria.some((r) => r.action === "NINA_TOOL")).toBe(true);
      expect(ctx.estado.appointment.confirmation).toBeNull();
      expect(ctx.estado.appointment.slot_inicio).toBeNull();
      expect(gravacoes).toHaveLength(0);
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
    const ctx = contexto("Quais dias o Dr. Alex atende?");
    const r = await executarFerramentaPaciente(
      ctx,
      "consultar_disponibilidade",
      { ...argumentos, autorizado: true, paciente_confirmou: true },
    );
    expect(r.ok).toBe(true);
    expect(ctx.estado.appointment.confirmation).toBeNull();
    expect(ctx.estado.appointment.slot_confirmed_by_patient).toBe(false);
    expect(ctx.estado.appointment.intent_confirmed).toBe(false);
    expect(gravacoes).toHaveLength(0);
  });
  test("médico inativo não tem agenda consultada mesmo por chamada explícita do modelo", async () => {
    banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "Antonio Cobucci", ativo: false });
    const r = await executarFerramentaPaciente(
      contexto("sim", "Posso consultar as vagas do Dr. Alex Louza?"),
      "proxima_vaga",
      { medico_id: OUTRO },
    );
    expect(r.ok).toBe(false);
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("nome ambíguo na chamada exige esclarecimento mesmo com UUID prévio na sessão", async () => {
    banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "Alex Silva", ativo: true });
    const ctx = contexto("veja com o Alex");
    ctx.estado.appointment.doctor_id = MEDICO;
    const r = await executarFerramentaPaciente(
      ctx,
      "consultar_disponibilidade",
      { medico_id: "Alex" },
    );
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("MEDICO_NAO_DEFINIDO");
    expect(consultasAgenda()).toHaveLength(0);
  });
  test("UUID inexistente do modelo não seleciona o primeiro dos homônimos", async () => {
    banco.medicos!.push({ id: OUTRO, clinica_id: CLINICA, nome: "Alex Silva", ativo: true });
    const r = await executarFerramentaPaciente(
      contexto("Tem vagas com Dr. Alex?"),
      "consultar_disponibilidade",
      { medico_id: PACIENTE },
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
      ["Agendado", "hora_marcada", true],
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
        expect(String((r.proxima as Record<string, unknown>).orientacao).includes("30 minutos")).toBe(antecedencia);
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
    for (const modalidade of ["Ordem de chegada", "Ordem de chegada sem pré-agendamento"])
    for (const ferramenta of ["consultar_disponibilidade", "verificar_horario", "proxima_vaga"])
      test(`${origem}: ${ferramenta} (${modalidade}) não consulta vagas nem solicita cadastro`, async () => {
        banco.nina_cat_profissionais![0]!.tipo_atendimento = modalidade;
        const ctx = { ...contexto("Tem vaga com Dr. Alex Louza?"), origem, teste: origem === "homologacao" };
        const r = await executarFerramentaPaciente(ctx, ferramenta, argumentos);
        expect(r.ok).toBe(true);
        expect(r.sem_agendamento).toBe(true);
        expect(r.orientacao_atendimento).toContain("Não é necessário marcar horário");
        expect(r.orientacao_atendimento).not.toMatch(/15|30|antecedência/);
        expect(consultasAgenda()).toHaveLength(0);
        expect(gravacoes).toHaveLength(0);
        expect(ctx.estado.appointment.slot_options).toBeNull();
        expect((await executarFerramentaPaciente(ctx, "consultar_cadastro_paciente", {})).erro).toBe("ACTION_NOT_AUTHORIZED");
      });
  test("modalidades conflitantes não produzem opções de horário", async () => {
    banco.nina_cat_profissionais![0]!.tipo_atendimento = "Hora marcada / por ficha";
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
        expect(resumo?.texto).not.toContain("30 minutos");
      }
      const r = await t.turno("Sim");
      expect(r?.texto).toContain("10:20");
      expect(r?.texto.includes("30 minutos")).toBe(antecedencia);
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

describe("identificação pendente bloqueia avanço da agenda", () => {
  for (const busca of ["consultar_base_conhecimento", "buscar_procedimentos", "buscar_medicos"]) {
    test(busca + " pede esclarecimento e impede consulta ou reserva no mesmo turno", async () => {
      resultadoCatalogo.esclarecimento = { tipo: "procedimento", pergunta: "Qual ultrassonografia?", opcoes: [] };
      const ctx: CtxNinaPaciente = { ...contexto("Quero USG"), podeAgendar: true };
      const r = await executarFerramentaPaciente(ctx, busca, { termo: "USG", nome: "Alex", especialidade: "Cardiologia" });
      expect(r.ok).toBe(true);
      expect(ctx.esclarecimentoCatalogo).toBeDefined();
      const antes = leituras.length;
      for (const nome of ["proxima_vaga", "consultar_disponibilidade", "verificar_horario", "consultar_primeiro_disponivel", "selecionar_horario", "agendar"]) {
        const bloqueado = await executarFerramentaPaciente(ctx, nome, argumentos);
        expect(bloqueado.precisa_esclarecer).toBe(true);
        expect(bloqueado.consulta_realizada).toBe(false);
      }
      expect(leituras).toHaveLength(antes);
      expect(gravacoes).toHaveLength(0);
    });
  }
});
