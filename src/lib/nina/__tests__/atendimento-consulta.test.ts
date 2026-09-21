import { expect, test } from "bun:test";
import { atualizarPreferenciaAtendimento, atendePreferenciaConsulta, pedidoPreventivo } from "../atendimento-consulta";
import { profissionalParaRegistro } from "../catalogo-conhecimento";
import { atendimentosEstruturados } from "../catalogo-estrutura";
import { conhecimentoDaMesmaSessao, lembrarConsultaComprovada } from "../confidence/conhecimento-sessao";

const registro = profissionalParaRegistro({ id: "medica", nome: "Conceição Martins",
  atende_consultorio: true, formas_pagamento: [], convenios: [], horarios: [], tipo_atendimento: "Agendado",
  aviso_dia: null, aviso_valido_de: null, aviso_valido_ate: null,
  especialidades: [{ nome: "GINECOLOGIA" }], observacao_publica:
    "CONSULTA + PREVENTIVO\nEspecialidade: GINECOLOGIA\nDinheiro: R$ 172,00\nPix/cartão: R$ 205,00\nObservação: Agendado" }, "2026-09-21");
const com = { especialidade: "GINECOLOGIA", preventivo: "com" as const };
test.each(["Quero consulta com preventivo", "Quero consulta + preventivo"])("identifica a variante: %s", mensagem => {
  expect(atualizarPreferenciaAtendimento({ mensagem, registros: [registro] })).toEqual(com);
});
test.each(["Consulta sem preventivo", "Não quero fazer o preventivo"])("reconhece exclusão: %s", mensagem => {
  expect(atualizarPreferenciaAtendimento({ mensagem, registros: [registro], anterior: com }))
    .toEqual({ especialidade: "GINECOLOGIA", preventivo: "sem" });
});
test("comparar variantes não escolhe uma delas", () => {
  expect(pedidoPreventivo("Qual valor com ou sem preventivo?")).toBeNull();
  expect(atualizarPreferenciaAtendimento({ mensagem: "Qual valor com ou sem preventivo?", registros: [registro] })).toBeNull();
});
test("médico, horário e dados não apagam a variante escolhida", () => {
  for (const mensagem of ["Conceição Martins", "Primeira data", "14:00", "Maria Teste, 01/01/1990", "Sim, confirmo"])
    expect(atualizarPreferenciaAtendimento({ mensagem, registros: [registro], anterior: com })).toEqual(com);
});
test("não mistura variante com e sem preventivo ou outra especialidade", () => {
  const [item] = atendimentosEstruturados("CONSULTA + PREVENTIVO\nEspecialidade: GINECOLOGIA", null);
  expect(atendePreferenciaConsulta(item!, com)).toBe(true);
  expect(atendePreferenciaConsulta(item!, { ...com, preventivo: "sem" })).toBe(false);
  expect(atendePreferenciaConsulta(item!, { ...com, especialidade: "CARDIOLOGIA" })).toBe(false);
});
test("pedido explícito de outra especialidade encerra a preferência anterior", () => {
  const cardio = { ...registro, extras: { ...registro.extras,
    atendimentos_publicados: atendimentosEstruturados("CONSULTA CARDIOLOGIA\nEspecialidade: CARDIOLOGIA", null) } };
  expect(atualizarPreferenciaAtendimento({ mensagem: "Agora quero cardiologista", registros: [cardio], anterior: com })).toBeNull();
});
test("preferência persiste como referência da sessão, sem preços, e não cruza clínica/sessão", () => {
  const anterior = { versao: 1 as const, clinicaId: "clinica", sessionId: "sessao", consulta: { termo: "ginecologia" },
    referencias: [{ registro: "medica", versao: null, procedimento: "Consulta GINECOLOGIA", medicoNome: "Conceição" }], atendimentoConsulta: com };
  expect(conhecimentoDaMesmaSessao(JSON.parse(JSON.stringify(anterior)), "clinica", "sessao")?.atendimentoConsulta).toEqual(com);
  expect(conhecimentoDaMesmaSessao(anterior, "outra", "sessao")).toBeNull();
  expect(conhecimentoDaMesmaSessao(anterior, "clinica", "nova")).toBeNull();
  const proxima = lembrarConsultaComprovada({ clinicaId: "clinica", sessionId: "sessao", args: { termo: "ginecologia", medico: "outra" }, anterior,
    fatos: [{ fonte: "catalogo_publicado", clinicaId: "clinica", registro: "outra", chave: { procedimento: "Consulta GINECOLOGIA" } }] as never });
  expect(proxima?.atendimentoConsulta).toEqual(com);
});
