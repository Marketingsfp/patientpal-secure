import { expect, test } from "bun:test";
import { lacunasCatalogo } from "../catalogo-lacunas";
import { profissionalSchema, servicoSchema } from "../catalogo";

test("exame só com nome e preço avisa todos os campos vazios", () => {
  const dados = servicoSchema.parse({
    nome: "Ultrassom de tireoide",
    formas_pagamento: [{ forma: "Dinheiro", valor: 130 }],
  });
  const faltas = lacunasCatalogo("servico", dados);
  expect(faltas).toContain("Pedido médico (exige ou dispensa)");
  expect(faltas).toContain("Preparo (orientações ou “não exige preparo”)");
  expect(faltas).toContain("Quem realiza");
  expect(faltas).toContain("Texto para o paciente");
  expect(faltas).toContain("Nota interna");
  expect(faltas).not.toContain("Valores e formas de pagamento");
});

test("exame completo não tem aviso de campo vazio", () => {
  const dados = servicoSchema.parse({
    nome: "Ultrassom de tireoide",
    descricao_publica: "Exame de imagem da tireoide.",
    restricoes: "Trazer documento.",
    nota_interna: "Sala 2.",
    valor_observacao: "Cartão em até 3x.",
    executantes: [{ nome: "Dra. Ana", horarios: "Terça 8h às 12h" }],
    formas_pagamento: [{ forma: "Dinheiro", valor: 130 }],
    estrutura: {
      aliases: ["usg tireoide"],
      categoria: "exame",
      nina_pode_agendar: true,
      encaminhamento_humano: false,
      pedido_medico: "obrigatorio",
      preparo_status: "sem_preparo",
    },
  });
  expect(lacunasCatalogo("servico", dados)).toEqual([]);
});

test("forma de pagamento sem valor e executante sem horário aparecem", () => {
  const dados = servicoSchema.parse({
    nome: "Raio X",
    executantes: [{ nome: "Técnico" }],
    formas_pagamento: [{ forma: "Pix" }],
  });
  const faltas = lacunasCatalogo("servico", dados);
  expect(faltas).toContain("Horários de Técnico");
  expect(faltas).toContain("Valor (Pix)");
});

test("profissional sem dados avisa especialidade, horários, modalidade e valores", () => {
  const faltas = lacunasCatalogo("profissional", profissionalSchema.parse({ nome: "Dr. Sandro" }));
  for (const campo of [
    "Especialidades",
    "Dias e horários",
    "Hora marcada, ordem de chegada ou ficha",
    "Valores e formas de pagamento",
    "Situação dos convênios (aceita ou não)",
    "Atende no consultório",
  ])
    expect(faltas).toContain(campo);
});

test("item estruturado avisa por atendimento", () => {
  const dados = profissionalSchema.parse({
    nome: "Dr. Sandro",
    estrutura: {
      atendimentos: [
        {
          id: "a1",
          nome: "Consulta cardiologia",
          especialidade: "Cardiologia",
          modalidade: null,
          horarios: [],
          precos: [{ forma: "Dinheiro", valor: 120 }],
        },
      ],
    },
  });
  const faltas = lacunasCatalogo("profissional", dados);
  expect(faltas).toContain("Hora marcada, ordem de chegada ou ficha — Consulta cardiologia");
  expect(faltas).toContain("Dias e horários — Consulta cardiologia");
  expect(faltas).not.toContain("Valores — Consulta cardiologia");
  expect(faltas).not.toContain("Dias e horários");
});
