import { expect, test } from "bun:test";
import { confirmarIdentificacoes } from "../confirmacao-identificacao";
import {
  criarPerguntasDoTurno,
  perguntas,
  comporRespostaParcial,
} from "../perguntas-independentes";
import {
  conhecimentoDaMesmaSessao,
  type ConhecimentoSessao,
} from "../confidence/conhecimento-sessao";
import { ehConfirmacaoDeAgendamento } from "../confirmacao-agendamento";

const item = (id: string, termo: string, nome: string): ConhecimentoSessao => ({
  versao: 1,
  clinicaId: "c",
  sessionId: "s",
  consulta: { termo, tipo_atendimento: "exame_procedimento" },
  referencias: [{ registro: id, procedimento: nome, medicoNome: null, versao: "1" }],
  esclarecimento: {
    tipo: "procedimento",
    pergunta: `Você quis dizer ${nome}? Pode confirmar ou escrever o nome novamente.`,
    opcoes: [{ id, nome }],
  },
  esclarecimentoTentativas: 1,
});
const itens = [
  item("rx", "RX do torax PA e perfil", "RX TORAX AP/PERFIL"),
  item("rm", "RM joelho esquerdo", "RM DE JOELHO (CADA LADO)"),
];
const anterior = (): ConhecimentoSessao => ({
  ...itens[0]!,
  pendenciasIdentificacao: structuredClone(itens),
  esclarecimento: { tipo: "procedimento", pergunta: perguntas(itens), opcoes: [] },
});
const contexto = (mensagem: string) => ({
  mensagem,
  historico: [{ role: "assistant", content: perguntas(itens) }],
});
const mensagemReal = "isso os 2. precisa de jejum pra ressonancia? tenho pino na perna";

test.each([mensagemReal, "isso os dois", "sim, ambos", "todos", "os dois e precisa de jejum?"])(
  "confirma cada referência apresentada: %s",
  (mensagem) => {
    expect(confirmarIdentificacoes(anterior(), contexto(mensagem)).map((c) => c.opcao.id)).toEqual([
      "rx",
      "rm",
    ]);
    expect(ehConfirmacaoDeAgendamento(mensagem)).toBe(false);
  },
);
test.each([
  "sim",
  "isso",
  "os dois?",
  "os dois se não precisar de jejum",
  "não, os dois não",
  "isso os dois. na verdade é outro",
  "isso os dois. precisa de jejum? não é esse exame",
  "isso os dois mas só se tiver desconto",
])("não presume aceite: %s", (mensagem) => {
  expect(confirmarIdentificacoes(anterior(), contexto(mensagem))).toEqual([]);
});
test("uma hipótese única aceita confirmação com pergunta adicional", () => {
  expect(
    confirmarIdentificacoes(itens[1]!, {
      mensagem: "isso. precisa de jejum?",
      historico: [{ role: "assistant", content: perguntas([itens[1]!]) }],
    })[0]?.opcao.id,
  ).toBe("rm");
});
test.each(["só o segundo", "confirmo RM DE JOELHO (CADA LADO)"])(
  "confirma apenas o item indicado: %s",
  (mensagem) => {
    expect(confirmarIdentificacoes(anterior(), contexto(mensagem)).map((c) => c.opcao.id)).toEqual([
      "rm",
    ]);
  },
);
test("ordinais seguem a ordem entregue e não confirmam perguntas ocultas", () => {
  const ctx = {
    mensagem: "só o primeiro",
    historico: [{ role: "assistant", content: perguntas([...itens].reverse()) }],
  };
  expect(confirmarIdentificacoes(anterior(), ctx).map((c) => c.opcao.id)).toEqual(["rm"]);
  expect(
    confirmarIdentificacoes(anterior(), {
      ...ctx,
      historico: [{ role: "assistant", content: perguntas([itens[0]!]) }],
    }),
  ).toEqual([]);
});
test("alternativas, outra sessão e referências sem prova não viram confirmação conjunta", () => {
  const ambigua = anterior();
  ambigua.pendenciasIdentificacao![1]!.esclarecimento!.opcoes.push({ id: "outro", nome: "Outro" });
  expect(confirmarIdentificacoes(ambigua, contexto("ambos"))).toEqual([]);
  const isolada = anterior();
  isolada.pendenciasIdentificacao![1]!.sessionId = "outra";
  expect(confirmarIdentificacoes(isolada, contexto("ambos"))).toEqual([]);
  expect(
    confirmarIdentificacoes(conhecimentoDaMesmaSessao(anterior(), "outra", "s"), contexto("ambos")),
  ).toEqual([]);
  expect(confirmarIdentificacoes(null, contexto("ambos"))).toEqual([]);
  const semProva = anterior();
  semProva.pendenciasIdentificacao![1]!.referencias = [];
  expect(confirmarIdentificacoes(semProva, contexto("ambos"))).toEqual([]);
});
test("sessão retomada reconsulta dois IDs e não reapresenta pendências antigas", () => {
  const estado = conhecimentoDaMesmaSessao(JSON.parse(JSON.stringify(anterior())), "c", "s")!;
  const aceites = confirmarIdentificacoes(estado, contexto(mensagemReal));
  const turno = criarPerguntasDoTurno(estado, mensagemReal, aceites);
  expect(turno.pendentes).toHaveLength(2);
  for (const c of aceites) {
    const args = { termo: c.opcao.nome, tipo_atendimento: "exame_procedimento" };
    const origem = turno.referencia(args);
    expect(origem).toBe(c.anterior);
    const atual = {
      ...c.anterior,
      consulta: args as ConhecimentoSessao["consulta"],
      esclarecimento: undefined,
    };
    turno.registrar(args, atual, origem, true);
    turno.registrar(args, atual, origem, true); // reconsulta repetida não reabre o pedido
  }
  expect(turno.pendentes).toHaveLength(0);
  expect(turno.estado(null)).toBeNull();
  expect(
    comporRespostaParcial(
      "Valores dos dois exames. A equipe deve verificar o preparo.",
      turno.pendentes,
    ),
  ).not.toContain("Você se refere");
});
test("falha de releitura mantém a pendência e confirmação parcial mantém o outro exame", () => {
  const estado = anterior(),
    aceites = confirmarIdentificacoes(estado, contexto("só o segundo"));
  const turno = criarPerguntasDoTurno(estado, "só o segundo", aceites),
    c = aceites[0]!;
  const args = { termo: c.opcao.nome };
  turno.registrar(args, null, turno.referencia(args), false);
  expect(turno.pendentes).toHaveLength(2);
  turno.registrar(args, { ...c.anterior, esclarecimento: undefined }, turno.referencia(args), true);
  expect(turno.pendentes.map((p) => p.consulta.termo)).toEqual([itens[0]!.consulta.termo]);
  expect(comporRespostaParcial("Valor da RM confirmado.", turno.pendentes)).not.toContain(
    "Você se refere a RM",
  );
});
test("outro registro na releitura não substitui o ID escolhido", () => {
  const estado = anterior(),
    aceites = confirmarIdentificacoes(estado, contexto("ambos"));
  const turno = criarPerguntasDoTurno(estado, "ambos", aceites);
  const r = turno.reconciliar(
    { termo: aceites[0]!.opcao.nome },
    {
      ferramenta: "consultar_cadastro",
      capacidade: "searchKnowledgeBase",
      fonte: "base_conhecimento",
      success: true,
      reused: false,
      appointment_confirmed: false,
      dados: {
        found: true,
        knowledge_status: "found",
        records: [{ id: "outro", procedimento: "Outro exame" }],
      },
    },
  );
  expect((r.dados as any).records).toEqual([]);
  expect((r.dados as any).esclarecimento).toEqual(aceites[0]!.anterior.esclarecimento);
});
