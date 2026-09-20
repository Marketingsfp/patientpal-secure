import { describe, expect, it } from "bun:test";
import { anteciparReabertura, type RegistroReabertura } from "../timeline-reabertura";

type Item = RegistroReabertura & { chave: string };
const msg = (id: string, em: number, direction = "in", sistema = false): Item => ({
  chave: id,
  em,
  mensagem: { id, direction, sistema },
});
const evento = (id: string, tipo: string, em: number, detalhes?: unknown): Item => ({
  chave: id,
  em,
  evento: { id, evento: tipo, detalhes },
});
const reaberta = (em = 1001, origem?: string) =>
  evento("reaberta", "REABERTA", em, origem ? { mensagem_origem_id: origem } : undefined);
const nina = (em = 1002, origem?: string): Item => {
  const registro = evento(
    "nina",
    "ATRIBUIDA_IA",
    em,
    origem ? { mensagem_origem_id: origem, reabertura_evento_id: "reaberta" } : undefined,
  );
  return {
    ...registro,
    evento: { ...registro.evento!, motivo: "Reabertura: novo atendimento volta para a Nina" },
  };
};
const ordenar = (itens: Item[]) => anteciparReabertura(itens, (i) => i);
const chaves = (itens: Item[]) => ordenar(itens).map((i) => i.chave);

describe("ordem dos avisos de reabertura", () => {
  it("coloca os dois avisos antes da entrada e depois do encerramento anterior", () => {
    const itens = [
      evento("fechou", "FINALIZADA", 0),
      msg("paciente", 1000),
      reaberta(),
      nina(),
      evento("handoff", "HANDOFF_SOLICITADO", 1003),
    ];
    const original = structuredClone(itens);
    expect(chaves(itens)).toEqual(["fechou", "reaberta", "nina", "paciente", "handoff"]);
    expect(itens).toEqual(original);
    expect(ordenar(itens).find((i) => i.chave === "nina")?.em).toBe(1002);
  });

  it("usa a mensagem vinculada mesmo quando o processamento demorou e houve novas entradas", () => {
    const itens = [
      msg("primeira", 1),
      msg("segunda", 2),
      reaberta(200000, "primeira"),
      nina(200001, "primeira"),
      msg("resposta", 200002, "out"),
    ];
    expect(chaves(itens)).toEqual(["reaberta", "nina", "primeira", "segunda", "resposta"]);
    expect(chaves(ordenar(itens))).toEqual(chaves(itens));
  });

  it("legado antecipa avisos antes da primeira mensagem de uma sequência, sem inverter mensagens", () => {
    expect(
      chaves([
        evento("fechou", "FINALIZADA", 0),
        msg("primeira", 900),
        msg("segunda", 1000),
        reaberta(),
        nina(),
      ]),
    ).toEqual(["fechou", "reaberta", "nina", "primeira", "segunda"]);
  });

  it("aguarda a mensagem causal carregar sem vincular a uma mensagem diferente", () => {
    const parcial = [msg("outra", 1000), reaberta(1001, "alvo"), nina(1002, "alvo")];
    expect(chaves(parcial)).toEqual(["outra", "reaberta", "nina"]);
    expect(chaves([msg("alvo", 900), ...parcial])).toEqual(["reaberta", "nina", "alvo", "outra"]);
  });

  it("reconcilia avisos que chegam separadamente pelo tempo real", () => {
    expect(chaves([msg("alvo", 1000), reaberta(1001, "alvo")])).toEqual(["reaberta", "alvo"]);
    expect(chaves([msg("alvo", 1000), reaberta(1001, "alvo"), nina(1002, "alvo")])).toEqual([
      "reaberta",
      "nina",
      "alvo",
    ]);
  });

  it("empate de timestamp não inverte reabertura e atribuição", () => {
    expect(chaves([nina(1000, "alvo"), reaberta(1000, "alvo"), msg("alvo", 1000)])).toEqual([
      "reaberta",
      "nina",
      "alvo",
    ]);
  });

  it("não move uma atribuição manual à Nina ou uma atribuição humana", () => {
    for (const tipo of ["DEVOLVIDA_PARA_IA", "ATRIBUIDA_IA", "ASSUMIDA"]) {
      expect(chaves([msg("alvo", 1000), reaberta(), evento("manual", tipo, 1002)])).toEqual([
        "reaberta",
        "alvo",
        "manual",
      ]);
    }
  });

  it("não atravessa encerramento, reinício ou outra reabertura", () => {
    for (const tipo of ["FINALIZADA", "IA_MEMORIA_RESETADA", "ATENDIMENTO_ENCERRADO", "REABERTA"]) {
      const itens = [msg("antiga", 1000), evento("barreira", tipo, 1001), reaberta(1002, "antiga")];
      const resultado = ordenar(itens);
      expect(resultado.indexOf(itens[2])).toBeGreaterThan(resultado.indexOf(itens[0]));
    }
  });

  it("não usa mensagens da Nina, atendente ou sistema como origem", () => {
    for (const m of [msg("alvo", 1000, "out"), msg("alvo", 1000, "in", true)]) {
      expect(chaves([m, reaberta(1001, "alvo"), nina(1002, "alvo")])).toEqual([
        "alvo",
        "reaberta",
        "nina",
      ]);
    }
  });

  it("legado sem entrada próxima preserva cronologia", () => {
    expect(chaves([msg("antiga", 0), reaberta(200000), nina(200001)])).toEqual([
      "antiga",
      "reaberta",
      "nina",
    ]);
    expect(chaves([reaberta(), nina()])).toEqual(["reaberta", "nina"]);
  });

  it("preserva a associação em dois atendimentos reabertos da mesma conversa", () => {
    const r2 = evento("reaberta2", "REABERTA", 3001, { mensagem_origem_id: "nova" });
    const a2 = evento("nina2", "ATRIBUIDA_IA", 3002, {
      mensagem_origem_id: "nova",
      reabertura_evento_id: "reaberta2",
    });
    expect(
      chaves([
        msg("alvo", 1000),
        reaberta(1001, "alvo"),
        nina(1002, "alvo"),
        evento("fechou", "FINALIZADA", 2000),
        msg("nova", 3000),
        r2,
        a2,
      ]),
    ).toEqual(["reaberta", "nina", "alvo", "fechou", "reaberta2", "nina2", "nova"]);
  });
});
