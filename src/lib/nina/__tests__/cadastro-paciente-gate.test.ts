import { describe, expect, test } from "bun:test";
import { aplicarGateIdentificacao, extrairDadosIdentificacao } from "../identificacao-gate.server";
import { cadastroMinimoSchema, camposCadastroFaltantes } from "../cadastro-paciente";
import { estadoVazio } from "../fluxo-estado-normalizar";
import type { CtxNinaPaciente, ResultadoFerramenta } from "../paciente-tools.server";
import { resumoEntregueFixture } from "./agendamento-fixture";
import { confirmacaoDaEscolha, registrarOpcoesAgendamento, selecionarVagaValidada } from "../agendamento-escolha";
import { derivarEtapa } from "../atendimento-fase6";

function preparar(faltantes = ["nome", "data_nascimento"]) {
  const estado = estadoVazio();
  Object.assign(estado.appointment, {
    procedure: "Consulta Ortopedia",
    doctor_id: "medico",
    doctor_name: "Jorge Ribeiro",
    date: "2030-01-21",
    time: "14:00",
    slot_inicio: "2030-01-21T17:00:00Z",
    slot_fim: "2030-01-21T17:30:00Z",
  });
  estado.flow.stage = "COLLECTING_PATIENT_DATA";
  const resumo = resumoEntregueFixture(estado, "clinica");
  const ctx: CtxNinaPaciente = {
    clinicaId: "clinica",
    conversaId: "conversa",
    pacienteId: null,
    pacienteNome: null,
    telefone: "21999990000",
    origem: "whatsapp",
    podeAgendar: true,
    estado,
    consultaAgenda: { mensagemAtual: "", historico: [{ role: "assistant", content: resumo }] },
  };
  const chamadas: Array<{ nome: string; args: unknown }> = [];
  let falhaIdentificacao: ResultadoFerramenta | null = null;
  const executar = async (
    _ctx: CtxNinaPaciente,
    nome: string,
    args: unknown,
  ): Promise<ResultadoFerramenta> => {
    chamadas.push({ nome, args });
    if (nome === "selecionar_horario") {
      selecionarVagaValidada(estado, "clinica", estado.appointment.slot_options!.vagas[0]!, resumo);
      return { ok: true, resumo_confirmacao: resumo };
    }
    if (nome === "consultar_cadastro_paciente") return { ok: true, campos_faltantes: faltantes };
    if (nome === "identificar_paciente") {
      if (falhaIdentificacao) return falhaIdentificacao;
      ctx.pacienteId = "paciente";
      ctx.pacienteNome = "Ana da Silva";
      estado.patient.id = "paciente";
      faltantes = [];
      return { ok: true };
    }
    if (nome === "agendar") {
      estado.appointment.appointment_id = "reserva";
      return { ok: true, appointment_id: "reserva" };
    }
    throw new Error(`Ferramenta inesperada ${nome}`);
  };
  return {
    estado,
    ctx,
    chamadas,
    falhar: (r: ResultadoFerramenta) => {
      falhaIdentificacao = r;
    },
    executar,
    turno: async (mensagem: string) => {
      ctx.consultaAgenda!.mensagemAtual = mensagem;
      const r = await aplicarGateIdentificacao({ mensagem, estado, ctx, executar });
      ctx.consultaAgenda!.historico.push({ role: "user", content: mensagem });
      if (r) ctx.consultaAgenda!.historico.push({ role: "assistant", content: r.texto });
      return r;
    },
  };
}

describe("cadastro obrigatório compartilhado com o Clínica OS", () => {
  test("CPF, endereço e e-mail não são necessários", () => {
    expect(
      cadastroMinimoSchema.safeParse({
        nome: "Ana da Silva",
        data_nascimento: "1990-01-02",
        telefone: "21999990000",
      }).success,
    ).toBe(true);
    expect(camposCadastroFaltantes({ telefone: "21999990000" })).toEqual([
      "nome",
      "data_nascimento",
    ]);
  });
  test("data inexistente e telefone inválido não completam cadastro", () => {
    expect(
      camposCadastroFaltantes({
        nome: "Ana Silva",
        data_nascimento: "1990-02-31",
        telefone: "123",
      }),
    ).toEqual(["data_nascimento", "telefone"]);
  });
  test("extração preserva sobrenomes com de/da e dados em mensagens separadas", () => {
    expect(extrairDadosIdentificacao("Meu nome é Ana da Silva, 02/01/1990")).toMatchObject({
      nome: "Ana Da Silva",
      data_nascimento: "1990-01-02",
    });
    expect(extrairDadosIdentificacao("(21) 99999-0000").telefone).toBe("21999990000");
  });
});

describe("gate: escolher vaga → coletar dados → confirmar → agendar", () => {
  test("escolha pede dados antes da confirmação, sem interpretar o horário como nome", async () => {
    const t = preparar();
    const vaga = t.estado.appointment.confirmation!.vaga;
    t.estado.appointment.confirmation = null;
    registrarOpcoesAgendamento(t.estado, "clinica", [vaga]);
    const r = await t.turno("eu prefiro 14:00");
    expect(r?.camposPendentes).toEqual(["nome", "data_nascimento"]);
    expect(r?.texto).not.toContain("Confirma");
    expect(t.estado.patient.pending.nome).toBeNull();
    expect(t.chamadas.map(c => c.nome)).toEqual(["selecionar_horario", "consultar_cadastro_paciente"]);
    expect(confirmacaoDaEscolha(t.estado)?.aceita).toBe(false);
  });
  for (const frase of ["Sim, confirmo.", "Sim, confirmo todos esses dados para concluir o agendamento.",
    "Confirmo a consulta de ortopedia com Jorge Ribeiro em 21/01/2030 às 14:00."]) {
    test(`confirmação natural não retorna à escolha: ${frase}`, async () => {
      const t = preparar();
      expect((await t.turno(frase))?.camposPendentes).toEqual(["nome", "data_nascimento"]);
      expect(t.estado.appointment.confirmation?.aceita).toBe(false);
      const resumo = t.estado.appointment.confirmation;
      expect((await t.turno("Ana da Silva, 02/01/1990"))?.texto).toBe(resumo!.resumo);
      expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
      expect((await t.turno(frase))?.acoesConcluidas[0]?.confirmada).toBe(true);
      expect(t.estado.appointment.confirmation).toBe(resumo);
      expect(t.chamadas.filter(c => c.nome === "agendar")).toHaveLength(1);
      expect(t.chamadas.some(c => c.nome === "selecionar_horario")).toBe(false);
      await t.turno(frase);
      expect(t.chamadas.filter(c => c.nome === "agendar")).toHaveLength(1);
    });
  }
  test("aproveita nome e nascimento dados antes do aceite, sem extrair nome da consulta", async () => {
    const t = preparar();
    t.ctx.consultaAgenda!.historico.unshift(
      { role: "user", content: "Quero consulta de ortopedia em 21/01/2030" },
      { role: "assistant", content: "Qual seu nome completo e sua data de nascimento?" },
      { role: "user", content: "Ana da Silva, 02/01/1990" });
    const r = await t.turno("Sim, confirmo.");
    expect(r?.restricoes).toContain("aguardar_aceite_do_resumo");
    expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
    expect(t.chamadas.find(c => c.nome === "identificar_paciente")?.args).toEqual({ nome: "Ana Da Silva", data_nascimento: "1990-01-02" });
  });
  test("repetir o aceite durante o cadastro não vira nome nem reinicia a confirmação", async () => {
    const t = preparar();
    await t.turno("Sim, confirmo.");
    const resumo = t.estado.appointment.confirmation;
    const r = await t.turno("Sim, confirmo todos esses dados para concluir o agendamento.");
    expect(r?.camposPendentes).toEqual(["nome", "data_nascimento"]);
    expect(t.estado.patient.pending.nome).toBeNull();
    expect(t.estado.appointment.confirmation).toBe(resumo);
      expect(t.estado.appointment.confirmation?.aceita).toBe(false);
    expect(t.chamadas.some(c => ["selecionar_horario", "agendar"].includes(c.nome))).toBe(false);
  });
  test.each(["Sim, confirmo às 15:00", "Confirmo com Paulo Guilherme", "Sim, mas qual o valor?"])(
    "não registra aceite divergente: %s", async frase => {
      const t = preparar();
      await t.turno(frase);
      expect(t.estado.appointment.confirmation?.aceita).not.toBe(true);
      expect(t.chamadas.some(c => ["identificar_paciente", "agendar"].includes(c.nome))).toBe(false);
    });
  for (const campo of ["slot_inicio", "doctor_id", "procedure"] as const) {
    test(`sem ${campo} não coleta nem cria paciente`, async () => {
      const t = preparar();
      t.estado.appointment[campo] = null;
      if (campo === "doctor_id") t.estado.appointment.doctor_name = null;
      expect(await t.turno("sim")).toBeNull();
      expect(t.chamadas).toHaveLength(0);
    });
  }
  test("interesse genérico não autoriza cadastro", async () => {
    const t = preparar();
    t.estado.appointment.intent_confirmed = true;
    expect(await t.turno("qual o valor?")).toBeNull();
    expect(t.chamadas).toHaveLength(0);
  });
  test("aceite consulta cadastro antes de pedir só nome e nascimento", async () => {
    const t = preparar();
    const r = await t.turno("sim por favor");
    expect(t.chamadas.map((c) => c.nome)).toEqual(["consultar_cadastro_paciente"]);
    expect(r?.camposPendentes).toEqual(["nome", "data_nascimento"]);
    expect(r?.texto).not.toMatch(/CPF|telefone|endereço|e-mail/i);
  });
  test("coleta fracionada não repete nome; identifica e revalida antes de confirmar", async () => {
    const t = preparar();
    await t.turno("sim");
    expect((await t.turno("Ana da Silva"))?.camposPendentes).toEqual(["data_nascimento"]);
    const resumo = await t.turno("02/01/1990");
    expect(resumo?.restricoes).toContain("aguardar_aceite_do_resumo");
    expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
    const r = await t.turno("Sim, confirmo.");
    expect(r?.acoesConcluidas[0]).toMatchObject({
      acao: "agendar",
      confirmada: true,
      evidencia: "reserva",
    });
    expect(t.chamadas.find((c) => c.nome === "identificar_paciente")?.args).toEqual({
      nome: "Ana Da Silva",
      data_nascimento: "1990-01-02",
    });
    expect(t.chamadas.slice(-2).map((c) => c.nome)).toEqual(["identificar_paciente", "agendar"]);
    expect(t.estado.patient.pending.nome).toBeNull();
  });
  test("paciente confirmado completo segue sem repetir dados", async () => {
    const t = preparar([]);
    Object.assign(t.estado.patient, { id: "paciente", identified: true, validated: true });
    t.ctx.pacienteId = "paciente";
    const r = await t.turno("sim");
    expect(r?.chaveTemplate).toBe("fluxo.agendamento.confirmado");
    expect(t.chamadas.map((c) => c.nome)).toEqual([
      "consultar_cadastro_paciente",
      "identificar_paciente",
      "agendar",
    ]);
  });

  test("frase de nascimento não substitui nome já coletado", async () => {
    const t = preparar();
    await t.turno("sim");
    await t.turno("Ana da Silva");
    await t.turno("minha data de nascimento é 02/01/1990");
    expect(t.chamadas.find((c) => c.nome === "identificar_paciente")?.args).toMatchObject({
      nome: "Ana Da Silva",
    });
  });
  test("cadastro existente incompleto pede apenas nascimento", async () => {
    const t = preparar(["data_nascimento"]);
    Object.assign(t.estado.patient, { id: "paciente", identified: true, validated: true });
    t.ctx.pacienteId = "paciente";
    const r = await t.turno("sim");
    expect(r?.camposPendentes).toEqual(["data_nascimento"]);
    expect(r?.texto).not.toMatch(/CPF|nome|telefone/);
    t.estado.flow.stage = derivarEtapa({ estado: t.estado, mensagem: "02/01/1990", primeiraMensagem: false, intencoes: [] });
    expect((await t.turno("02/01/1990"))?.restricoes).toContain("aguardar_aceite_do_resumo");
    expect(t.chamadas.find(c => c.nome === "identificar_paciente")?.args).toEqual({ data_nascimento: "1990-01-02" });
    expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
  });
  test("sem telefone disponível pede esse obrigatório também", async () => {
    const t = preparar(["nome", "data_nascimento", "telefone"]);
    t.ctx.telefone = null;
    expect((await t.turno("sim"))?.camposPendentes).toContain("telefone");
  });
  test("erro técnico mantém os dados já informados para nova tentativa", async () => {
    const t = preparar();
    await t.turno("sim");
    t.falhar({ ok: false, erro: "INTERNAL_ERROR", mensagem: "Falha" });
    const r = await t.turno("Ana da Silva, 02/01/1990");
    expect(r?.chaveTemplate).toBe("fluxo.identificacao.instabilidade");
    expect(t.estado.patient.pending.nome).toBe("Ana Da Silva");
    expect(t.chamadas.some((c) => c.nome === "agendar")).toBe(false);
  });
  test("homônimo não pede CPF opcional nem tenta cadastrar novamente", async () => {
    const t = preparar();
    await t.turno("sim");
    t.falhar({ ok: false, erro: "PATIENT_AMBIGUOUS", mensagem: "Conferência humana" });
    expect(await t.turno("Ana da Silva, 02/01/1990")).toBeNull();
    expect(t.estado.flow.stage).toBe("HANDOFF");
    expect(t.chamadas.some((c) => c.nome === "agendar")).toBe(false);
  });
  test("recusa cancela o consentimento anterior e impede cadastro", async () => {
    const t = preparar();
    await t.turno("sim");
    t.chamadas.length = 0;
    expect(await t.turno("não quero mais")).toBeNull();
    expect(t.estado.appointment.slot_confirmed_by_patient).toBe(false);
    expect(t.chamadas).toHaveLength(0);
  });
  test("troca de horário depois do aceite suspende o agendamento para tratamento humano", async () => {
    const t = preparar();
    resumoEntregueFixture(t.estado, "clinica", true);
    t.chamadas.length = 0;
    expect(await t.turno("eu vou 10:20")).toBeNull();
    expect(t.estado.appointment.time).toBe("14:00");
    expect(t.estado.appointment.slot_confirmed_by_patient).toBe(false);
    expect(t.estado.flow.stage).toBe("HANDOFF");
    expect(t.chamadas).toHaveLength(0);
  });
  test("aceite do fluxo antigo em andamento é preservado durante a coleta", async () => {
    const t = preparar();
    resumoEntregueFixture(t.estado, "clinica", true);
    expect((await t.turno("Ana da Silva, 02/01/1990"))?.acoesConcluidas[0]?.confirmada).toBe(true);
    expect(t.chamadas.filter(c => c.nome === "agendar")).toHaveLength(1);
  });
  test("cadastro completo após escolha pede confirmação, sem repetir dados", async () => {
    const t = preparar([]);
    Object.assign(t.estado.patient, { id: "paciente", identified: true, validated: true });
    t.ctx.pacienteId = "paciente";
    const r = await aplicarGateIdentificacao({ mensagem: "o segundo horário", estado: t.estado,
      ctx: t.ctx, executar: t.executar, aposSelecao: true });
    expect(r?.texto).toBe(t.estado.appointment.confirmation!.resumo);
    expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
  });
});
