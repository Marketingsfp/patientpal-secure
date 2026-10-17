import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { rotuloRemetente } from "../remetente-mensagem";

test("mensagem pronta do código aparece como Sistema", () => {
  expect(rotuloRemetente({ direction: "out", enviada_por: "sistema" })).toBe("Sistema");
  expect(rotuloRemetente({ direction: "out", enviada_por: "nina" })).toBe("Nina");
  expect(rotuloRemetente({ direction: "out", enviada_por: "humano" })).toBeNull();
  expect(rotuloRemetente({ direction: "in", enviada_por: "paciente" })).toBeNull();
});

test("Francisco grava 'sistema', mas mantém o próprio nome", () => {
  expect(rotuloRemetente({ direction: "out", enviada_por: "sistema", agente: "francisco" })).toBe(
    "Francisco",
  );
  expect(
    rotuloRemetente({ direction: "out", enviada_por: "sistema", raw: { agente: "francisco" } }),
  ).toBe("Francisco");
});

test("as cargas de mensagens trazem a marca do agente sem o raw inteiro", () => {
  for (const arquivo of [
    "src/lib/atendimento/historico-paginado.server.ts",
    "src/lib/atendimento.functions.ts",
  ])
    expect(readFileSync(arquivo, "utf8")).toContain("agente:raw->>agente");
});
