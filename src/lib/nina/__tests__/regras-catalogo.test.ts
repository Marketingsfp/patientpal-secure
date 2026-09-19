import { describe, expect, it } from "bun:test";
import {
  apresentarIdadeMinima,
  dadosPublicosCatalogo,
  profissionalSfp,
  profissionalGenerico,
  resultadoExigeHumano,
  omitirNomeGenerico,
  REGRAS_CATALOGO_PROMPT,
  motivoProfissionalSfp,
} from "../regras-catalogo";
import {
  servicoParaRegistro,
  profissionalParaRegistro,
  type ServicoPublicado,
  type ProfissionalPublicado,
} from "../catalogo-conhecimento";
import { textoDaChave } from "../resposta/templates";
import { comporRequestNina } from "../prompt-composer";

describe("Regras administrativas do catálogo", () => {
  it("distingue o encaminhamento SFP do pedido comum de atendente", () => {
    for (const motivo of ["PROFISSIONAL_SFP: exclusivo da equipe", "Profissional SFP exige atendimento humano", "O profissional é sfp"])
      expect(motivoProfissionalSfp(motivo)).toBe(true);
    for (const motivo of ["Paciente pediu atendente", "CATALOGO_SEM_REGISTRO", "Profissional Dra. Ana", "Paciente João SFP", "Procedimento SFP"])
      expect(motivoProfissionalSfp(motivo)).toBe(false);
  });
  it("reconhece apenas nomes marcadores completos, sem atingir nomes reais ou descrições", () => {
    expect(profissionalSfp(" sfp ")).toBe(true);
    expect(profissionalSfp("Dr. José SFP Junior")).toBe(false);
    for (const nome of ["técnico", "TÉCNICA", " Tecnica ", "Enfermagem", "ENFERMEIRA", "enfermeiro", " Equipe  de Enfermagem ", "Técnica em Enfermagem", "Auxiliar de enfermagem"])
      expect(profissionalGenerico(nome)).toBe(true);
    for (const nome of ["Ana Técnica", "Dra. Ana Souza", "Enfermeira Ana Souza", "SFP", "Orientações de enfermagem", "Técnica do exame"])
      expect(profissionalGenerico(nome)).toBe(false);
  });
  it("SFP no executante do exame e no profissional da consulta exige equipe humana", () => {
    const exame = servicoParaRegistro({
      id: "e",
      nome: "Mamografia",
      executantes: [{ nome: "SFP" }],
      formas_pagamento: [],
    } as unknown as ServicoPublicado);
    const consulta = profissionalParaRegistro(
      {
        id: "p",
        nome: "sfp",
        especialidades: [{ nome: "Cardiologia" }],
        horarios: [],
      } as unknown as ProfissionalPublicado,
      "2026-09-17",
    );
    expect(resultadoExigeHumano({ records: [exame] })).toBe(true);
    expect(resultadoExigeHumano({ registros: [consulta] })).toBe(true);
    expect(resultadoExigeHumano({ erro: "PROFISSIONAL_SFP" })).toBe(true);
    // A sigla no procedimento não é o nome do profissional.
    expect(
      resultadoExigeHumano({ records: [{ procedimento: "Exame SFP", medico: "Dra. Ana" }] }),
    ).toBe(false);
  });
  it("não atribui toda lista ampla ao SFP; aplica a regra ao item escolhido", () => {
    const records = [
      { id: "s", medico: "SFP" },
      { id: "a", medico: "Ana" },
    ];
    expect(resultadoExigeHumano({ records })).toBe(false);
    expect(resultadoExigeHumano({ records }, ["a"])).toBe(false);
    expect(resultadoExigeHumano({ records }, ["s"])).toBe(true);
    expect(resultadoExigeHumano({ records: [] })).toBe(false);
  });
  it("apresenta idade mínima inclusive zero e meses, sem alterar preço, preparo e periodicidade", () => {
    for (const idade of ["18 anos", "3 anos", "0 anos", "1 mês", "6 meses"]) {
      expect(apresentarIdadeMinima(`Idade/critério informado: ${idade}`)).toBe(
        `Idade/critério informado: a partir de ${idade}`,
      );
      expect(apresentarIdadeMinima(idade)).toBe(`a partir de ${idade}`);
    }
    for (const s of [
      "A partir de 6 meses",
      "Jejum: 8 horas; R$ 18,00; retorno a cada 6 meses",
      null,
    ])
      expect(apresentarIdadeMinima(s)).toBe(s);
    const registro = servicoParaRegistro({
      id: "e",
      nome: "Exame",
      restricoes: "Idade: 0 anos",
      formas_pagamento: [],
      executantes: [],
    } as unknown as ServicoPublicado);
    expect(registro.observacoes).toContain("a partir de 0 anos");
    expect(REGRAS_CATALOGO_PROMPT).toContain("idades mínimas");
  });
  it("oculta nome genérico no payload sem perder valores, preparo, horários ou IDs internos", () => {
    const dados = {
      medico_id: "id-agenda",
      medico: "TÉCNICA",
      records: [{ medico: "técnico", preparo: "Sem jejum", preco: 90, dia: "Segunda" }],
    };
    const publico = dadosPublicosCatalogo(dados);
    expect(publico).toEqual({
      medico_id: "id-agenda",
      medico: null,
      records: [{ medico: null, preparo: "Sem jejum", preco: 90, dia: "Segunda" }],
    });
    expect(dados.medico).toBe("TÉCNICA");
    const req = comporRequestNina({
      behaviorPrompt: REGRAS_CATALOGO_PROMPT,
      runtimeContext: dados,
    });
    expect(req.runtimeContext.medico).toBeNull();
  });
  it("omite o nome também no resumo que o paciente aceita e na confirmação final", () => {
    for (const profissional of ["Técnica", "Enfermagem", "Equipe de enfermagem"])
    for (const chave of [
      "fluxo.agendamento.revisar",
      "fluxo.agendamento.revisar_pre_agendamento",
      "fluxo.agendamento.revisar_ficha",
      "fluxo.agendamento.confirmado",
    ]) {
      const r = textoDaChave(chave, {
        profissional,
        procedimento: "Exame",
        data: "20/09/2026",
        horario: "10:20",
        unidade: "Clínica",
      });
      expect(r.texto.length).toBeGreaterThan(0);
      expect(r.texto).not.toMatch(/t[eé]cnic[oa]|enfermagem/i);
      expect(r.texto).toContain("10:20");
    }
    expect(omitirNomeGenerico("Exame com a técnica às 10:20. Valor: R$ 90,00.")).toBe(
      "Exame às 10:20. Valor: R$ 90,00.",
    );
    expect(omitirNomeGenerico("Profissional: Dr. João. Técnica do exame: ultrassom.")).toBe(
      "Profissional: Dr. João. Técnica do exame: ultrassom.",
    );
  });
  it("filtra cargos dos executantes, preserva nomes próprios e não apaga a especialidade nem a mensagem do paciente", () => {
    const registro = servicoParaRegistro({
      id: "ecg", nome: "Eletrocardiograma",
      executantes: [
        { nome: "Enfermagem", horarios: "Segunda a sábado às 07:00", observacao: "Ordem de chegada" },
        { nome: "Dra. Ana Souza", horarios: "Quarta às 08:00" },
      ],
      formas_pagamento: [{ forma: "Dinheiro", valor: 51 }, { forma: "Cartão", valor: 60 }],
      preparo: "Procure a enfermagem para as orientações de preparo.",
    } as unknown as ServicoPublicado);
    const original = structuredClone(registro);
    const publico = dadosPublicosCatalogo({
      records: [registro], doctors: ["Enfermagem", "Dra. Ana Souza"],
      mensagemAtual: "Enfermagem", especialidade: "Enfermagem", medico_id: "enfermagem",
    });
    expect(publico.records[0]?.medico).toBe("Dra. Ana Souza");
    expect(publico.records[0]?.extras).toMatchObject({ omitir_nome_profissional: true, executantes: [
      { nome: null, horarios: "Segunda a sábado às 07:00", observacao: "Ordem de chegada" },
      { nome: "Dra. Ana Souza", horarios: "Quarta às 08:00" },
    ] });
    expect(publico.records[0]).toMatchObject({ preco_dinheiro: 51, preco_cartao: 60, preparo: original.preparo });
    expect(publico.doctors).toEqual(["Dra. Ana Souza"]);
    expect(publico).toMatchObject({ mensagemAtual: "Enfermagem", especialidade: "Enfermagem", medico_id: "enfermagem" });
    expect(registro).toEqual(original);
  });
  it.each([
    "Profissional: Enfermagem", "*Profissional:* Enfermagem", "**Profissional:** **ENFERMAGEM**",
    "- Profissional: Técnica de Enfermagem", "*Enfermagem*", "*Equipe de Enfermagem*",
  ])("omite identificação genérica da mensagem sem retirar os fatos: %s", (rotulo) => {
    const fatos = "Dias: segunda a sábado às 07:00\nDinheiro: R$ 51,00\nCartão: R$ 60,00\nModalidade: ordem de chegada";
    expect(omitirNomeGenerico(`Eletrocardiograma\n${rotulo}\n${fatos}`)).toBe(`Eletrocardiograma\n\n${fatos}`);
  });
  it("preserva nomes próprios em lista mista e referências a enfermagem fora da identificação", () => {
    expect(omitirNomeGenerico("Profissional: Enfermagem, Dra. Ana Souza\nValor: R$ 51,00")).toBe("Profissional: Dra. Ana Souza\nValor: R$ 51,00");
    expect(omitirNomeGenerico("Exame. *Profissional:* Enfermagem. Valor: R$ 51,00.")).toBe("Exame. Valor: R$ 51,00.");
    expect(omitirNomeGenerico("Exame com a enfermagem às 07:00.")).toBe("Exame às 07:00.");
    for (const original of ["Profissional: Dra. Ana Souza", "Orientações de preparo fornecidas pela enfermagem da unidade.", "Exame com a técnica de ultrassom.", "Profissional: Enfermeira Ana Souza"])
      expect(omitirNomeGenerico(original)).toBe(original);
  });
});
