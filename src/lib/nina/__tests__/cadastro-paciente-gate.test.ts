import { describe, expect, test } from "bun:test";
import { aplicarGateIdentificacao, extrairDadosIdentificacao } from "../identificacao-gate.server";
import { cadastroMinimoSchema, camposCadastroFaltantes } from "../cadastro-paciente";
import { estadoVazio } from "../fluxo-estado-normalizar";
import type { CtxNinaPaciente, ResultadoFerramenta } from "../paciente-tools.server";
import { resumoEntregueFixture } from "./agendamento-fixture";
import { confirmacaoDaEscolha, registrarOpcoesAgendamento, selecionarVagaValidada, LEMBRETE_CONFIRMACAO, incluirPacienteNoResumo } from "../agendamento-escolha";
import { derivarEtapa } from "../atendimento-fase6";

test.each(["O paciente é", "A paciente se chama", "O paciente eh"])("declaração explícita de paciente: %s", prefixo => {
  expect(extrairDadosIdentificacao(`${prefixo} Miguel Simulação Teste, nascido em 18/05/2022.`)).toMatchObject({
    nome: "Miguel Simulação Teste", data_nascimento: "2022-05-18",
  });
});

test("a pergunta sobre quem é o paciente não vira um nome", () => {
  expect(extrairDadosIdentificacao("O paciente é meu filho, posso agendar?").nome).toBeNull();
});

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
      if (estado.patient.alteracao_telefone?.telefone) {
        const telefone = estado.patient.alteracao_telefone.telefone;
        estado.patient.telefone_confirmado = { paciente_id: "paciente", telefone };
        estado.patient.alteracao_telefone = null;
        incluirPacienteNoResumo(estado, "clinica", { id:"paciente",nome:"Ana da Silva",data_nascimento:"1990-01-02",telefone });
      }
      faltantes = [];
      return { ok: true };
    }
    if (nome === "agendar") {
      estado.appointment.appointment_id = "reserva";
      estado.appointment.confirmed_in_session = estado.session_id;
      estado.flow.stage = "BOOKED";
      return { ok: true, appointment_id: "reserva" };
    }
    throw new Error(`Ferramenta inesperada ${nome}`);
  };
  const encaminhamentos: string[] = [];
  return {
    estado,
    ctx,
    chamadas,
    falhar: (r: ResultadoFerramenta) => {
      falhaIdentificacao = r;
    },
    executar,
    encaminhamentos,
    turno: async (mensagem: string) => {
      ctx.consultaAgenda!.mensagemAtual = mensagem;
      const r = await aplicarGateIdentificacao({ mensagem, estado, ctx, executar,
        encaminharVagaIndisponivel: async (motivo) => { encaminhamentos.push(motivo); return true; } });
      ctx.consultaAgenda!.historico.push({ role: "user", content: mensagem });
      if (r) ctx.consultaAgenda!.historico.push({ role: "assistant", content: r.texto });
      return r;
    },
  };
}

describe("cadastro obrigatório compartilhado com o Clínica OS", () => {
  test("correção explícita conserva vaga, mostra Telefone e só reserva após novo aceite", async () => {
    const t = preparar();
    await t.turno("Ana da Silva, 02/01/1990");
    const vaga = t.estado.appointment.slot_inicio;
    const r = await t.turno("não é esse telefone, altere para 21988887777, pode marcar");
    expect(r!.texto).toContain("*Telefone:* 21988887777");
    expect(r!.texto).not.toContain("WhatsApp de contato");
    expect(t.estado.appointment.slot_inicio).toBe(vaga);
    expect(t.chamadas.filter(c=>c.nome==="agendar")).toHaveLength(0);
    await t.turno("confirmo");
    expect(t.chamadas.filter(c=>c.nome==="agendar")).toHaveLength(1);
  });
  test("pedido sem número pergunta só DDD e aceita o número na mensagem seguinte", async () => {
    const t = preparar(); await t.turno("Ana da Silva, 02/01/1990");
    expect((await t.turno("quero trocar o telefone"))!.texto).toContain("com DDD");
    expect((await t.turno("21988887777"))!.texto).toContain("*Telefone:* 21988887777");
    expect(t.chamadas.filter(c=>c.nome==="agendar")).toHaveLength(0);
  });
  test("pedido de troca com gravação falhando não agenda nem afirma alteração", async () => {
    const t = preparar(); await t.turno("Ana da Silva, 02/01/1990");
    t.falhar({ok:false,erro:"INTERNAL_ERROR",mensagem:"Falha simulada"});
    expect((await t.turno("troque o telefone para 21988887777"))!.texto).toContain("Não consegui atualizar");
    await t.turno("confirmo");
    expect(t.chamadas.filter(c=>c.nome==="agendar")).toHaveLength(0);
  });
  test("telefone de reserva já concluída pode mudar sem nova reserva", async () => {
    const t = preparar(); await t.turno("Ana da Silva, 02/01/1990"); await t.turno("confirmo");
    expect((await t.turno("troque o telefone para 21988887777"))!.texto).toContain("Seu agendamento permanece o mesmo");
    expect(t.chamadas.filter(c=>c.nome==="agendar")).toHaveLength(1);
  });
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
  for (const origem of ["homologacao", "whatsapp"] as const) {
    test(`${origem}: nascimento por extenso completa a coleta sem reservar antes da confirmação`, async () => {
      const t = preparar();
      t.ctx.origem = origem;
      t.ctx.teste = origem === "homologacao";
      await t.turno("Meu nome é Ana da Silva");
      const r = await t.turno("15 de janeiro de 1979");
      expect(t.chamadas.find(c => c.nome === "identificar_paciente")?.args).toMatchObject({
        nome: "Ana Da Silva", data_nascimento: "1979-01-15",
      });
      expect(r?.texto).toBe(confirmacaoDaEscolha(t.estado)?.resumo);
      expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
      expect(t.encaminhamentos).toHaveLength(0);
      await t.turno("Isso, pode confirmar.");
      expect(t.chamadas.filter(c => c.nome === "agendar")).toHaveLength(1);
    });
  }
  test.each(["15 de janeiro de 1979", "15/01/79", "1979-01-15"])("extrai nome e data sem incorporar o mês ao nome: %s", data => {
    expect(extrairDadosIdentificacao(`Ana da Silva, ${data}`)).toMatchObject({ nome: "Ana Da Silva", data_nascimento: "1979-01-15" });
    expect(extrairDadosIdentificacao(data)).toMatchObject({ nome: null, data_nascimento: "1979-01-15" });
  });
  test("troca responsável pela filha sem herdar o nascimento antigo e sem agendar durante a coleta", async () => {
    const t = preparar([]);
    Object.assign(t.estado.patient, { id: "responsavel", identified: true, validated: true });
    t.ctx.pacienteId = "responsavel";
    t.ctx.pacienteNome = "Ana da Silva";
    t.estado.flow.stage = "WAITING_FINAL_CONFIRMATION";
    t.ctx.consultaAgenda!.historico.unshift({ role: "user", content: "Meu nome é Ana da Silva, 02/01/1990" });
    const executar = async (ctx: CtxNinaPaciente, nome: string, args: unknown): Promise<ResultadoFerramenta> =>
      nome === "consultar_cadastro_paciente"
        ? { ok: true, campos_faltantes: [], dados_confirmados: { nome: "Ana da Silva", data_nascimento: "1990-01-02" } }
        : t.executar(ctx, nome, args);
    const primeiro = await aplicarGateIdentificacao({ mensagem: "O nome dela é Sofia Lima Rocha", estado: t.estado, ctx: t.ctx, executar });
    expect(primeiro?.texto).toContain("data de nascimento");
    expect(t.estado.patient.pending).toMatchObject({ nome: "Sofia Lima Rocha", data_nascimento: null });
    expect(t.chamadas).toHaveLength(0);
    const segundo = await aplicarGateIdentificacao({ mensagem: "Nasceu em 14/02/2023", estado: t.estado, ctx: t.ctx, executar });
    expect(t.chamadas.find(c => c.nome === "identificar_paciente")?.args).toMatchObject({ nome: "Sofia Lima Rocha", data_nascimento: "2023-02-14" });
    expect(segundo?.restricoes).toContain("aguardar_aceite_do_resumo");
    expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
  });
  test.each(["Sim, confirmo para minha mãe.", "Isso aí, pode marcar pra minha mãe!"])(
    "aceita referência à mesma paciente identificada: %s", async frase => {
      const t = preparar();
      await t.turno("Minha mãe se chama Ana da Silva, 02/01/1990");
      expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
      expect((await t.turno(frase))?.acoesConcluidas[0]?.confirmada).toBe(true);
      expect(t.chamadas.filter(c => c.nome === "agendar")).toHaveLength(1);
      expect((await t.turno(frase))?.fatosConfirmados).toContain("agendamento_ja_existente");
      expect(t.chamadas.filter(c => c.nome === "agendar")).toHaveLength(1);
    });
  test.each(["Sim, confirmo para meu pai.", "Não confirmo para minha mãe.", "Sim, mas outro horário para minha mãe.", "Confirmo às 15:00 para minha mãe."])(
    "parentesco, recusa ou escolha divergentes não autorizam reserva: %s", async frase => {
      const t = preparar();
      await t.turno("Minha mãe se chama Ana da Silva, 02/01/1990");
      await t.turno(frase);
      expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
    });
  test("não inventa vínculo familiar nem aceita declaração antiga para outro cadastro", async () => {
    for (const declarado of ["Ana da Silva, 02/01/1990", "Minha mãe se chama Maria de Souza, 02/01/1990"]) {
      const t = preparar();
      await t.turno(declarado);
      // O executor da fixture identifica sempre Ana da Silva.
      await t.turno("Sim, confirmo para minha mãe.");
      expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
    }
  });
  test.each(["Prefiro 14:00", "Prefiro 14:00 da lista anterior."])(
    "preserva preferência validada no começo da frase: %s", async mensagem => {
      const t = preparar();
      const vaga = t.estado.appointment.confirmation!.vaga;
      t.estado.appointment.confirmation = null;
      registrarOpcoesAgendamento(t.estado, "clinica", [vaga]);
      const r = await t.turno(mensagem);
      expect(r?.camposPendentes).toEqual(["nome", "data_nascimento"]);
      expect(confirmacaoDaEscolha(t.estado)?.vaga).toEqual(vaga);
      await t.turno("Ana da Silva, 02/01/1990");
      expect((await t.turno("Isso, pode confirmar."))?.acoesConcluidas[0]?.confirmada).toBe(true);
      expect(t.chamadas.filter(c => c.nome === "agendar")).toHaveLength(1);
    },
  );
  test("recusa sem outra vaga validada limpa a escolha e não agenda", async () => {
    const t = preparar();
    expect(await t.turno("Prefiro não agendar agora")).toBeNull();
    expect(confirmacaoDaEscolha(t.estado)).toBeNull();
    expect(t.chamadas).toHaveLength(0);
  });
  test("escolha com dúvida de pagamento preserva vaga e deixa o modelo responder antes da coleta", async () => {
    const t = preparar();
    const vaga = t.estado.appointment.confirmation!.vaga;
    t.estado.appointment.confirmation = null;
    registrarOpcoesAgendamento(t.estado, "clinica", [vaga]);
    expect(await t.turno("14:00 fica bom. Se eu pagar no Pix lá na hora pode?")).toBeNull();
    expect(confirmacaoDaEscolha(t.estado)?.vaga).toEqual(vaga);
    expect(t.chamadas.map(c => c.nome)).toEqual(["selecionar_horario"]);
    t.ctx.consultaAgenda!.historico.push({ role: "assistant", content: "Pix somente antecipado pelo WhatsApp. Informe seu nome completo e data de nascimento." });
    expect((await t.turno("Ana da Silva, 02/01/1990"))?.texto).toBe(confirmacaoDaEscolha(t.estado)?.resumo);
    expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
  });
  test("aproveita nome e nascimento declarados junto da preferência sem reservar antes do aceite", async () => {
    const t = preparar();
    const vaga = t.estado.appointment.confirmation!.vaga;
    t.estado.appointment.confirmation = null;
    registrarOpcoesAgendamento(t.estado, "clinica", [vaga]);
    const r = await t.turno("Prefiro 14:00 da lista anterior. Meu nome é Lucas Simulação Teste Um, nasci em 21/10/1990.");
    expect(r?.texto).toBe(confirmacaoDaEscolha(t.estado)?.resumo);
    expect(t.chamadas.find(c => c.nome === "identificar_paciente")?.args).toMatchObject({
      nome: "Lucas Simulação Teste Um", data_nascimento: "1990-10-21",
    });
    expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
    expect((await t.turno("Isso, pode confirmar."))?.acoesConcluidas[0]?.confirmada).toBe(true);
  });
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
  test("responsável fornece os dados do filho junto do horário sem perder a escolha", async () => {
    const t = preparar();
    const vaga = t.estado.appointment.confirmation!.vaga;
    t.estado.appointment.confirmation = null;
    registrarOpcoesAgendamento(t.estado, "clinica", [vaga]);
    const r = await t.turno("Esse mesmo, 14:00. É pro meu filho Pedro Simulação Teste Três, nascido em 12/03/2018.");
    expect(r?.texto).toBe(confirmacaoDaEscolha(t.estado)?.resumo);
    expect(t.chamadas.find(c => c.nome === "identificar_paciente")?.args).toMatchObject({
      nome: "Pedro Simulação Teste Três", data_nascimento: "2018-03-12",
    });
    expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
  });
  test("declaração Minha filha é aproveita o nome sem confundir o médico", async () => {
    const t = preparar();
    const vaga = t.estado.appointment.confirmation!.vaga;
    t.estado.appointment.confirmation = null;
    registrarOpcoesAgendamento(t.estado, "clinica", [vaga]);
    const r = await t.turno("Quero 14:00. Minha filha é Helena Teste Quarenta Dois, 03/07/2024.");
    expect(r?.texto).toBe(confirmacaoDaEscolha(t.estado)?.resumo);
    expect(t.chamadas.find(c => c.nome === "identificar_paciente")?.args).toMatchObject({
      nome: "Helena Teste Quarenta Dois", data_nascimento: "2024-07-03",
    });
    expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
    expect(extrairDadosIdentificacao("Quero o doutor Sergio Palermo. Minha filha é Helena Teste Quarenta Dois, 03/07/2024.").nome).toBe("Helena Teste Quarenta Dois");
    expect(extrairDadosIdentificacao("Minha filha é menor de idade. Ela pode ir com a avó?").nome).toBeNull();
  });
  test.each([
    "14:00. Sou Fabio Segunda Rodada Oito, nasci em 17/08/1980.",
    "14:00, por favor. O nome dele é Fabio Segunda Rodada Oito, nasceu em 17/08/1980.",
    "14:00. Ele se chama Fabio Segunda Rodada Oito, 17/08/1980.",
  ])("apresentação com nome e nascimento na escolha identifica antes de pedir aceite: %s", async (frase) => {
    const t = preparar();
    const vaga = t.estado.appointment.confirmation!.vaga;
    t.estado.appointment.confirmation = null;
    registrarOpcoesAgendamento(t.estado, "clinica", [vaga]);
    const r = await t.turno(frase);
    expect(r?.texto).toBe(confirmacaoDaEscolha(t.estado)?.resumo);
    expect(t.chamadas.find(c => c.nome === "identificar_paciente")?.args).toMatchObject({
      nome: "Fabio Segunda Rodada Oito", data_nascimento: "1980-08-17",
    });
    expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
    expect(extrairDadosIdentificacao("Sou a mãe do paciente, ele tem oito anos.").nome).toBeNull();
    expect(extrairDadosIdentificacao("Sou atendido pelo doutor Carlos Eduardo.").nome).toBeNull();
  });
  test.each([
    "Não, deixa pra lá. Não quero marcar agora.",
    "Na verdade não, preciso falar com meu trabalho antes. Não confirma por enquanto.",
    "Não confirme por enquanto.", "Não agende agora.", "Não marque ainda.",
  ])("recusa explícita interrompe a confirmação sem reservar: %s", async (frase) => {
    const t = preparar();
    expect(await t.turno(frase)).toBeNull();
    expect(t.estado.appointment.confirmation).toBeNull();
    expect(t.chamadas.some(c => c.nome === "agendar")).toBe(false);
  });
  for (const frase of ["Sim, confirmo.", "Sim, confirmo todos esses dados para concluir o agendamento.",
    "isso mesmo, pode confirmar", "sim, tudo certo por aqui", "confirmo sim, obrigado!",
    "tá tudo certo, pode confirmar", "Isso, esse mesmo.",
    "Isso aí, pode marcar.",
    "já é", "formou", "demorou", "blz, pode confirmar", "ss, pode agendar pfv",
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
      const repeticao = await t.turno(frase);
      expect(repeticao?.texto).toBe("Seu agendamento já foi realizado. Não é necessário confirmar novamente.");
      expect(repeticao?.acoesConcluidas).toHaveLength(0);
      expect(t.chamadas.filter(c => c.nome === "agendar")).toHaveLength(1);
    });
  }
  test("lembrete curto mantém a prova do resumo sem repetir a conclusão ou reservar antes do aceite", async () => {
    const t = preparar();
    await t.turno("Ana da Silva, 02/01/1990");
    const chamadasAntes = t.chamadas.filter(c => c.nome === "agendar").length;
    expect((await t.turno("entendi a mensagem"))?.texto).toBe(LEMBRETE_CONFIRMACAO);
    expect((await t.turno("li aqui"))?.texto).toBe(LEMBRETE_CONFIRMACAO);
    expect(t.chamadas.filter(c => c.nome === "agendar")).toHaveLength(chamadasAntes);
    expect((await t.turno("isso mesmo, pode confirmar"))?.acoesConcluidas[0]?.confirmada).toBe(true);
    expect(t.chamadas.filter(c => c.nome === "agendar")).toHaveLength(1);
  });
  test.each(["sim, mas quero outro horário", "qual o endereço?", "quero outra consulta"])(
    "pedido após conclusão não é engolido como novo aceite: %s", async mensagem => {
      const t = preparar();
      await t.turno("Ana da Silva, 02/01/1990");
      await t.turno("sim");
      expect(await t.turno(mensagem)).toBeNull();
      expect(t.chamadas.filter(c => c.nome === "agendar")).toHaveLength(1);
    });
  test("reserva de sessão antiga não produz resposta de agendamento atual", async () => {
    const t = preparar();
    t.estado.appointment.appointment_id = "antigo";
    t.estado.appointment.confirmed_in_session = "sessao-antiga";
    expect(await t.turno("sim")).toBeNull();
    expect(t.chamadas).toHaveLength(0);
  });
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
  // Regra da clínica (26/09/2026): falha de operação vai para a equipe; a Nina
  // nunca manda "Não consegui concluir a consulta ao cadastro… tente novamente".
  test("erro técnico encaminha para a equipe, mantendo os dados informados", async () => {
    const t = preparar();
    await t.turno("sim");
    t.falhar({ ok: false, erro: "INTERNAL_ERROR", mensagem: "Falha" });
    const r = await t.turno("Ana da Silva, 02/01/1990");
    expect(r?.origem).toBe("handoff");
    expect(r?.chaveTemplate).not.toBe("fluxo.identificacao.instabilidade");
    expect(r?.texto).not.toMatch(/Não consegui/);
    expect(t.encaminhamentos).toHaveLength(1);
    expect(t.encaminhamentos[0]).toContain("FALHA_OPERACIONAL_AGENDAMENTO: identificar_paciente (INTERNAL_ERROR)");
    expect(t.estado.flow.stage).toBe("HANDOFF");
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
  test.each(["nn", "quero não", "esse não", "não quero não", "não vai rolar", "deixa pra lá"])("recusa informal impede reserva: %s", async frase => {
    const t = preparar();
    await t.turno("Ana da Silva, 02/01/1990");
    t.chamadas.length = 0;
    expect(await t.turno(frase)).toBeNull();
    expect(t.estado.appointment.confirmation).toBeNull();
    expect(t.estado.appointment.slot_confirmed_by_patient).toBe(false);
    expect(t.estado.flow.stage).toBe("CHOOSING_SLOT");
    expect(t.chamadas).toHaveLength(0);
  });
  test.each(["nn", "quero não", "não vai rolar"])("recusa informal revoga aceite antigo antes da gravação: %s", async frase => {
    const t = preparar();
    resumoEntregueFixture(t.estado, "clinica", true);
    expect(await t.turno(frase)).toBeNull();
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

// 26/09/2026 — simulação 01: a frase inteira virou nome no cadastro.
describe("nome dentro de mensagem livre", () => {
  test.each([
    ["A consulta é do meu filho: Simulação Teste Um, nascido em 12/03/2018.", "Simulação Teste Um"],
    ["É para minha mãe, o nome dela é Joana Pereira Lima, nascida em 03/05/1950", "Joana Pereira Lima"],
    ["Meu nome é Simulação Teste Três e nasci em 22/07/1975.", "Simulação Teste Três"],
    ["meu nome completo é Maria de Lourdes Souza", "Maria De Lourdes Souza"],
    ["Ana da Silva, 02/01/1990", "Ana Da Silva"],
    ["É pro meu filho Pedro Simulação Teste Três, nascido em 12/03/2018.", "Pedro Simulação Teste Três"],
  ])("%s", (texto, nome) => expect(extrairDadosIdentificacao(texto).nome).toBe(nome));

  test.each(["sim", "Prefiro o das 12:20. E se eu pagar em dinheiro fica quanto mesmo?", "A consulta é do meu filho"])(
    "%s não vira nome", (texto) => expect(extrairDadosIdentificacao(texto).nome).toBeNull());
});
