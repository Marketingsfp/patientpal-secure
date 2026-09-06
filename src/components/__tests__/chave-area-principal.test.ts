import { describe, it, expect } from "bun:test";
import { chaveAreaPrincipal } from "../app-shell";

/**
 * A área principal do layout é remontada quando sua `key` muda. Trocar de
 * conversa dentro da Inbox da Nina não pode remontar a tela.
 */
describe("chave da área principal do layout", () => {
  it("mantém a mesma identidade ao trocar de conversa na Inbox da Nina", () => {
    const a = chaveAreaPrincipal("/app/nina/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa");
    const b = chaveAreaPrincipal("/app/nina/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb");
    expect(a).toBe(b);
    expect(chaveAreaPrincipal("/app/nina")).toBe(a);
  });

  it("não confunde a Inbox com outras telas da Nina", () => {
    expect(chaveAreaPrincipal("/app/nina-metricas")).toBe("/app/nina-metricas");
    expect(chaveAreaPrincipal("/app/nina-aprendizado")).toBe("/app/nina-aprendizado");
    expect(chaveAreaPrincipal("/app/nina-metricas")).not.toBe(chaveAreaPrincipal("/app/nina"));
  });

  it("outros módulos continuam com identidade por endereço", () => {
    expect(chaveAreaPrincipal("/app/agenda")).toBe("/app/agenda");
    expect(chaveAreaPrincipal("/app/financeiro/notas")).toBe("/app/financeiro/notas");
    expect(chaveAreaPrincipal("/app/agenda")).not.toBe(chaveAreaPrincipal("/app/caixa"));
  });
});
