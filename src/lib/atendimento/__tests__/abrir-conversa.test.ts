import { describe, it, expect } from "bun:test";
import { ROTA_ATENDIMENTO, destinoInbox, idConversaValido } from "../abrir-conversa";

const ID = "51170f58-39c9-4169-ac05-027827f39fee";

describe("abertura de conversa (seleção interna)", () => {
  it("todo destino é o endereço-base da Inbox", () => {
    expect(destinoInbox()).toEqual({ to: ROTA_ATENDIMENTO, replace: false });
    expect(destinoInbox({ replace: true })).toEqual({ to: ROTA_ATENDIMENTO, replace: true });
    expect(ROTA_ATENDIMENTO).toBe("/app/nina");
  });
  it("só o id interno abre conversa", () => {
    expect(idConversaValido(ID)).toBe(ID);
    expect(idConversaValido(`  ${ID}  `)).toBe(ID);
    expect(idConversaValido("1545")).toBeNull();
    expect(idConversaValido("#1545")).toBeNull();
    expect(idConversaValido("")).toBeNull();
    expect(idConversaValido(null)).toBeNull();
  });
});
