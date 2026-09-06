import { describe, expect, it } from "bun:test";
import { textoEvento, type ConversaEvento } from "../ConversationSystemEvent";

function ev(p: Partial<ConversaEvento>): ConversaEvento {
  return {
    id: "1",
    evento: "ASSUMIDA",
    user_id: "u1",
    user_nome: "Jean",
    para_nome: null,
    motivo: null,
    detalhes: null,
    created_at: new Date().toISOString(),
    ...p,
  };
}

describe("registro de atribuições manuais na linha do tempo", () => {
  it("atribuição direta identifica autor e destino", () => {
    expect(
      textoEvento(ev({ para_nome: "Ana", detalhes: { manual: true, para_user_id: "u2" } })),
    ).toBe("Jean atribuiu esta conversa a Ana.");
  });

  it("transferência entre atendentes cita a anterior e a nova", () => {
    expect(
      textoEvento(
        ev({
          evento: "TRANSFERIDA",
          para_nome: "Ana",
          de_nome: "Bia",
          detalhes: { manual: true, para_user_id: "u2", de_user_id: "u3" },
        }),
      ),
    ).toBe("Jean transferiu esta conversa de Bia para Ana.");
  });

  it("setor com atendente disponível informa o sorteio", () => {
    expect(
      textoEvento(
        ev({
          evento: "TRANSFERIDA",
          para_nome: "Ana",
          detalhes: { manual: true, setor_nome: "Recepção", sorteio: true, para_user_id: "u2" },
        }),
      ),
    ).toBe(
      "Jean encaminhou esta conversa para o setor Recepção. Atribuída a Ana por distribuição aleatória.",
    );
  });

  it("setor sem atendente disponível informa a fila", () => {
    expect(
      textoEvento(
        ev({
          evento: "TRANSFERIDA",
          detalhes: { manual: true, setor_nome: "Recepção", sorteio: false, para_user_id: null },
        }),
      ),
    ).toBe(
      "Jean encaminhou esta conversa para o setor Recepção. Aguardando uma atendente disponível na fila de Não atribuídas.",
    );
  });

  it("atribuição automática mantém o texto atual", () => {
    expect(textoEvento(ev({ user_nome: "Ana" }))).toBe("Conversa atribuída a Ana");
  });
});
