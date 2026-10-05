import { describe, expect, test } from "bun:test";
import { mapearProfissionais, mapearServicos, precosDoProcedimento, type EntradaOperacional } from "../fonte-operacional";
import { profissionalParaRegistro, servicoParaRegistro } from "../catalogo-conhecimento";
import { separarAtendimentos } from "../catalogo-estrutura";

const base: EntradaOperacional = {
  hojeISO: "2026-09-30",
  medicos: [
    { id: "m-alex", nome: "ALEX LOUZA MACEDO", especialidade_id: "e-card", visivel_agendamento_online: true },
    { id: "m-oculto", nome: "MEDICO PONTE", especialidade_id: "e-card", visivel_agendamento_online: false },
    { id: "m-vazio", nome: "SEM DADOS", especialidade_id: null, visivel_agendamento_online: null },
  ],
  especialidades: [{ id: "e-card", nome: "CARDIOLOGIA" }, { id: "e-inf", nome: "CARDIOLOGIA INFANTIL" }],
  agendas: [{ id: "ag1", medico_id: "m-alex", nome: "CONSULTAS", ordem_chegada: true }],
  disponibilidades: [
    { medico_id: "m-alex", agenda_id: "ag1", dia_semana: 4, hora_inicio: "08:00:00", hora_fim: "18:00:00", observacoes: null, limite_pacientes: 20 },
    { medico_id: "m-alex", agenda_id: "ag1", dia_semana: 3, hora_inicio: "13:00:00", hora_fim: "18:00:00" },
    // repetido de propósito: o cadastro não é corrigido, passa como está
    { medico_id: "m-alex", agenda_id: "ag1", dia_semana: 3, hora_inicio: "13:00:00", hora_fim: "18:00:00" },
    // fora da vigência: não é informado
    { medico_id: "m-alex", agenda_id: "ag1", dia_semana: 1, hora_inicio: "08:00:00", hora_fim: "12:00:00", vigencia_fim: "2026-09-01" },
  ],
  procedimentos: [
    { id: "p-cons", nome: "CONSULTA", tipo: "consulta", valor_padrao: "120", valor_dinheiro_pix: "120", valor_cartao: "145" },
    { id: "p-inf", nome: "CONSULTA CARDIOLOGIA INFANTIL", tipo: "consulta", valor_padrao: "160", valor_dinheiro_pix: "160", valor_cartao: "190" },
    { id: "p-rev", nome: "REVISAO", tipo: "consulta", valor_padrao: "0", valor_dinheiro_pix: "0", valor_cartao: "0" },
    { id: "p-ecg", nome: "ELETROCARDIOGRAMA", tipo: "exame", valor_padrao: "0", valor_dinheiro_pix: "0", valor_cartao: "0", preparo: "  " },
    { id: "p-lab", nome: "TIREOGLOBULINA", tipo: "exame", valor_padrao: "48.0", valor_dinheiro_pix: "0", valor_cartao: "0", preparo: "Jejum de 8 horas" },
  ],
  vinculos: [
    { medico_id: "m-alex", procedimento_id: "p-cons" },
    { medico_id: "m-alex", procedimento_id: "p-inf", especialidade_id: "e-inf" },
    { medico_id: "m-alex", procedimento_id: "p-rev" },
    { medico_id: "m-alex", procedimento_id: "p-ecg" },
    { medico_id: "m-oculto", procedimento_id: "p-ecg" },
  ],
};

describe("fonte operacional — médicos e consultas", () => {
  const profs = mapearProfissionais(base);
  const alex = profs.find((p) => p.id === "m-alex")!;

  test("só entra quem aparece para o paciente; quem não tem dado nenhum entra mesmo assim", () => {
    expect(profs.map((p) => p.nome)).toEqual(["ALEX LOUZA MACEDO", "SEM DADOS"]);
    const vazio = profs.find((p) => p.id === "m-vazio")!;
    expect(vazio.horarios).toEqual([]);
    expect(vazio.formas_pagamento).toEqual([]);
    expect(vazio.observacao_publica).toBeNull();
    expect(vazio.tipo_atendimento).toBeNull();
  });

  test("horários como estão na aba: repetidos passam, vencidos não, vagas viram observação", () => {
    expect(alex.horarios).toEqual([
      { dia: "Quarta-feira", inicio: "13:00", fim: "18:00", recorrencia: "Toda semana", observacao: null },
      { dia: "Quarta-feira", inicio: "13:00", fim: "18:00", recorrencia: "Toda semana", observacao: null },
      { dia: "Quinta-feira", inicio: "08:00", fim: "18:00", recorrencia: "Toda semana", observacao: "Limite de 20 pacientes" },
    ]);
    expect(alex.tipo_atendimento).toBe("Ordem de chegada");
  });

  test("só consultas com valor maior que zero; a principal vem primeiro; preço de cartão nunca é inventado", () => {
    expect((alex.formas_pagamento as any[]).map((f) => [f.condicao, f.forma, f.valor])).toEqual([
      ["CONSULTA", "Dinheiro", 120],
      ["CONSULTA", "Cartão", 145],
      ["CONSULTA CARDIOLOGIA INFANTIL", "Dinheiro", 160],
      ["CONSULTA CARDIOLOGIA INFANTIL", "Cartão", 190],
    ]);
    expect(JSON.stringify(alex.formas_pagamento)).not.toContain("REVISAO");
  });

  test("o texto por consulta é lido pelo interpretador que a Nina já usa", () => {
    const blocos = separarAtendimentos(alex.observacao_publica, alex.nome);
    // A origem rotula Cartão; o parser mantém esse campo separado de Pix/cartão.
    expect(blocos.map((b) => [b.atendimento, b.especialidade, b.dinheiro, b.cartao])).toEqual([
      ["CONSULTA", "CARDIOLOGIA", "R$ 120,00", "R$ 145,00"],
      ["CONSULTA CARDIOLOGIA INFANTIL", "CARDIOLOGIA INFANTIL", "R$ 160,00", "R$ 190,00"],
    ]);
    expect(blocos.every((b) => b.pix_cartao === null)).toBe(true);
  });

  test("vira registro de conhecimento da Nina com preço da consulta certa e Pix/cartão", () => {
    const r = profissionalParaRegistro(alex as never, "2026-09-30");
    expect(r.medico).toBe("ALEX LOUZA MACEDO");
    expect(r.preco_dinheiro).toBe(120);
    expect(r.preco_cartao).toBe(145);
    expect(r.observacoes).toContain("Ordem de chegada");
    expect(r.dia).toContain("Quarta-feira 13:00–18:00");
  });
});

describe("fonte operacional — exames e procedimentos", () => {
  const servicos = mapearServicos(base);
  test("entram todos os que não são consulta, inclusive sem preço; preço zero vira desconhecido", () => {
    expect(servicos.map((s) => s.nome)).toEqual(["ELETROCARDIOGRAMA", "TIREOGLOBULINA"]);
    const ecg = servicos[0]!;
    expect(ecg.valor).toBeNull();
    expect(ecg.formas_pagamento).toEqual([]);
    expect(ecg.preparo).toBeNull();
  });

  test("executante oculto não aparece; o visível sai com horários do cadastro", () => {
    const ecg = servicos[0]!;
    expect((ecg.executantes as any[]).map((e) => e.nome)).toEqual(["ALEX LOUZA MACEDO"]);
    expect((ecg.executantes as any[])[0].horarios).toContain("Quarta-feira 13:00–18:00");
  });

  test("preço sem forma de pagamento definida fica como valor de referência, com o preparo cadastrado", () => {
    const lab = servicos[1]!;
    expect(lab.valor).toBe(48);
    expect((lab.formas_pagamento as any[]).map((f) => [f.forma, f.valor])).toEqual([["Dinheiro", 48]]);
    expect(lab.preparo).toBe("Jejum de 8 horas");
    const r = servicoParaRegistro(lab as never);
    expect(r.procedimento).toBe("TIREOGLOBULINA");
    expect(r.preco_dinheiro).toBe(48);
    expect(r.preco_cartao).toBeNull();
    expect(r.preparo).toBe("Jejum de 8 horas");
  });

  test("preços: zero não vale; dinheiro cai para o valor padrão; cartão só o cadastrado", () => {
    expect(precosDoProcedimento({ id: "x", nome: "x", tipo: "exame", valor_padrao: "225.0", valor_dinheiro_pix: "0", valor_cartao: "0" })).toEqual({ dinheiro: 225, cartao: null });
    expect(precosDoProcedimento({ id: "x", nome: "x", tipo: "exame", valor_padrao: "0", valor_dinheiro_pix: "1570", valor_cartao: "1727.00" })).toEqual({ dinheiro: 1570, cartao: 1727 });
  });
});
