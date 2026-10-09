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

test("pontos de siglas e legenda não interrompem nem ampliam a lista da foto", () => {
  const itens = ["Doppler de Carótidas e Vértebrais", "Doppler Arterial de Membros", "Doppler Venoso de Membros",
    "Eletrocardiograma", "Ecocardiograma Collor Doppler", "I.T.B", "HOLTER 24h", "M.A.P.A. 24h",
    "Eletroencefalograma", "Mapeamento Cerebral", "Ressonância Magnética", "Radiografia",
    "Teste Ergométrico", "Tomografia Computadorizada", "Ultrassonografia"];
  expect(itensDoPedidoLido(textoDoPedidoLido(itens))).toEqual(itens);
  expect(motivoMultiplos(itensDoPedidoLido(textoDoPedidoLido(itens)))).toContain("15 exames");
  expect(itensDoPedidoLido(textoDoPedidoLido(["M.A.P.A. 24h"], "Dr. Silva pediu. Quero o preço de TSH também."))).toEqual(["M.A.P.A. 24h"]);
  expect(itensDoPedidoLido(textoDoPedidoLido(["I.T.B."]))).toEqual(["I.T.B."]);
  expect(itensDoPedidoLido("Enviei a foto de um pedido médico com: ECG. Bom dia. Quero saber o preço."))
    .toEqual(["ECG"]);
  expect(itensDoPedidoLido("Enviei a foto de um pedido médico com: M.A.P.A. 24h; ECG. Dr. Silva pediu."))
    .toEqual(["M.A.P.A. 24h", "ECG"]);
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
