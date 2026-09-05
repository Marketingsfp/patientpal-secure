import { describe, expect, it } from "bun:test";
import {
  ROTA_ATENDIMENTO,
  ROTA_CONVERSA,
  destinoConversa,
  urlConversa,
} from "./abrir-conversa";

describe("Fase 5 — navegação central para conversas", () => {
  it("abre a conversa pela rota dedicada usando o id interno", () => {
    expect(destinoConversa("abc-123")).toEqual({
      to: ROTA_CONVERSA,
      params: { conversationId: "abc-123" },
      replace: false,
    });
  });

  it("sem conversa, volta para a Inbox", () => {
    expect(destinoConversa(null)).toEqual({ to: ROTA_ATENDIMENTO, replace: false });
    expect(destinoConversa("   ")).toEqual({ to: ROTA_ATENDIMENTO, replace: false });
  });

  it("respeita substituição do histórico quando pedida", () => {
    expect(destinoConversa("abc", { replace: true })).toMatchObject({ replace: true });
  });

  it("gera o endereço para copiar/compartilhar", () => {
    expect(urlConversa("abc-123")).toBe("/app/nina/abc-123");
  });

  it("mesma rota para qualquer origem (Central de Atenção, fila, notificações)", () => {
    const origens = ["central", "fila", "notificacao", "qa", "supervisao"];
    const destinos = origens.map(() => destinoConversa("conv-1"));
    for (const d of destinos) expect(d).toEqual(destinos[0]!);
  });
});
