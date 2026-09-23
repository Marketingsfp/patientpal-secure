import { expect, test } from "bun:test";
import { validarSelecaoLote, publicarLoteValidado } from "../catalogo-lote-ia";
import { aplicarEdicaoCatalogoIA, type PreviaEdicaoCatalogo } from "../catalogo-edicao-ia";
import { profissionalSchema, servicoSchema } from "../catalogo";

const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const catalogo = [
  { id: a, tipo: "servico" as const, nome: "Mamografia" },
  { id: b, tipo: "profissional" as const, nome: "Sandro" },
];
const pedido = "Mudar somente dinheiro para 150 reais";
test("seleção mista identifica ambos os cadastros sem aceitar nomes/IDs inventados ou duplicados", () => {
  const itens = catalogo.map((c) => ({ id: c.id, tipo: c.tipo, pedido }));
  expect(
    validarSelecaoLote({ itens, esclarecimentos: [] }, catalogo).itens.map((i) => i.nome),
  ).toEqual(["Mamografia", "Sandro"]);
  expect(() =>
    validarSelecaoLote({ itens: [itens[0], itens[0]], esclarecimentos: [] }, catalogo),
  ).toThrow("repetido");
  expect(() =>
    validarSelecaoLote({ itens: [{ ...itens[0], id: b }], esclarecimentos: [] }, catalogo),
  ).toThrow("inexistente");
});
test("pedido ambíguo não retorna seleção parcial", () => {
  expect(
    validarSelecaoLote(
      {
        itens: [{ id: a, tipo: "servico", pedido }],
        esclarecimentos: ["Cardiologia de qual médico e forma de pagamento?"],
      },
      catalogo,
    ).itens,
  ).toEqual([]);
});
const previa = (id: string): PreviaEdicaoCatalogo => ({
  id,
  tipo: "servico",
  nome: id,
  esperadoUpdatedAt: "2026-09-23T12:00:00Z",
  incluiRascunho: false,
  dados: servicoSchema.parse({ nome: "Mamografia" }),
  mudancas: [],
});
test("conflito no segundo selecionado impede qualquer publicação durante preflight", async () => {
  const gravados: string[] = [];
  await expect(
    publicarLoteValidado(
      [previa(a), previa(b)],
      async (i) => {
        if (i.id === b) throw new Error("cadastro mudou");
      },
      async (i) => {
        gravados.push(i.id);
      },
    ),
  ).rejects.toThrow("cadastro mudou");
  expect(gravados).toEqual([]);
});
test("falha durante publicação informa exatamente o que gravou e interrompe os demais", async () => {
  const r = await publicarLoteValidado(
    [previa(a), previa(b)],
    async () => {},
    async (i) => {
      if (i.id === b) throw new Error("falha de gravação");
    },
  );
  expect(r.publicados).toEqual([`servico:${a}`]);
  expect(r.falha).toEqual({ chave: `servico:${b}`, mensagem: "falha de gravação" });
});
test("publica somente a seleção enviada, uma vez por cadastro", async () => {
  const gravados: string[] = [];
  await publicarLoteValidado(
    [previa(b)],
    async () => {},
    async (i) => {
      gravados.push(i.id);
    },
  );
  expect(gravados).toEqual([b]);
  await expect(
    publicarLoteValidado(
      [previa(a), previa(a)],
      async () => {},
      async () => {},
    ),
  ).rejects.toThrow("diferentes");
});
const bloco = (nome: string, dinheiro: number) =>
  `${nome}\nEspecialidade: CARDIOLOGIA\nProfissional: Sandro\nDinheiro: R$ ${dinheiro},00\nPix/cartão: R$ 145,00\nObservação: Agendado`;
const definir = (caminho: string, valor: unknown) => ({
  operacao: "definir",
  caminho,
  valor_json: JSON.stringify(valor),
});
test("separa preço compartilhado: cardiologia muda e clínico geral mantém valor e descrição", () => {
  const p = profissionalSchema.parse({
    nome: "Sandro",
    observacao_publica:
      bloco("CONSULTA CARDIOLOGIA", 120) + "\n\n" + bloco("CONSULTA CLINICO GERAL", 120),
    formas_pagamento: [
      { forma: "Dinheiro", valor: 120, condicao: "CONSULTA CARDIOLOGIA, CONSULTA CLINICO GERAL" },
      { forma: "Pix/cartão", valor: 145 },
    ],
  });
  const r = aplicarEdicaoCatalogoIA("profissional", p, {
    alteracoes: [
      definir("/formas_pagamento/0/condicao", "CONSULTA CLINICO GERAL"),
      {
        operacao: "adicionar",
        caminho: "/formas_pagamento",
        valor_json: JSON.stringify({
          forma: "Dinheiro",
          valor: 130,
          condicao: "CONSULTA CARDIOLOGIA",
        }),
      },
    ],
    ambiguidades: [],
    pendencias: [],
  });
  expect(r.dados.observacao_publica).toContain(bloco("CONSULTA CARDIOLOGIA", 130));
  expect(r.dados.observacao_publica).toContain(bloco("CONSULTA CLINICO GERAL", 120));
  expect(r.mudancas.map((x) => x.campo)).toContain("Observação pública");
  expect(p.observacao_publica).not.toContain("130");
});
test("atualiza preço da mamografia no resumo e descrição, preservando cartão e parcelamento", () => {
  const s = servicoSchema.parse({
    nome: "Mamografia",
    descricao_publica: bloco("MAMOGRAFIA", 120).replace("145,00", "145,00 (cartão em 2x)"),
    formas_pagamento: [
      { forma: "Dinheiro", valor: 120 },
      { forma: "Cartão", valor: 145 },
    ],
  });
  const r = aplicarEdicaoCatalogoIA("servico", s, {
    alteracoes: [definir("/formas_pagamento/0/valor", 150)],
    ambiguidades: [],
    pendencias: [],
  });
  expect(r.dados.valor).toBe(145);
  expect(r.dados.descricao_publica).toContain("Dinheiro: R$ 150,00");
  expect(r.dados.descricao_publica).toContain("145,00 (cartão em 2x)");
});
test("preços ambíguos não geram prévia contraditória com os blocos publicados", () => {
  const p = profissionalSchema.parse({
    nome: "Sandro",
    observacao_publica: bloco("CONSULTA CARDIOLOGIA", 120),
    formas_pagamento: [
      { forma: "Dinheiro", valor: 120 },
      { forma: "Dinheiro", valor: 110, condicao: "Pacientes idosos" },
      { forma: "Cartão", valor: 145 },
    ],
  });
  // O desconto condicionado não pode ser substituído por uma regra geral na descrição.
  expect(() =>
    aplicarEdicaoCatalogoIA("profissional", p, {
      alteracoes: [definir("/formas_pagamento/1/valor", 115)],
      ambiguidades: [],
      pendencias: [],
    }),
  ).toThrow("associar");
});
