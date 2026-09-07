import { describe, expect, test } from "bun:test";
import {
  criteriosDeHandoff,
  ehMensagemDeTransferencia,
  protocoloFormatoValido,
  setorMencionadoCorretamente,
  verificarHandoff,
  type FatosHandoff,
} from "../handoff-assertions";

const MSG_OK =
  "Claro, Felipe! 😊 Vou encaminhar seu atendimento para nossa equipe continuar por aqui.\n\nProtocolo do atendimento: MJ-14712";

function fatos(over: Partial<FatosHandoff> = {}): FatosHandoff {
  return {
    transferida: true,
    protocolo: "MJ-14712",
    protocolosDistintos: 1,
    mensagensSaida: ["Oi! Como posso ajudar?", MSG_OK],
    cicloStatus: "encerrado",
    cicloEndReason: "handoff_humano",
    memoryResetAt: "2026-09-07T14:00:00Z",
    ...over,
  };
}

describe("assertions determinísticas de handoff", () => {
  test("handoff correto aprova todas as verificações", () => {
    const v = verificarHandoff(fatos());
    expect(Object.values(v).every(Boolean)).toBe(true);
    expect(criteriosDeHandoff(v).every((c) => c.ok)).toBe(true);
  });

  test("protocolo ausente é detectado", () => {
    const v = verificarHandoff(fatos({ protocolo: null }));
    expect(v.protocol_created).toBe(false);
    expect(v.protocol_format_valid).toBe(false);
    expect(v.protocol_in_message).toBe(false);
    expect(v.handoff_occurred).toBe(true);
  });

  test("protocolo duplicado é detectado", () => {
    const v = verificarHandoff(fatos({ protocolosDistintos: 2 }));
    expect(v.protocol_unique).toBe(false);
  });

  test("protocolo fora do formato oficial é reprovado", () => {
    expect(protocoloFormatoValido("MJ-14712")).toBe(true);
    expect(protocoloFormatoValido("14712")).toBe(false);
    expect(protocoloFormatoValido("mj_14712")).toBe(false);
    const v = verificarHandoff(fatos({ protocolo: "14712" }));
    expect(v.protocol_format_valid).toBe(false);
  });

  test("mensagem sem o número do protocolo é detectada", () => {
    const v = verificarHandoff(
      fatos({
        mensagensSaida: ["Vou encaminhar para nossa equipe. Seu protocolo será informado."],
      }),
    );
    expect(v.transfer_message_created).toBe(true);
    expect(v.protocol_in_message).toBe(false);
  });

  test("ausência de mensagem de transferência é detectada", () => {
    const v = verificarHandoff(fatos({ mensagensSaida: ["Oi! Como posso ajudar?"] }));
    expect(v.transfer_message_created).toBe(false);
  });

  test("marcador interno da timeline não conta como mensagem ao paciente", () => {
    expect(ehMensagemDeTransferencia("🧾 Handoff realizado pela Nina · Protocolo: MJ-1")).toBe(
      false,
    );
    expect(ehMensagemDeTransferencia(MSG_OK)).toBe(true);
  });

  test("ciclo não encerrado e memória não resetada são detectados", () => {
    const v = verificarHandoff(fatos({ cicloStatus: "ativo", memoryResetAt: null }));
    expect(v.cycle_completed).toBe(false);
    expect(v.memory_reset).toBe(false);
  });

  test("setor: menciona o destino estruturado ou fala em nossa equipe", () => {
    expect(
      setorMencionadoCorretamente({
        mensagem: "Vou encaminhar para nossa equipe de Recepção.",
        departamentoNome: "Recepção",
        setoresConhecidos: ["Recepção", "Financeiro"],
      }),
    ).toBe(true);
    expect(
      setorMencionadoCorretamente({
        mensagem: "Vou encaminhar para nossa equipe financeiro cuidar disso.",
        departamentoNome: null,
        setoresConhecidos: ["Recepção", "Financeiro"],
      }),
    ).toBe(false);
    expect(
      setorMencionadoCorretamente({
        mensagem: "Vou encaminhar para nossa equipe continuar por aqui.",
        departamentoNome: null,
        setoresConhecidos: ["Recepção", "Financeiro"],
      }),
    ).toBe(true);
  });
});
