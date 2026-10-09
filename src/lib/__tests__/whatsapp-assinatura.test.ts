/** R2 — decisão sobre a assinatura dos avisos da Meta no webhook. */
import { describe, expect, it } from "bun:test";
import { decidirAssinaturaWebhook } from "../whatsapp-assinatura";

describe("decidirAssinaturaWebhook", () => {
  it("assinatura válida segue sem anotação", () => {
    expect(
      decidirAssinaturaWebhook({
        appSecretConfigurado: true,
        assinaturaOk: true,
      }),
    ).toEqual({ processar: true, resultado: null });
  });
  it("assinatura inválida é recusada", () => {
    const d = decidirAssinaturaWebhook({
      appSecretConfigurado: true,
      assinaturaOk: false,
    });
    expect(d.processar).toBe(false);
    expect(d.resultado).toContain("não confere");
  });
  it("clínica sem App Secret é recusada, com motivo próprio", () => {
    const d = decidirAssinaturaWebhook({
      appSecretConfigurado: false,
      assinaturaOk: false,
    });
    expect(d.processar).toBe(false);
    expect(d.resultado).toContain("App Secret não configurado");
  });
  it("assinatura 'ok' sem App Secret nunca é aceita", () => {
    expect(
      decidirAssinaturaWebhook({
        appSecretConfigurado: false,
        assinaturaOk: true,
      }).processar,
    ).toBe(false);
  });
});
