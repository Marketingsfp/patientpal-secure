import { expect, it } from "bun:test";
import {
  confirmarItemDaPergunta,
  perguntaParaCompletarIdentificacao,
  perguntaCandidatoCatalogo,
  mudouSolicitacaoExplicitamente,
  sugerirResultadoJev,
} from "../identificacao-catalogo";
import { prepararPesquisaAtendimentoDaSessao } from "../pesquisa-atendimento-sessao";
import { confirmarProfissionalDaPergunta } from "../pesquisa-medico-sessao";
import { apresentarPerguntaEsclarecimento } from "../esclarecimento-apresentacao";
import type { ConhecimentoSessao } from "../confidence/conhecimento-sessao";
import type { ResultadoConhecimento } from "../knowledge-contract";

const opcao = { id: "ecg", nome: "Eletrocardiograma" };
const anterior: ConhecimentoSessao = {
  versao: 1,
  clinicaId: "clinica",
  sessionId: "sessao",
  consulta: { termo: "eletrcardiograma", tipo_atendimento: "exame_procedimento" },
  referencias: [
    { registro: "ecg", versao: null, procedimento: "Eletrocardiograma", medicoNome: null },
  ],
  esclarecimento: {
    tipo: "procedimento",
    pergunta: perguntaCandidatoCatalogo([opcao]),
    opcoes: [opcao],
  },
  esclarecimentoTentativas: 1,
};
const contexto = (mensagem: string, a = anterior) => ({
  mensagem,
  historico: [{ role: "assistant", content: a.esclarecimento!.pergunta }],
});
it("o fechamento condicional permite confirmar, recusar e corrigir sem confundir o não da instrução", () => {
  const historico = [
    {
      role: "assistant",
      content: apresentarPerguntaEsclarecimento(anterior.esclarecimento!.pergunta, {
        tipo: "procedimento",
        tipoAtendimento: "exame_procedimento",
      }),
    },
  ];
  expect(historico[0]!.content).toContain("Se não for esse");
  expect(confirmarItemDaPergunta(anterior, { mensagem: "sim", historico })).toEqual(opcao);
  expect(confirmarItemDaPergunta(anterior, { mensagem: "não", historico })).toBeNull();
  expect(perguntaParaCompletarIdentificacao(anterior, { mensagem: "não", historico })).toContain(
    "escrever novamente",
  );
  expect(confirmarItemDaPergunta(anterior, { mensagem: "não, é hemograma", historico })).toBeNull();
});
for (const mensagem of ["isso", "sim", "isso mesmo", "é esse", "pode ser"])
  it(`confirma hipótese única entregue: ${mensagem}`, () => {
    expect(confirmarItemDaPergunta(anterior, contexto(mensagem))).toEqual(opcao);
    const args = prepararPesquisaAtendimentoDaSessao(
      "consultar_cadastro",
      JSON.stringify({ termo: "isso", nova_solicitacao: true }),
      {
        ...contexto(mensagem),
        clinicaId: "clinica",
        sessionId: "sessao",
        conhecimento: anterior,
      },
    );
    expect(JSON.parse(args!)).toEqual({
      termo: opcao.nome,
      tipo_atendimento: "exame_procedimento",
      nova_solicitacao: false,
    });
  });
for (const mensagem of ["não, é outro", "não", "não é esse", "nenhum desses"])
  it(`recusa pede novo nome: ${mensagem}`, () => {
    expect(confirmarItemDaPergunta(anterior, contexto(mensagem))).toBeNull();
    expect(perguntaParaCompletarIdentificacao(anterior, contexto(mensagem))).toContain(
      "escrever novamente",
    );
  });
it("não confunde correção escrita com recusa vazia ou mudança de assunto", () => {
  const mensagem = "não, é hemograma";
  expect(perguntaParaCompletarIdentificacao(anterior, contexto(mensagem))).toBeNull();
  expect(confirmarItemDaPergunta(anterior, contexto(mensagem))).toBeNull();
  const args = prepararPesquisaAtendimentoDaSessao(
    "consultar_cadastro",
    '{"termo":"hemograma","nova_solicitacao":true}',
    {
      ...contexto(mensagem),
      clinicaId: "clinica",
      sessionId: "sessao",
      conhecimento: anterior,
    },
  );
  expect(JSON.parse(args!).nova_solicitacao).toBe(false);
  expect(mudouSolicitacaoExplicitamente("Agora quero saber de outra consulta")).toBe(true);
  expect(mudouSolicitacaoExplicitamente(mensagem)).toBe(false);
});
it("sim para várias opções pede identificação, sem escolher a primeira", () => {
  const a = {
    ...anterior,
    esclarecimento: {
      ...anterior.esclarecimento!,
      opcoes: [opcao, { id: "outro", nome: "Hemograma" }],
    },
  };
  expect(confirmarItemDaPergunta(a, contexto("isso", a))).toBeNull();
  expect(perguntaParaCompletarIdentificacao(a, contexto("isso", a))).toContain("escrever o nome");
});
it("não usa pergunta sem entrega, antiga ou opção sem vínculo oficial", () => {
  expect(confirmarItemDaPergunta(anterior, { mensagem: "isso", historico: [] })).toBeNull();
  expect(
    confirmarItemDaPergunta(anterior, {
      mensagem: "isso",
      historico: [{ role: "assistant", content: "Qual seu nome?" }],
    }),
  ).toBeNull();
  expect(confirmarItemDaPergunta({ ...anterior, referencias: [] }, contexto("isso"))).toBeNull();
});
it("confirma médico após formatação real da bolha", () => {
  const a: ConhecimentoSessao = {
    ...anterior,
    esclarecimento: {
      tipo: "profissional",
      pergunta: "Você se refere a este profissional?\nSandro — CARDIOLOGIA",
      opcoes: [{ id: "ecg", nome: "Sandro" }],
    },
  };
  expect(
    confirmarProfissionalDaPergunta(a, {
      mensagem: "isso",
      historico: [
        {
          role: "assistant",
          content: apresentarPerguntaEsclarecimento(a.esclarecimento!.pergunta, {
            tipo: "profissional",
          }),
        },
      ],
    })?.nome,
  ).toBe("Sandro");
});
it("Jev sugere item publicado e remove preço até confirmação", () => {
  const r = {
    found: true,
    knowledge_status: "found",
    tipo_atendimento: "exame_procedimento",
    procedure: "ECG",
    price: "80",
    records: [{ id: "ecg", procedimento: opcao.nome }],
  } as ResultadoConhecimento;
  const sugerido = sugerirResultadoJev(r);
  expect(sugerido.price).toBeNull();
  expect(sugerido.esclarecimento?.opcoes).toEqual([opcao]);
  expect(sugerido.esclarecimento?.pergunta).toContain("Você quis dizer");
  expect(r.price).toBe("80");
});
