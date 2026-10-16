import { expect, test } from "bun:test";
import {
  citacoesFaltantes,
  exibirCitacao,
  textoDaCitacao,
  waIdCitavel,
  type MensagemCitada,
} from "../citacao-mensagem";

const paciente: MensagemCitada = {
  wa_message_id: "wamid.A",
  direction: "in",
  enviada_por: "paciente",
  tipo: "text",
  body: "Quanto custa a ultrassom?",
};

test("só cita mensagem que chegou ao WhatsApp", () => {
  expect(waIdCitavel({ id: "1", wa_message_id: "wamid.A" })).toBe("wamid.A");
  expect(waIdCitavel({ id: "optimistic:x", wa_message_id: "wamid.A" })).toBeNull();
  expect(waIdCitavel({ id: "2", wa_message_id: null })).toBeNull();
  expect(waIdCitavel({ id: "3", wa_message_id: "wamid.B", status: "system" })).toBeNull();
});

test("mostra autor e texto da citada, achando pela lista carregada", () => {
  const porWaId = new Map([["wamid.A", paciente]]);
  expect(exibirCitacao({ quoted_message_id: "wamid.A" }, porWaId)).toEqual({
    autor: "Paciente",
    texto: "Quanto custa a ultrassom?",
    encontrada: true,
  });
  expect(exibirCitacao({}, porWaId)).toBeNull();
});

test("citação antiga que não existe mais avisa em vez de sumir", () => {
  expect(exibirCitacao({ quoted_message_id: "wamid.Z" }, new Map())?.encontrada).toBe(false);
});

test("equipe e Nina têm autor próprio; assinatura e texto longo são resumidos", () => {
  const equipe = { ...paciente, direction: "out", enviada_por: "humano", body: "*Ana:*\nOlá" };
  expect(exibirCitacao({ quoted_message_id: "x", citacao: equipe }, new Map())?.autor).toBe(
    "Equipe",
  );
  expect(
    exibirCitacao(
      { quoted_message_id: "x", citacao: { ...equipe, enviada_por: "nina" } },
      new Map(),
    )?.autor,
  ).toBe("Nina");
  expect(textoDaCitacao(equipe)).toBe("Ana: Olá");
  expect(textoDaCitacao({ tipo: "text", body: "a".repeat(400) }).length).toBe(160);
  expect(textoDaCitacao({ tipo: "audio", body: "" })).toBe("🎤 Áudio");
});

test("lista só as citadas que faltam carregar, sem repetir", () => {
  expect(
    citacoesFaltantes([
      { wa_message_id: "wamid.A", quoted_message_id: null },
      { wa_message_id: "wamid.B", quoted_message_id: "wamid.A" },
      { wa_message_id: "wamid.C", quoted_message_id: "wamid.Z" },
      { wa_message_id: "wamid.D", quoted_message_id: "wamid.Z" },
    ]),
  ).toEqual(["wamid.Z"]);
});
