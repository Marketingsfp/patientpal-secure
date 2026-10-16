import { expect, it } from "bun:test";
import { ehAvisoDeTransferencia } from "../previa-conversa";

it("o aviso de transferência ao paciente não entra na prévia do card", () => {
  const aviso =
    "Olá, Paciente.\n\nVou encaminhar seu atendimento para a nossa equipe de Recepção e a conversa continuará por aqui.\n\nProtocolo do atendimento: MJ-000";
  expect(ehAvisoDeTransferencia({ direction: "out", body: aviso })).toBe(true);
  expect(
    ehAvisoDeTransferencia({
      direction: "out",
      body: `${aviso}\n\nNesta simulação, nenhuma transferência para uma atendente real foi realizada.`,
    }),
  ).toBe(true);
});

it("mensagens do paciente, da Nina e da equipe continuam na prévia", () => {
  expect(ehAvisoDeTransferencia({ direction: "in", body: "Quero falar com uma atendente" })).toBe(
    false,
  );
  expect(
    ehAvisoDeTransferencia({
      direction: "in",
      body: "Protocolo do atendimento: MJ-000, ainda não me responderam",
    }),
  ).toBe(false);
  expect(ehAvisoDeTransferencia({ direction: "out", body: "Bom dia! Como posso ajudar?" })).toBe(
    false,
  );
  expect(ehAvisoDeTransferencia({ direction: "out", body: null })).toBe(false);
});
