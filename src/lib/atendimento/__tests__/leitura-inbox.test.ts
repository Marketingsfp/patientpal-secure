import { describe, expect, it } from "bun:test";
import { avaliarLeituraAutomatica, MOTIVO_LEITURA } from "../leitura-inbox";

const MARIA = "11111111-1111-1111-1111-111111111111";
const ADMIN = "22222222-2222-2222-2222-222222222222";

describe("leitura automática da Inbox", () => {
  it("atendente responsável marca a própria leitura", () => {
    expect(
      avaliarLeituraAutomatica({ userId: MARIA, atribuidaUserId: MARIA, ehGestor: false }),
    ).toEqual({ pode: true, motivo: MOTIVO_LEITURA.responsavel });
  });

  it("administrador que abre a conversa da Maria não zera o contador dela", () => {
    expect(
      avaliarLeituraAutomatica({ userId: ADMIN, atribuidaUserId: MARIA, ehGestor: true }),
    ).toEqual({ pode: false, motivo: MOTIVO_LEITURA.supervisao });
  });

  it("perfil acumulado (gestor que também atende) não marca automaticamente", () => {
    expect(
      avaliarLeituraAutomatica({ userId: MARIA, atribuidaUserId: MARIA, ehGestor: true }),
    ).toEqual({ pode: false, motivo: MOTIVO_LEITURA.supervisao });
  });

  it("atendente olhando conversa de colega ou sem responsável não marca", () => {
    expect(
      avaliarLeituraAutomatica({ userId: ADMIN, atribuidaUserId: MARIA, ehGestor: false }).motivo,
    ).toBe(MOTIVO_LEITURA.nao_responsavel);
    expect(
      avaliarLeituraAutomatica({ userId: MARIA, atribuidaUserId: null, ehGestor: false }).pode,
    ).toBe(false);
  });
});
