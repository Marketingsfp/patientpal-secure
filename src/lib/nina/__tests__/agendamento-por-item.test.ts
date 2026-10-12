import { describe, expect, it } from "bun:test";
import { lerEstrutura } from "../catalogo-estrutura";
import { profissionalParaRegistro, servicoParaRegistro } from "../catalogo-conhecimento";
import { permissaoAgendamentoNoCatalogo, registrosPermitemAgendar } from "../regras-catalogo";
import { prepararSincronizacao, type RegistroSincronizacao } from "../catalogo-sincronizacao";
import { REGRA_AGENDAMENTO_POR_ITEM } from "../transicao-agendamento";

const ECG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DRA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MEDICO_DRA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const catalogo = {
  servicos: [
    {
      id: ECG,
      nome: "Eletrocardiograma",
      estrutura: {
        nina_pode_agendar: true,
        complementos: [{ chave: "ecg", modalidade: "hora_marcada" }],
      },
    },
    { id: USG, nome: "Ultrassom de abdome", estrutura: {} },
  ],
  profissionais: [
    {
      id: DRA,
      nome: "Dra. Teste Cardiologia",
      medico_id: MEDICO_DRA,
      estrutura: { nina_pode_agendar: false },
    },
  ],
};

describe("opção 'Nina pode agendar' no cadastro", () => {
  it("vem desligada por padrão e só true libera", () => {
    expect(lerEstrutura({}).nina_pode_agendar).toBeUndefined();
    expect(lerEstrutura({ nina_pode_agendar: true }).nina_pode_agendar).toBe(true);
    expect(registrosPermitemAgendar([{ estrutura: {} }])).toBe(false);
    expect(registrosPermitemAgendar([{ estrutura: { nina_pode_agendar: null } }])).toBe(false);
    expect(registrosPermitemAgendar([{ estrutura: { nina_pode_agendar: true } }])).toBe(true);
  });

  it("sem registro identificado ou com algum item desmarcado, não agenda", () => {
    expect(registrosPermitemAgendar([])).toBe(false);
    expect(
      registrosPermitemAgendar([
        { estrutura: { nina_pode_agendar: true } },
        { estrutura: { nina_pode_agendar: false } },
      ]),
    ).toBe(false);
  });

  it("a Nina recebe o campo no registro do serviço e do profissional", () => {
    const servico = servicoParaRegistro({
      id: ECG,
      nome: "Eletrocardiograma",
      estrutura: { nina_pode_agendar: true },
      executantes: [],
    } as never);
    const semMarcacao = servicoParaRegistro({
      id: USG,
      nome: "Ultrassom de abdome",
      executantes: [],
    } as never);
    const profissional = profissionalParaRegistro(
      { id: DRA, nome: "Dra. Teste Cardiologia", convenios: [], estrutura: {} } as never,
      "2026-10-12",
    );
    expect(servico.extras?.nina_pode_agendar).toBe(true);
    expect(semMarcacao.extras?.nina_pode_agendar).toBe(false);
    expect(profissional.extras?.nina_pode_agendar).toBe(false);
  });
});

describe("decisão pelo catálogo do turno", () => {
  it("item identificado na conversa decide primeiro", () => {
    expect(permissaoAgendamentoNoCatalogo(catalogo, { referencias: [ECG] })).toEqual({
      permitido: true,
      nomes: ["Eletrocardiograma"],
    });
    expect(permissaoAgendamentoNoCatalogo(catalogo, { referencias: [USG] })?.permitido).toBe(false);
  });

  it("exame pelo nome exato e consulta pelo profissional", () => {
    expect(
      permissaoAgendamentoNoCatalogo(catalogo, { procedimento: "eletrocardiograma" })?.permitido,
    ).toBe(true);
    expect(permissaoAgendamentoNoCatalogo(catalogo, { medico: MEDICO_DRA })?.permitido).toBe(false);
    expect(
      permissaoAgendamentoNoCatalogo(catalogo, { medico: "dra. teste cardiologia" })?.permitido,
    ).toBe(false);
  });

  it("marcado mas sem modalidade agendável não agenda", () => {
    const semModalidade = {
      servicos: [{ id: USG, nome: "Ultrassom de abdome", estrutura: { nina_pode_agendar: true } }],
      profissionais: [],
    };
    expect(permissaoAgendamentoNoCatalogo(semModalidade, { referencias: [USG] })?.permitido).toBe(
      false,
    );
  });

  it("nada encontrado devolve null para o servidor tentar o vínculo do médico", () => {
    expect(permissaoAgendamentoNoCatalogo(catalogo, { procedimento: "Raio X" })).toBeNull();
    expect(permissaoAgendamentoNoCatalogo(catalogo, {})).toBeNull();
  });
});

describe("sincronização preserva a decisão da equipe", () => {
  const atual = (estrutura: Record<string, unknown>): RegistroSincronizacao => ({
    id: USG,
    nome: "Ultrassom de abdome",
    status: "PUBLICADO",
    procedimento_id: null,
    valor: 200,
    estrutura: { versao: 1, aliases: [], complementos: [], ...estrutura },
  });
  const fonte = (): RegistroSincronizacao => ({
    id: ECG,
    procedimento_id: ECG,
    nome: "Ultrassom de abdome",
    valor: 120,
    preparo: null,
    descricao_publica: null,
    restricoes: null,
    valor_observacao: null,
    formas_pagamento: [{ forma: "Dinheiro", valor: 120, condicao: null, observacao: null }],
    executantes: [],
    estrutura: { versao: 1, aliases: [], complementos: [] },
  });

  it("mantém a opção marcada e não a liga em item novo", () => {
    expect(
      prepararSincronizacao("servico", atual({ nina_pode_agendar: true }), fonte()).dados.estrutura
        ?.nina_pode_agendar,
    ).toBe(true);
    expect(
      prepararSincronizacao("servico", atual({}), fonte()).dados.estrutura?.nina_pode_agendar,
    ).toBeNull();
  });
});

describe("instrução da IA", () => {
  it("agenda só itens marcados e encaminha o restante", () => {
    expect(REGRA_AGENDAMENTO_POR_ITEM).toContain("nina_pode_agendar = true");
    expect(REGRA_AGENDAMENTO_POR_ITEM).toContain("AGENDAMENTO_TRANSICAO");
    expect(REGRA_AGENDAMENTO_POR_ITEM).toContain("chegada_sem_pre_agendamento");
    expect(REGRA_AGENDAMENTO_POR_ITEM).toContain("AGENDAMENTO_NAO_PERMITIDO");
  });
});
