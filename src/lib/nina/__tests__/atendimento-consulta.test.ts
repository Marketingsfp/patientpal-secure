import { expect, test } from "bun:test";
import { atualizarPreferenciaAtendimento, nomesAmigaveisConsulta, atendePreferenciaConsulta, pedidoPreventivo, pedidoConsultaComPreventivo, selecionarAtendimentosConsulta } from "../atendimento-consulta";
import { prepararBuscaCatalogo, REGRA_INTERPRETACAO_CATALOGO } from "../catalogo-busca";
import { profissionalParaRegistro } from "../catalogo-conhecimento";
import { atendimentosEstruturados } from "../catalogo-estrutura";
import { conhecimentoDaMesmaSessao, lembrarConsultaComprovada } from "../confidence/conhecimento-sessao";

const registro = profissionalParaRegistro({ id: "medica", nome: "Conceição Martins",
  atende_consultorio: true, formas_pagamento: [], convenios: [], horarios: [], tipo_atendimento: "Agendado",
  aviso_dia: null, aviso_valido_de: null, aviso_valido_ate: null,
  especialidades: [{ nome: "GINECOLOGIA" }], observacao_publica:
    "CONSULTA + PREVENTIVO\nEspecialidade: GINECOLOGIA\nDinheiro: R$ 172,00\nPix/cartão: R$ 205,00\nObservação: Agendado" }, "2026-09-21");
const com = { especialidade: "GINECOLOGIA", preventivo: "com" as const };

test("Sandro: a especialidade seleciona consulta comum, sem incluir revisão ou risco", () => {
  const itens = atendimentosEstruturados("CONSULTA CLINICA MEDICA\nEspecialidade: CLINICO GERAL\n\nREVISAO\nEspecialidade: CLINICO GERAL\n\nRISCO CIRURGICO\nEspecialidade: CLINICO GERAL", null);
  expect(selecionarAtendimentosConsulta(itens, { atendimento: "Clínico Geral" }).map(i => i.atendimento)).toEqual(["CONSULTA CLINICA MEDICA"]);
  expect(selecionarAtendimentosConsulta(itens, { atendimento: "REVISAO — CLINICO GERAL" }).map(i => i.atendimento)).toEqual(["REVISAO"]);
});

test("Marina: período distingue noturna da comum sem usar a escala copiada como prova", () => {
  const itens = atendimentosEstruturados(["CONSULTA OFTALMO", "CONSULTA NOTURNA", "REVISAO"].map(n => `${n}\nEspecialidade: OFTALMOLOGIA\nDias e horários: Sábado 08:00–12:00`).join("\n\n"), null);
  const nomes = (periodo?: "manha" | "tarde" | "noite") => selecionarAtendimentosConsulta(itens, { atendimento: "Oftalmologia", periodo }).map(i => i.atendimento);
  expect(nomes("manha")).toEqual(["CONSULTA OFTALMO"]);
  expect(nomes("tarde")).toEqual(["CONSULTA OFTALMO"]);
  expect(nomes("noite")).toEqual(["CONSULTA NOTURNA"]);
  expect(nomes()).toEqual(["CONSULTA OFTALMO", "CONSULTA NOTURNA"]);
  expect(selecionarAtendimentosConsulta(itens, { atendimento: "CONSULTA NOTURNA", periodo: "manha" })).toEqual([]);
});
test.each(["Quero ginecologista Carlos, mas preciso da consulta com preventivo junto", "Consulta + preventivo", "Eu quero a consulta de ginecologia COM preventivo, não só o exame"])("preserva o pacote explícito: %s", m => expect(pedidoConsultaComPreventivo(m)).toBe(true));
test.each(["Quero só o exame preventivo", "Não quero consulta com preventivo, preciso só o exame", "Quero consulta sem preventivo", "Quanto custa o preventivo?", "Quero só o exame, não a consulta com preventivo"])("não inventa pacote: %s", m => expect(pedidoConsultaComPreventivo(m)).toBe(false));

test("clínica médica não é sinônimo nem correção de escrita de clínico geral", () => {
  const itens = atendimentosEstruturados("CONSULTA CLÍNICO GERAL\nEspecialidade: CLÍNICO GERAL\nProfissional: Dra. Ana", null);
  expect(selecionarAtendimentosConsulta(itens, { atendimento: "Clínica Médica" })).toHaveLength(0);
  expect(selecionarAtendimentosConsulta(itens, { atendimento: "Clínico Geral" })).toEqual(itens);
  expect(atendePreferenciaConsulta(itens[0]!, { especialidade: "Clínica Médica" })).toBe(false);
  const busca = prepararBuscaCatalogo("clínica médica", ["Clínico Geral"]);
  expect(busca.pontuar("Clínico Geral", "")).toBe(0);
  expect(busca.ajustes).not.toContainEqual({ original: "clinica", candidatos: ["clinico"] });
  expect(REGRA_INTERPRETACAO_CATALOGO).toContain('Dra. Ana — Clínico Geral');
  expect(REGRA_INTERPRETACAO_CATALOGO).toContain('não é sinônimo de Clínico Geral');
});
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

// Homologação 06/10/2026 — neurologia travava em "CONSULTA 2 × LAUDO".
const neuro = atendimentosEstruturados("CONSULTA 2\nEspecialidade: NEUROLOGIA\n\nLAUDO NEUROLOGIA\nEspecialidade: NEUROLOGIA", null);
const comItens = (itens: ReturnType<typeof atendimentosEstruturados>) =>
  ({ ...registro, extras: { ...registro.extras, atendimentos_publicados: itens } });

test("pedido genérico de consulta não inclui laudo nem atestado; pedido explícito continua valendo", () => {
  expect(selecionarAtendimentosConsulta(neuro, { atendimento: "Neurologia" }).map(i => i.atendimento)).toEqual(["CONSULTA 2"]);
  expect(selecionarAtendimentosConsulta(neuro, { atendimento: "LAUDO NEUROLOGIA" }).map(i => i.atendimento)).toEqual(["LAUDO NEUROLOGIA"]);
  const pediatria = atendimentosEstruturados(["CONSULTA", "ATESTADO MEDICO", "ATESTADO PARA ATIVIDADE FISICA ESCOLA DE FUTEBOL", "REVISAO"]
    .map(n => `${n}\nEspecialidade: PEDIATRIA`).join("\n\n"), null);
  expect(selecionarAtendimentosConsulta(pediatria, { atendimento: "Pediatria" }).map(i => i.atendimento)).toEqual(["CONSULTA"]);
});

test.each(["consulta normal", "a consulta", "consulta comum mesmo"])("resposta natural escolhe a consulta comum: %s", mensagem => {
  expect(atualizarPreferenciaAtendimento({ mensagem, registros: [comItens(neuro)] }))
    .toEqual({ especialidade: "NEUROLOGIA", nome: "CONSULTA 2" });
});

test("palavra própria da opção escolhe essa opção", () => {
  expect(atualizarPreferenciaAtendimento({ mensagem: "é o laudo", registros: [comItens(neuro)] }))
    .toEqual({ especialidade: "NEUROLOGIA", nome: "LAUDO NEUROLOGIA" });
});

test("datas, período e variantes sem serviço próprio não escolhem por aproximação", () => {
  expect(atualizarPreferenciaAtendimento({ mensagem: "pode ser dia 2?", registros: [comItens(neuro)] })).toBeNull();
  expect(atualizarPreferenciaAtendimento({ mensagem: "consulta a noite", registros: [comItens(neuro)] })).toBeNull();
  const oftalmo = atendimentosEstruturados(["CONSULTA OFTALMO", "CONSULTA NOTURNA"]
    .map(n => `${n}\nEspecialidade: OFTALMOLOGIA`).join("\n\n"), null);
  expect(atualizarPreferenciaAtendimento({ mensagem: "consulta normal", registros: [comItens(oftalmo)] })).toBeNull();
});

test("a pergunta ao paciente usa nomes sem a numeração interna", () => {
  expect(nomesAmigaveisConsulta(["CONSULTA 2 — NEUROLOGIA", "LAUDO NEUROLOGIA"])).toEqual(["Consulta de Neurologia", "Laudo Neurologia"]);
  expect(nomesAmigaveisConsulta(["CONSULTA 1 — CLINICO GERAL", "CONSULTA 2 — CLINICO GERAL"]))
    .toEqual(["CONSULTA 1 — CLINICO GERAL", "CONSULTA 2 — CLINICO GERAL"]);
});
