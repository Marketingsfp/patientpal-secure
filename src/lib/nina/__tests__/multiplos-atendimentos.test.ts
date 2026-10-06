import { expect, test } from "bun:test";
import { itensDoPedidoLido, motivoMultiplos, multiplosPeloJev, perguntaMultiplosAtendimentos } from "../multiplos-atendimentos";
import { textoDoPedidoLido } from "../leitura-imagem";

test("lê a lista do pedido médico no mesmo formato gerado pela leitura da foto", () => {
  expect(itensDoPedidoLido(textoDoPedidoLido(["HEMOGRAMA COMPLETO", "TSH", "GLICOSE"]))).toEqual(["HEMOGRAMA COMPLETO", "TSH", "GLICOSE"]);
  expect(itensDoPedidoLido(textoDoPedidoLido(["TSH"], "é pra amanhã"))).toEqual(["TSH"]);
  // Texto escrito pelo paciente não é tratado como foto.
  expect(itensDoPedidoLido("quero hemograma e TSH")).toEqual([]);
});

test("Jev só decide com confiança de 80% ou mais", () => {
  expect(multiplosPeloJev({ choice: "varios", confidence: 0.8 })).toBe(true);
  expect(multiplosPeloJev({ choice: "varios", confidence: 0.79 })).toBe(false);
  expect(multiplosPeloJev({ choice: "um", confidence: 1 })).toBe(false);
  expect(multiplosPeloJev(undefined)).toBe(false);
});

test("motivo identifica a regra e, na foto, os exames lidos", () => {
  expect(motivoMultiplos([])).toStartWith("MULTIPLOS_ATENDIMENTOS:");
  expect(motivoMultiplos(["TSH", "T4 LIVRE"])).toContain("2 exames (TSH; T4 LIVRE)");
});

test("a pergunta ao Jev cobre pacote, sessões e exames do mesmo tipo", () => {
  const p = perguntaMultiplosAtendimentos().multiplos_atendimentos!;
  expect(p.type).toBe("choice");
  expect(p.instructions).toContain("consulta com preventivo");
  expect(p.instructions).toContain("10 sessões de fisioterapia");
  expect(p.instructions).toContain("ultrassom de abdome e de tireoide");
});
