import { describe, expect, test } from "bun:test";
import { aplicarGateIdentificacao, extrairDadosIdentificacao } from "../identificacao-gate.server";
import { ehConfirmacaoDeAgendamento } from "../confirmacao-agendamento";
import { estadoVazio } from "../fluxo-estado-normalizar";
import { inicioSessaoComEntradas } from "../sessao";
import type { CtxNinaPaciente, ResultadoFerramenta } from "../paciente-tools.server";
import { resumoEntregueFixture } from "./agendamento-fixture";
import { confirmacaoDaEscolha, registrarOpcoesAgendamento, selecionarVagaValidada } from "../agendamento-escolha";

// Falhas da bateria de 50 consultas do Lead 03 (homologação, 28/09/2026).

describe("sobrenomes de parentesco", () => {
  test.each([
    ["Bruno Teste Almeida Neto, 28/02/1983", "Bruno Teste Almeida Neto"],
    ["José Carlos Teste Filho 07/07/1955", "José Carlos Teste Filho"],
    ["Meu nome é José Carlos Teste Filho, nascimento 07/07/1955", "José Carlos Teste Filho"],
    ["Ana Paula Souza Neta 01/02/1990", "Ana Paula Souza Neta"],
    ["A paciente é minha filha Sofia Teste Lopes, 05/05/2023", "Sofia Teste Lopes"],
    ["O paciente é meu neto Enzo Teste Souza, 11/11/2019", "Enzo Teste Souza"],
  ])("%s", (frase, nome) => {
    expect(extrairDadosIdentificacao(frase).nome).toBe(nome);
  });

  test.each([
    "O paciente é meu filho, posso agendar?",
    "É pro meu neto",
    "Consulta do meu filho",
    "Minha filha é menor de idade. Ela pode ir com a avó?",
    "Filho Pedro",
  ])("parentesco sem nome continua sem nome: %s", (frase) => {
    expect(extrairDadosIdentificacao(frase).nome).toBeNull();
  });
});

describe("confirmação com cortesia ou insistência", () => {
  test.each([
    "confirmo, obrigada Nina",
    "Confirmo obrigado",
    "certo, confirmo",
    "Perfeito, confirmo!",
    "sim ja falei que confirmo",
    "sim, já disse que confirmo",
    "Sim, confirmo, muito obrigada Nina!",
  ])("aceita: %s", (frase) => {
    expect(ehConfirmacaoDeAgendamento(frase)).toBe(true);
  });

  test.each([
    "confirmo, mas quero outro horário",
    "não confirmo",
    "certo, mas e o pix?",
    "já falei que não quero",
    "obrigada Nina",
  ])("recusa: %s", (frase) => {
    expect(ehConfirmacaoDeAgendamento(frase)).toBe(false);
  });
});

function preparar() {
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
  const vaga = estado.appointment.confirmation!.vaga;
  estado.appointment.confirmation = null;
  registrarOpcoesAgendamento(estado, "clinica", [vaga]);
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
  const executar = async (_ctx: CtxNinaPaciente, nome: string, args: unknown): Promise<ResultadoFerramenta> => {
    chamadas.push({ nome, args });
    if (nome === "selecionar_horario") {
      selecionarVagaValidada(estado, "clinica", estado.appointment.slot_options!.vagas[0]!, resumo);
      return { ok: true, resumo_confirmacao: resumo };
    }
    if (nome === "consultar_cadastro_paciente") return { ok: true, campos_faltantes: ["nome", "data_nascimento"] };
    if (nome === "identificar_paciente") {
      ctx.pacienteId = "paciente";
      estado.patient.id = "paciente";
      return { ok: true };
    }
    throw new Error(`Ferramenta inesperada ${nome}`);
  };
  const turno = async (mensagem: string) => {
    ctx.consultaAgenda!.mensagemAtual = mensagem;
    return aplicarGateIdentificacao({ mensagem, estado, ctx, executar,
      encaminharVagaIndisponivel: async () => true });
  };
  return { estado, chamadas, turno };
}

describe("dados junto da escolha do horário, sem 'meu nome é'", () => {
  test.each([
    ["sim 14:00. Renata Teste Duarte 09/09/1990", "Renata Teste Duarte", "1990-09-09"],
    ["14:00, sou Claudio Teste Nunes 13/05/1972", "Claudio Teste Nunes", "1972-05-13"],
    ["14h. jose teste nogueira, 11/11/1959", "Jose Teste Nogueira", "1959-11-11"],
  ])("%s", async (frase, nome, nascimento) => {
    const t = preparar();
    const r = await t.turno(frase);
    expect(r?.texto).toBe(confirmacaoDaEscolha(t.estado)?.resumo);
    expect(t.chamadas.find((c) => c.nome === "identificar_paciente")?.args).toMatchObject({
      nome, data_nascimento: nascimento,
    });
    expect(t.chamadas.some((c) => c.nome === "agendar")).toBe(false);
  });

  test.each(["14:00 com o Jorge Ribeiro", "14:00 do dia 21/01/2030 com Jorge Ribeiro"])(
    "horário com médico ou data da consulta não vira cadastro: %s", async (frase) => {
      const t = preparar();
      const r = await t.turno(frase);
      expect(r?.camposPendentes).toEqual(["nome", "data_nascimento"]);
      expect(t.estado.patient.pending.nome).toBeNull();
      expect(t.chamadas.some((c) => c.nome === "identificar_paciente")).toBe(false);
    });
});

describe("início da sessão aberta no turno", () => {
  const base = { ...estadoVazio(), session_id: "s", session_started_at: "2026-09-28T21:46:40.000Z" };
  const mensagens = [
    { id: "antiga", created_at: "2026-09-28T20:00:00.000Z" },
    { id: "m1", created_at: "2026-09-28T21:46:18.068Z" },
    { id: "m2", created_at: "2026-09-28T21:46:20.000Z" },
  ];
  test("recua até a 1ª mensagem do próprio turno", () => {
    expect(inicioSessaoComEntradas(base, mensagens, ["m1", "m2"]).session_started_at).toBe("2026-09-28T21:46:18.068Z");
  });
  test("não inclui mensagens de fora do turno", () => {
    expect(inicioSessaoComEntradas(base, mensagens, ["m2"]).session_started_at).toBe("2026-09-28T21:46:20.000Z");
    expect(inicioSessaoComEntradas(base, mensagens, []).session_started_at).toBe(base.session_started_at);
  });
});
