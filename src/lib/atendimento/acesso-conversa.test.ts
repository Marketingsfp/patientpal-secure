import { describe, it, expect } from "bun:test";
import { usuarioPodeVerConversa } from "./escopo-inbox";

const JEAN = "11111111-1111-1111-1111-111111111111";
const MARIA = "22222222-2222-2222-2222-222222222222";

describe("FASE 3 — acesso direto por URL", () => {
  it("usuário autorizado: conversa atribuída a ele", () => {
    expect(
      usuarioPodeVerConversa(
        { atribuida_user_id: JEAN, owner_type: "HUMAN", status: "open" },
        { userId: JEAN, gestor: false },
      ),
    ).toBe(true);
  });

  it("usuário sem permissão: conversa ativa de outro atendente", () => {
    expect(
      usuarioPodeVerConversa(
        { atribuida_user_id: MARIA, owner_type: "HUMAN", status: "open" },
        { userId: JEAN, gestor: false },
      ),
    ).toBe(false);
  });

  it("supervisor vê conversa de outro atendente", () => {
    expect(
      usuarioPodeVerConversa(
        { atribuida_user_id: MARIA, owner_type: "HUMAN", status: "open" },
        { userId: JEAN, gestor: true },
      ),
    ).toBe(true);
  });

  it("conversa da Nina e não atribuídas ficam visíveis para o atendente", () => {
    expect(
      usuarioPodeVerConversa(
        { atribuida_user_id: null, owner_type: "AI", status: "open" },
        { userId: JEAN, gestor: false },
      ),
    ).toBe(true);
    expect(
      usuarioPodeVerConversa(
        { atribuida_user_id: null, owner_type: "HUMAN", status: "open" },
        { userId: JEAN, gestor: false },
      ),
    ).toBe(true);
  });

  it("conversa fechada de outro atendente permanece bloqueada", () => {
    expect(
      usuarioPodeVerConversa(
        { atribuida_user_id: MARIA, owner_type: "HUMAN", status: "closed" },
        { userId: JEAN, gestor: false },
      ),
    ).toBe(false);
    expect(
      usuarioPodeVerConversa(
        { atribuida_user_id: JEAN, owner_type: "HUMAN", status: "closed" },
        { userId: JEAN, gestor: false },
      ),
    ).toBe(true);
  });
});
