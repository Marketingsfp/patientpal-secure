/** R2 — decisão sobre a assinatura dos avisos da Meta no webhook. */
import { describe, expect, it } from "bun:test";
import { decidirAssinaturaWebhook, modoAssinaturaWebhook } from "../whatsapp-assinatura";

describe("modoAssinaturaWebhook", () => {
  it("bloqueia por padrão", () => {
    expect(modoAssinaturaWebhook(undefined)).toBe("bloquear");
    expect(modoAssinaturaWebhook("")).toBe("bloquear");
    expect(modoAssinaturaWebhook("qualquer")).toBe("bloquear");
  });
  it("só volta a registrar com o valor explícito de reversão", () => {
    expect(modoAssinaturaWebhook("registrar")).toBe("registrar");
    expect(modoAssinaturaWebhook(" Registrar ")).toBe("registrar");
  });
});

describe("decidirAssinaturaWebhook", () => {
  it("assinatura válida segue sem anotação", () => {
    expect(
      decidirAssinaturaWebhook({
        appSecretConfigurado: true,
        assinaturaOk: true,
        modo: "bloquear",
      }),
    ).toEqual({ processar: true, resultado: null });
  });
  it("assinatura inválida é recusada", () => {
    const d = decidirAssinaturaWebhook({
      appSecretConfigurado: true,
      assinaturaOk: false,
      modo: "bloquear",
    });
    expect(d.processar).toBe(false);
    expect(d.resultado).toContain("não confere");
  });
  it("clínica sem App Secret é recusada, com motivo próprio", () => {
    const d = decidirAssinaturaWebhook({
      appSecretConfigurado: false,
      assinaturaOk: false,
      modo: "bloquear",
    });
    expect(d.processar).toBe(false);
    expect(d.resultado).toContain("App Secret não configurado");
  });
  it("assinatura 'ok' sem App Secret nunca é aceita", () => {
    expect(
      decidirAssinaturaWebhook({
        appSecretConfigurado: false,
        assinaturaOk: true,
        modo: "bloquear",
      }).processar,
    ).toBe(false);
  });
  it("modo de reversão mantém o comportamento anterior: registra e processa", () => {
    expect(
      decidirAssinaturaWebhook({
        appSecretConfigurado: true,
        assinaturaOk: false,
        modo: "registrar",
      }),
    ).toEqual({ processar: true, resultado: "assinatura_invalida" });
  });
});
