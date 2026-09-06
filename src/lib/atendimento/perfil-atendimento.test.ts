import { describe, expect, it } from "bun:test";
import {
  apenasDestinatariosValidos,
  ehPerfilAdmin,
  podeReceberConversa,
} from "./perfil-atendimento";

describe("perfil-atendimento", () => {
  it("reconhece administrador em qualquer caixa", () => {
    expect(ehPerfilAdmin("admin")).toBe(true);
    expect(ehPerfilAdmin(" ADMIN ")).toBe(true);
    expect(ehPerfilAdmin("gestor")).toBe(false);
    expect(ehPerfilAdmin(null)).toBe(false);
  });

  it("administrador nunca recebe conversa; atendente e gestor sim", () => {
    expect(podeReceberConversa("admin")).toBe(false);
    expect(podeReceberConversa("recepcao")).toBe(true);
    expect(podeReceberConversa("gestor")).toBe(true);
  });

  it("remove administradores da lista de destinatários", () => {
    const lista = [
      { user_id: "a", role: "admin" },
      { user_id: "b", role: "recepcao" },
      { user_id: "c", role: null },
    ];
    expect(apenasDestinatariosValidos(lista).map((p) => p.user_id)).toEqual(["b", "c"]);
  });
});
