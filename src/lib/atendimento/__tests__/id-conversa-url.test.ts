import { describe, it, expect } from "bun:test";
import { idConversaDaUrl, urlConversa } from "../abrir-conversa";

const ID = "51170f58-39c9-4169-ac05-027827f39fee";

describe("idConversaDaUrl", () => {
  it("lê o id da conversa do endereço", () => {
    expect(idConversaDaUrl(urlConversa(ID))).toBe(ID);
    expect(idConversaDaUrl(`/app/nina/${ID}?x=1#chat`)).toBe(ID);
  });
  it("sem conversa no endereço, nada fica aberto", () => {
    expect(idConversaDaUrl("/app/nina")).toBeNull();
    expect(idConversaDaUrl("/app/nina#atend-inbox")).toBeNull();
    expect(idConversaDaUrl("/app/agenda")).toBeNull();
    expect(idConversaDaUrl(null)).toBeNull();
  });
  it("ignora identificador que não é o id interno", () => {
    expect(idConversaDaUrl("/app/nina/1545")).toBeNull();
    expect(idConversaDaUrl("/app/nina/%23abc")).toBeNull();
  });
});
