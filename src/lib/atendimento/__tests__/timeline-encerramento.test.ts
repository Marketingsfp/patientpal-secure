import { describe, expect, test } from "bun:test";
import { posicionarEncerramentoAposConclusao } from "../timeline-encerramento";
import type { RegistroOrdemHandoff } from "../timeline-handoff";

type Item = RegistroOrdemHandoff & { id: string };
const evento = (id: string, tipo: string, em: number): Item => ({ id, em,
  evento: { id, evento: tipo, created_at: new Date(em).toISOString(), motivo: null, detalhes: null } });
const mensagem = (id: string, em: number, body = "Prontinho! Seu agendamento foi realizado com sucesso."): Item => ({
  id, em, mensagem: { id, direction: "out", enviada_por: "nina", status: "sent", body },
});
const ids = (itens: Item[]) => posicionarEncerramentoAposConclusao(itens, i => i).map(i => i.id);

describe("encerramento depois da conclusão do agendamento", () => {
  for (const texto of ["Prontinho! Seu agendamento foi realizado com sucesso.",
    "Seu pré-agendamento foi realizado!", "Seu agendamento foi realizado!\nSua ficha: 007"]) {
    test(`homologação: ${texto}`, () => {
      const itens = [evento("fechou", "ATENDIMENTO_ENCERRADO", 1), mensagem("concluiu", 2, texto), evento("resolveu", "FINALIZADA", 3)];
      const antes = JSON.stringify(itens);
      expect(ids(itens)).toEqual(["concluiu", "fechou", "resolveu"]);
      expect(JSON.stringify(itens)).toBe(antes);
    });
  }
  test("chat real com evento agrupado usa a mesma ordem", () => {
    const ev = evento("fechou", "ATENDIMENTO_ENCERRADO", 1).evento!;
    const itens: Item[] = [{ id: "fechou", em: 1, grupo: {
      tipo: "EVENTO", chave: "fechou", criadoEm: ev.created_at, repetidos: [], evento: { ...ev, detalhes: null },
    } }, mensagem("concluiu", 2)];
    expect(ids(itens)).toEqual(["concluiu", "fechou"]);
  });
  test("conclusão já anterior e fechamento humano permanecem no lugar", () => {
    expect(ids([mensagem("concluiu", 1), evento("fechou", "ATENDIMENTO_ENCERRADO", 2), evento("humano", "FINALIZADA", 3)]))
      .toEqual(["concluiu", "fechou", "humano"]);
    expect(ids([evento("humano", "FINALIZADA", 1), mensagem("concluiu", 2)]))
      .toEqual(["humano", "concluiu"]);
  });
  test("não adivinha conclusão ausente na página nem move para pergunta ou falha", () => {
    for (const texto of ["Você confirma o agendamento?", "Não consegui agendar.", "Não foi possível concluir o agendamento."])
      expect(ids([evento("fechou", "ATENDIMENTO_ENCERRADO", 1), mensagem("outra", 2, texto)]))
        .toEqual(["fechou", "outra"]);
    const falhou = mensagem("falhou", 2);
    falhou.mensagem!.status = "failed";
    expect(ids([evento("fechou", "ATENDIMENTO_ENCERRADO", 1), falhou])).toEqual(["fechou", "falhou"]);
  });
  test("não atravessa ciclo, handoff, mensagem do paciente ou janela de tempo", () => {
    for (const tipo of ["REABERTA", "IA_MEMORIA_RESETADA", "FINALIZADA", "HANDOFF_SOLICITADO"])
      expect(ids([evento("fechou", "ATENDIMENTO_ENCERRADO", 1), evento("limite", tipo, 2), mensagem("concluiu", 3)]))
        .toEqual(["fechou", "limite", "concluiu"]);
    const paciente = mensagem("paciente", 2);
    paciente.mensagem!.direction = "in";
    expect(ids([evento("fechou", "ATENDIMENTO_ENCERRADO", 1), paciente, mensagem("concluiu", 3)]))
      .toEqual(["fechou", "paciente", "concluiu"]);
    expect(ids([evento("fechou", "ATENDIMENTO_ENCERRADO", 1), mensagem("concluiu", 6 * 60_000)]))
      .toEqual(["fechou", "concluiu"]);
  });
});
