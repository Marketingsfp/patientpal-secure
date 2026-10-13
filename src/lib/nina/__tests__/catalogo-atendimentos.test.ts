import { describe, expect, test } from "bun:test";
import {
  converterParaEstruturado,
  fatosNoTextoLivre,
  lerHorariosTexto,
  copiaFormatoAntigo,
  restaurarFormatoAntigo,
  mesclarComOrigem,
} from "../catalogo-atendimentos";
import { planejarConversao } from "../catalogo-conversao";
import { profissionalSchema, servicoSchema } from "../catalogo";
import { servicoParaRegistro, profissionalParaRegistro } from "../catalogo-conhecimento";
import {
  atendimentosEstruturados,
  modalidadeEstruturada,
  pendenciasEstrutura,
  type AtendimentoCatalogo,
} from "../catalogo-estrutura";
import { fluxoDoRegistro, modalidadeDoRegistro } from "../fluxo-agendamento-item";
import { permissaoAgendamentoNoCatalogo } from "../regras-catalogo";
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

  test("modalidade comum aos atendimentos preenchidos; em branco não bloqueia; diferentes → não definida", () => {
    expect(modalidadeDoRegistro(com(["ficha", "ficha"]))).toBe("ficha");
    expect(modalidadeDoRegistro(com(["ficha", "hora_marcada"]))).toBe("nao_definida");
    // Caso real (12/10): consulta com hora marcada e atestado/noturna/laudos/revisão em branco.
    expect(modalidadeDoRegistro(com(["hora_marcada", null, null, null, null]))).toBe(
      "hora_marcada",
    );
    expect(fluxoDoRegistro(com(["hora_marcada", null, null, null, null]))).toBe("agendar");
    expect(modalidadeDoRegistro(com([null, null]))).toBe("nao_definida");
  });

  test("trava da agenda: atendimento pedido sem modalidade continua sem modalidade", () => {
    const estrutura = com(["hora_marcada", null]).estrutura;
    const [consulta, noturna] = atendimentosEstruturados("", estrutura, "Profissional Teste");
    // Consulta e noturna selecionadas juntas: a noturna em branco não bloqueia.
    expect(
      modalidadeEstruturada("", estrutura, "Profissional Teste", null, [consulta!, noturna!]),
    ).toBe("hora_marcada");
    // Pedido específico pela noturna (sem modalidade): segue sem modalidade.
    expect(modalidadeEstruturada("", estrutura, "Profissional Teste", null, [noturna!])).toBeNull();
  });

  test("cada atendimento vale isoladamente quando o pedido é identificado", () => {
    const registro = {
      nome: "Profissional Teste",
      estrutura: {
        nina_pode_agendar: true,
        atendimentos: [
          {
            id: "c",
            nome: "CONSULTA",
            especialidade: "ORTOPEDIA",
            modalidade: "hora_marcada",
            horarios: [],
            executantes: [],
            precos: [],
          },
          {
            id: "r",
            nome: "REVISAO",
            especialidade: "ORTOPEDIA",
            modalidade: "ficha",
            horarios: [],
            executantes: [],
            precos: [],
          },
          {
            id: "n",
            nome: "CONSULTA NOTURNA",
            especialidade: "ORTOPEDIA",
            horarios: [],
            executantes: [],
            precos: [],
          },
        ],
      },
    };
    // Pedido de consulta de ortopedia: revisão (serviço próprio) e noturna em branco não interferem.
    expect(modalidadeDoRegistro(registro, { atendimento: "ortopedia" })).toBe("hora_marcada");
    expect(fluxoDoRegistro(registro, true, { atendimento: "ortopedia" })).toBe("agendar");
    // Revisão pedida pelo nome: a modalidade dela.
    expect(modalidadeDoRegistro(registro, { atendimento: "revisao" })).toBe("ficha");
    // Noturna pedida pelo nome, sem modalidade: informa e encaminha.
    expect(fluxoDoRegistro(registro, true, { atendimento: "consulta noturna" })).toBe(
      "informar_e_encaminhar",
    );
    // Sem atendimento identificado e modalidades diferentes: não definida.
    expect(modalidadeDoRegistro(registro)).toBe("nao_definida");
    // A trava da ferramenta de agendamento decide pelo mesmo atendimento.
    const catalogo = { servicos: [], profissionais: [{ id: "p1", ...registro }] };
    expect(
      permissaoAgendamentoNoCatalogo(catalogo, {
        medico: "p1",
        escopo: { atendimento: "ortopedia" },
      })?.permitido,
    ).toBe(true);
    expect(
      permissaoAgendamentoNoCatalogo(catalogo, {
        medico: "p1",
        escopo: { atendimento: "consulta noturna" },
      })?.permitido,
    ).toBe(false);
    expect(permissaoAgendamentoNoCatalogo(catalogo, { medico: "p1" })?.permitido).toBe(false);
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

describe("sincronização de item estruturado: origem atualiza fatos, equipe mantém regras", () => {
  const ID = "22222222-2222-4222-8222-222222222222";
  const FONTE = "33333333-3333-4333-8333-333333333333";
  test("preços e horários da origem; modalidade, idade e encaminhamento da equipe", () => {
    const salvo = exameEstruturado();
    const [a] = salvo.estrutura!.atendimentos!;
    const atual = {
      id: ID,
      ...salvo,
      status: "PUBLICADO",
      descricao_publica: "Texto da equipe",
      estrutura: {
        ...salvo.estrutura,
        encaminhamento_humano: true,
        pedido_medico: "obrigatorio",
        atendimentos: [{ ...a!, idade_minima: 12, unidade_idade: "anos", inclui: "Laudo" }],
      },
    };
    const origem = {
      ...exameAntigo(),
      id: FONTE,
      procedimento_id: FONTE,
      descricao_publica: "Descrição da origem",
      formas_pagamento: [{ forma: "Dinheiro", valor: 180, condicao: null, observacao: null }],
      estrutura: { versao: 1, complementos: [] },
    };
    const { dados, mudancas } = prepararSincronizacao("servico", atual as never, origem as never);
    const [depois] = dados.estrutura!.atendimentos!;
    expect(depois).toMatchObject({
      id: a!.id,
      modalidade: "hora_marcada",
      idade_minima: 12,
      inclui: "Laudo",
    });
    expect(depois!.precos.map((p) => p.valor)).toEqual([180]);
    expect(dados.estrutura).toMatchObject({
      encaminhamento_humano: true,
      pedido_medico: "obrigatorio",
      nina_pode_agendar: true,
    });
    expect((dados as { descricao_publica?: string | null }).descricao_publica).toBe(
      "Texto da equipe",
    );
    expect(mudancas.some((m) => m.campo === "“Exame Teste” — Preços")).toBe(true);
  });

  test("mesclagem casa pelo nome, preserva referência quinzenal e aponta removidos", () => {
    const atual: AtendimentoCatalogo[] = [
      {
        id: "x1",
        nome: "Consulta Pediatria",
        modalidade: "ficha",
        horarios: [
          {
            dia: "Sexta-feira",
            inicio: "08:00",
            fim: "12:00",
            recorrencia: "Quinzenal",
            referencia_recorrencia: "2026-10-09",
          },
        ],
        executantes: [],
        precos: [],
      },
      { id: "x2", nome: "Retorno", horarios: [], executantes: [], precos: [] },
    ];
    const origem: AtendimentoCatalogo[] = [
      {
        id: "o1",
        nome: "CONSULTA PEDIATRIA",
        modalidade: null,
        horarios: [{ dia: "Sexta-feira", inicio: "08:00", fim: "12:00", recorrencia: "Quinzenal" }],
        executantes: [],
        precos: [{ forma: "Dinheiro", valor: 200 }],
      },
    ];
    const r = mesclarComOrigem(atual, origem);
    expect(r.removidos).toEqual(["Retorno"]);
    expect(r.atendimentos[0]).toMatchObject({ id: "x1", modalidade: "ficha" });
    expect(r.atendimentos[0]!.horarios[0]!.referencia_recorrencia).toBe("2026-10-09");
    expect(r.atendimentos[0]!.precos[0]!.valor).toBe(200);
  });
});

describe("edição com IA de item estruturado", () => {
  const op = (operacao: string, caminho: string, valor?: unknown) => ({
    operacao,
    caminho,
    valor_json: valor === undefined ? null : JSON.stringify(valor),
  });
  const proposta = (...alteracoes: unknown[]) => ({ alteracoes, pendencias: [], ambiguidades: [] });

  test("altera preço e modalidade do atendimento e mostra a diferença", () => {
    const salvo = exameEstruturado();
    const r = aplicarEdicaoCatalogoIA(
      "servico",
      salvo,
      proposta(
        op("definir", "/atendimentos/0/precos/0/valor", 170),
        op("definir", "/atendimentos/0/modalidade", "ficha"),
        op("adicionar", "/atendimentos/0/executantes/0/horarios", {
          dia: "Sexta-feira",
          inicio: "08:00",
          fim: "10:00",
        }),
      ),
    );
    const [a] = r.dados.estrutura!.atendimentos!;
    expect(a!.precos[0]!.valor).toBe(170);
    expect(a!.modalidade).toBe("ficha");
    expect(a!.executantes[0]!.horarios).toHaveLength(3);
    expect(r.dados.formas_pagamento[0]!.valor).toBe(170);
    expect(r.mudancas.map((m) => m.campo)).toEqual([
      "“Exame Teste” — Modalidade",
      "“Exame Teste” — Quem realiza",
      "“Exame Teste” — Preços",
    ]);
  });

  test("recusa caminho fora da lista, troca de quem realiza e fato no texto livre", () => {
    const salvo = exameEstruturado();
    expect(() =>
      aplicarEdicaoCatalogoIA(
        "servico",
        salvo,
        proposta(op("definir", "/formas_pagamento/0/valor", 1)),
      ),
    ).toThrow("fora dos campos permitidos");
    expect(() =>
      aplicarEdicaoCatalogoIA(
        "servico",
        salvo,
        proposta(op("adicionar", "/atendimentos/0/executantes", { nome: "Outro" })),
      ),
    ).toThrow("fora dos campos permitidos");
    expect(() =>
      aplicarEdicaoCatalogoIA(
        "servico",
        salvo,
        proposta(op("definir", "/descricao_publica", "Valor R$ 99,00")),
      ),
    ).toThrow("não pôde ser aplicada");
  });
});

describe("conversão em lote", () => {
  const registro = (extra: Record<string, unknown> = {}) => ({
    id: "11111111-1111-4111-8111-111111111111",
    status: "PUBLICADO",
    updated_at: "2026-10-12T10:00:00.000000+00:00",
    rascunho: null,
    ...exameAntigo(),
    ...extra,
  });

  test("item pronto: atendimentos, cópia do formato antigo e colunas calculadas", () => {
    const { item, dados } = planejarConversao("servico", registro(), "2026-10-12T10:00:00.000Z");
    expect(item.acao).toBe("converter");
    expect(item.avisos).toEqual([]);
    expect(item.atendimentos[0]!.linhas).toContain("Modalidade: Hora marcada");
    expect(dados!.estrutura!.atendimentos).toHaveLength(1);
    const copia = restaurarFormatoAntigo("servico", dados!.estrutura!.formato_antigo!);
    expect(copia.campos.descricao_publica).toBe(exameAntigo().descricao_publica);
    expect(copia.complementos).toEqual(exameAntigo().estrutura.complementos);
  });

  test("modalidade ausente é aviso; horário ilegível, rascunho e já convertido não convertem", () => {
    const semModalidade = registro({ estrutura: { versao: 1, complementos: [] } });
    const r1 = planejarConversao("servico", semModalidade);
    expect(r1.item.acao).toBe("converter");
    expect(r1.item.avisos.some((a) => a.includes("modalidade não informada"))).toBe(true);

    const ilegivel = registro({
      executantes: [{ medico_id: null, nome: "Profissional Teste", horarios: "Seg de manhã" }],
    });
    expect(planejarConversao("servico", ilegivel).item.acao).toBe("revisar");
    expect(planejarConversao("servico", registro({ rascunho: { nome: "x" } })).item.acao).toBe(
      "revisar",
    );
    const convertido = registro({ estrutura: exameEstruturado().estrutura });
    expect(planejarConversao("servico", convertido).item.acao).toBe("convertido");
  });

  test("a cópia do formato antigo nunca chega à Nina", () => {
    const { dados } = planejarConversao("servico", registro());
    const r = servicoParaRegistro({ id: "x", ...dados } as never);
    expect((r.extras as { estrutura: Record<string, unknown> }).estrutura).not.toHaveProperty(
      "formato_antigo",
    );
    expect(JSON.stringify(r)).not.toContain("convertido_em");
  });

  test("cópia e restauração preservam os campos substituídos", () => {
    const antigo = exameAntigo();
    const copia = copiaFormatoAntigo("servico", antigo, "2026-10-12T10:00:00.000Z");
    const { campos } = restaurarFormatoAntigo("servico", copia);
    expect(campos).toEqual({
      descricao_publica: antigo.descricao_publica,
      valor: antigo.valor,
      valor_observacao: null,
      executantes: antigo.executantes,
      formas_pagamento: antigo.formas_pagamento,
    });
  });
});
