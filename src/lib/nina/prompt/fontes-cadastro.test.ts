import { expect, test } from "bun:test";
import { FONTES_CADASTRO_NINA, revisarFontesPromptMaster } from "./fontes-cadastro";
import { PROMPT_NINA_WHATSAPP_V4 } from "./behavior-v4";

test("revisão preserva identidade e encaminhamento do prompt vigente e é idempotente", () => {
  const antes =
    "[IDENTIDADE DO ATENDIMENTO]\nNina\n[/IDENTIDADE DO ATENDIMENTO]\n\nINSTRUÇÃO FAT-02 — PRECISÃO, PAGAMENTO E CRITÉRIOS\nValores vigentes\n\nINSTRUÇÃO HUM-04 — MARCAÇÃO\nEncaminhe à recepção; não consulte vagas.";
  const depois = revisarFontesPromptMaster(antes);
  expect(depois.replace(`${FONTES_CADASTRO_NINA}\n\n`, "")).toBe(antes);
  expect(revisarFontesPromptMaster(depois)).toBe(depois);
  expect(() => revisarFontesPromptMaster("Texto sem marcador")).toThrow();
});

test("fallback também só informa e encaminha a marcação sem coletar cadastro", () => {
  const p = PROMPT_NINA_WHATSAPP_V4;
  expect(p).toContain("PACIENTE_QUER_MARCAR");
  expect(p).toContain("Não consulte vagas, não peça dados cadastrais e não prometa horário");
  expect(p).not.toContain("execute o agendamento autorizado");
  expect(p).not.toContain("consulte a comparação de agendas");
});
