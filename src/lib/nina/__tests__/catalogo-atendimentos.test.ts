import { describe, expect, test } from "bun:test";
import {
  converterParaEstruturado,
  fatosNoTextoLivre,
  lerHorariosTexto,
  MENSAGEM_ITEM_ESTRUTURADO,
} from "../catalogo-atendimentos";
import { profissionalSchema, servicoSchema } from "../catalogo";
import { servicoParaRegistro, profissionalParaRegistro } from "../catalogo-conhecimento";
import {
  atendimentosEstruturados,
  pendenciasEstrutura,
  type AtendimentoCatalogo,
} from "../catalogo-estrutura";
import { fluxoDoRegistro, modalidadeDoRegistro } from "../fluxo-agendamento-item";
import { prepararSincronizacao } from "../catalogo-sincronizacao";
import { aplicarEdicaoCatalogoIA } from "../catalogo-edicao-ia";

const ids = () => {
  let n = 0;
  return () => `a${++n}`;
};

// Dados fictícios no mesmo formato que a agenda gera.
const exameAntigo = () => ({
  nome: "Exame Teste",
  descricao_publica:
    "Tempo cadastrado no sistema: 30 min\nEspecialidades cadastradas: Ultrassonografia",
  valor: 150,
  valor_observacao: null,
  executantes: [
    {
      medico_id: null,
      nome: "Profissional Teste",
      horarios: "Segunda-feira 08:00–12:00 · Quarta-feira 13:00–17:00",
      observacao: "Segunda-feira 08:00–12:00: Limite de 15 pacientes",
    },
  ],
  formas_pagamento: [
    { forma: "Dinheiro", valor: 150, condicao: null, observacao: null },
    { forma: "Pix/cartão", valor: 165, condicao: "até 3x", observacao: null },
  ],
  estrutura: {
    versao: 1,
    complementos: [{ chave: "exame teste::", modalidade: "hora_marcada" }],
    nina_pode_agendar: true,
  },
});

const profissionalAntigo = () => ({
  nome: "Profissional Teste B",
  observacao_publica: [
    "Consulta Pediatria",
    "Especialidade: Pediatria",
    "Dias e horários: Segunda-feira 08:00–12:00",
    "Dinheiro: R$ 200,00",
    "Cartão: R$ 220,00",
    "Idade/critério informado: a partir de 2 anos",
    "Observação: Hora marcada",
    "",
    "Consulta Clínica",
    "Especialidade: Clínica Médica",
    "Dias e horários: Terça-feira 09:00–11:00",
    "Dinheiro: R$ 180,00",
    "Pode chegar até que horas: até 10h",
    "Observação: Ordem de chegada",
  ].join("\n"),
  horarios: [
    { dia: "Segunda-feira", inicio: "08:00", fim: "12:00", recorrencia: "Toda semana" },
    { dia: "Terça-feira", inicio: "09:00", fim: "11:00", recorrencia: "Toda semana" },
  ],
  formas_pagamento: [],
  tipo_atendimento: null,
  especialidades: [{ nome: "Pediatria" }, { nome: "Clínica Médica" }],
  estrutura: { versao: 1, complementos: [] },
});

function exameEstruturado() {
  const antigo = exameAntigo();
  const c = converterParaEstruturado("servico", antigo, ids());
  return servicoSchema.parse({
    ...antigo,
    descricao_publica: c.descricao,
    estrutura: { ...antigo.estrutura, atendimentos: c.atendimentos },
  });
}

describe("conversão do formato antigo", () => {
  test("exame: executante, horários da agenda com observação, preços e modalidade", () => {
    const c = converterParaEstruturado("servico", exameAntigo(), ids());
    expect(c.pendencias).toEqual([]);
    expect(c.descricao).toBe("Tempo cadastrado no sistema: 30 min");
    const [a] = c.atendimentos;
    expect(a).toMatchObject({
      nome: "Exame Teste",
      especialidade: "Ultrassonografia",
      modalidade: "hora_marcada",
    });
    expect(a!.executantes[0]!.horarios).toEqual([
      {
        dia: "Segunda-feira",
        inicio: "08:00",
        fim: "12:00",
        recorrencia: "Toda semana",
        observacao: "Limite de 15 pacientes",
      },
      {
        dia: "Quarta-feira",
        inicio: "13:00",
        fim: "17:00",
        recorrencia: "Toda semana",
        observacao: null,
      },
    ]);
    expect(a!.precos).toEqual([
      { forma: "Dinheiro", valor: 150, condicao: null, observacao: null },
      { forma: "Pix/cartão", valor: 165, condicao: "até 3x", observacao: null },
    ]);
  });

  test("profissional: cada bloco vira um atendimento com horário, preço, idade e chegada", () => {
    const c = converterParaEstruturado("profissional", profissionalAntigo(), ids());
    expect(c.pendencias).toEqual([]);
    expect(c.descricao).toBe("");
    expect(c.atendimentos.map((a) => [a.nome, a.especialidade, a.modalidade])).toEqual([
      ["Consulta Pediatria", "Pediatria", "hora_marcada"],
      ["Consulta Clínica", "Clínica Médica", "chegada_sem_pre_agendamento"],
    ]);
    expect(c.atendimentos[0]).toMatchObject({ idade_minima: 2, unidade_idade: "anos" });
    expect(c.atendimentos[1]).toMatchObject({ chegada_ate: "10:00" });
    expect(c.atendimentos[0]!.precos.map((p) => [p.forma, p.valor])).toEqual([
      ["Dinheiro", 200],
      ["Cartão", 220],
    ]);
  });

  test("o que não é lido com segurança vira pendência, nunca some", () => {
    const antigo = exameAntigo();
    antigo.executantes[0]!.horarios = "Seg e Qua de manhã";
    antigo.estrutura.complementos = [];
    const c = converterParaEstruturado("servico", antigo, ids());
    expect(c.pendencias.some((p) => p.includes("confira os horários"))).toBe(true);
    expect(c.pendencias.some((p) => p.includes("modalidade não informada"))).toBe(true);
  });

  test("leitura de horários indica quando sobrou texto", () => {
    expect(lerHorariosTexto("Segunda-feira 08:00–12:00 · Sábado 08:00–11:00").completo).toBe(true);
    expect(lerHorariosTexto("Segunda-feira 08:00–12:00, exceto feriados").completo).toBe(false);
  });
});

describe("item estruturado: fonte única", () => {
  test("ao salvar, colunas antigas são calculadas dos atendimentos", () => {
    const salvo = exameEstruturado();
    expect(salvo.valor).toBeNull();
    expect(salvo.estrutura?.complementos).toEqual([]);
    expect(salvo.executantes).toEqual([
      {
        tipo_escala: "exame_procedimento",
        medico_id: null,
        nome: "Profissional Teste",
        horarios: "Segunda-feira 08:00–12:00: Limite de 15 pacientes · Quarta-feira 13:00–17:00",
        observacao: null,
      },
    ]);
    expect(salvo.formas_pagamento.map((f) => [f.forma, f.valor, f.condicao])).toEqual([
      ["Dinheiro", 150, null],
      ["Pix/cartão", 165, "até 3x"],
    ]);
  });

  test("profissional com vários atendimentos: preço ligado ao atendimento e sem modalidade única", () => {
    const antigo = profissionalAntigo();
    const c = converterParaEstruturado("profissional", antigo, ids());
    const salvo = profissionalSchema.parse({
      ...antigo,
      especialidades: [],
      observacao_publica: c.descricao,
      estrutura: { ...antigo.estrutura, atendimentos: c.atendimentos },
    });
    expect(salvo.tipo_atendimento).toBeNull();
    expect(salvo.formas_pagamento.map((f) => f.condicao)).toEqual([
      "Consulta Pediatria",
      "Consulta Pediatria",
      "Consulta Clínica",
    ]);
    expect(salvo.horarios.map((h) => h.dia)).toEqual(["Segunda-feira", "Terça-feira"]);
  });

  test("texto livre com fatos bloqueia o salvamento só no item estruturado", () => {
    const fatos = "Valor R$ 100,00, às segundas das 08:00, hora marcada, a partir de 12 anos";
    expect(fatosNoTextoLivre(fatos)).toEqual([
      "preço",
      "horário",
      "dia da semana",
      "modalidade",
      "idade",
    ]);
    const estruturado = exameEstruturado();
    expect(servicoSchema.safeParse({ ...estruturado, descricao_publica: fatos }).success).toBe(
      false,
    );
    const antigo = exameAntigo();
    expect(servicoSchema.safeParse({ ...antigo, descricao_publica: fatos }).success).toBe(true);
  });

  test("a Nina recebe o texto livre e o resumo gerado, sem repetir as formas de pagamento", () => {
    const salvo = exameEstruturado();
    const r = servicoParaRegistro({ id: "x", ...salvo } as never);
    expect(r.observacoes).toContain("Tempo cadastrado no sistema: 30 min");
    expect(r.observacoes).toContain("Pix/cartão: R$ 165,00 (até 3x)");
    expect(r.observacoes).toContain("Modalidade: Hora marcada");
    expect(r.observacoes).not.toContain("Formas de pagamento —");
    expect(r.preco_dinheiro).toBe(150);
    expect(r.preco_cartao).toBe(165);
  });

  test("profissional estruturado: resumo por atendimento e modalidade mista não definida", () => {
    const antigo = profissionalAntigo();
    const c = converterParaEstruturado("profissional", antigo, ids());
    const salvo = profissionalSchema.parse({
      ...antigo,
      especialidades: [],
      observacao_publica: "",
      estrutura: { ...antigo.estrutura, atendimentos: c.atendimentos },
    });
    const r = profissionalParaRegistro(
      {
        id: "p",
        ...salvo,
        aviso_dia: null,
        aviso_valido_de: null,
        aviso_valido_ate: null,
      } as never,
      "2026-10-12",
    );
    expect(r.observacoes).toContain("Limite de chegada publicado: 10:00");
    expect(r.observacoes).toContain("Critério publicado: a partir de 2 anos");
    expect((r.extras as Record<string, unknown>).modalidade_atendimento).toBe("nao_definida");
  });
});

describe("regra única de modalidade", () => {
  const com = (modos: Array<AtendimentoCatalogo["modalidade"]>, podeAgendar = true) => ({
    estrutura: {
      nina_pode_agendar: podeAgendar,
      atendimentos: modos.map((modalidade, i) => ({
        id: `x${i}`,
        nome: `Atendimento ${i}`,
        modalidade,
        precos: [],
      })),
    },
    // Classificação antiga não interfere no item estruturado.
    tipo_atendimento: "Hora marcada",
  });

  test("todos iguais → essa modalidade; diferentes ou faltando → não definida", () => {
    expect(modalidadeDoRegistro(com(["ficha", "ficha"]))).toBe("ficha");
    expect(modalidadeDoRegistro(com(["ficha", "hora_marcada"]))).toBe("nao_definida");
    expect(modalidadeDoRegistro(com(["hora_marcada", null]))).toBe("nao_definida");
  });

  test("fluxo do item segue a modalidade estruturada", () => {
    expect(fluxoDoRegistro(com(["hora_marcada"]))).toBe("agendar");
    expect(fluxoDoRegistro(com(["hora_marcada"], false))).toBe("informar_e_encaminhar");
    expect(fluxoDoRegistro(com(["chegada_sem_pre_agendamento"]))).toBe("somente_informar");
    expect(fluxoDoRegistro(com([null]))).toBe("informar_e_encaminhar");
  });

  test("leitura dos atendimentos usa a estrutura, não o texto", () => {
    const salvo = exameEstruturado();
    const itens = atendimentosEstruturados(
      "Especialidade: Outra\nDinheiro: R$ 1,00",
      salvo.estrutura,
      undefined,
      salvo.nome,
    );
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ atendimento: "Exame Teste", dinheiro: "R$ 150,00" });
    expect(pendenciasEstrutura("", salvo.estrutura)).toEqual([]);
  });
});

describe("ferramentas que ainda gravam o formato antigo recusam item estruturado", () => {
  test("sincronização e importação", () => {
    const salvo = exameEstruturado();
    expect(() =>
      prepararSincronizacao(
        "servico",
        { id: "22222222-2222-4222-8222-222222222222", ...salvo, status: "PUBLICADO" } as never,
        { id: "33333333-3333-4333-8333-333333333333", nome: "Exame Teste" } as never,
      ),
    ).toThrow(MENSAGEM_ITEM_ESTRUTURADO);
  });

  test("edição com IA", () => {
    const salvo = exameEstruturado();
    expect(() => aplicarEdicaoCatalogoIA("servico", salvo, {})).toThrow(MENSAGEM_ITEM_ESTRUTURADO);
  });
});
