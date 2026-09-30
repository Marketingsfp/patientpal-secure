import { describe, expect, it } from "bun:test";
import {
  ROTULO_ESTADO_MANUAL,
  ehEstadoManual,
  ehEstadoPausa,
  precisaEscolherPresenca,
  tecnicoDoEstadoManual,
  versaoAceita,
} from "../presenca-manual";
import {
  ROTULO_PRESENCA,
  estadoBloqueiaTransferencia,
  statusPresenca,
} from "../perfil-atendimento";

describe("FASE 1 — escolha manual de presença", () => {
  it("aceita apenas Online, Offline, Em pausa e Em pausa para saída", () => {
    expect(ehEstadoManual("PAUSA_SAIDA")).toBe(true);
    expect(ehEstadoManual("ONLINE")).toBe(true);
    expect(ehEstadoManual("OFFLINE")).toBe(true);
    expect(ehEstadoManual("PAUSA")).toBe(true);
    expect(ehEstadoManual("AWAY")).toBe(false);
    expect(ehEstadoManual("BUSY")).toBe(false);
    expect(ehEstadoManual(null)).toBe(false);
  });

  it("traduz a escolha para o que a distribuição lê", () => {
    expect(tecnicoDoEstadoManual("ONLINE")).toEqual({ status: "ONLINE", aceitaNovas: true });
    expect(tecnicoDoEstadoManual("PAUSA")).toEqual({ status: "BUSY", aceitaNovas: false });
    expect(tecnicoDoEstadoManual("PAUSA_SAIDA")).toEqual({ status: "BUSY", aceitaNovas: false });
    expect(tecnicoDoEstadoManual("OFFLINE")).toEqual({ status: "OFFLINE", aceitaNovas: false });
  });

  it("as duas pausas são identificadas juntas, com rótulos diferentes", () => {
    expect(ehEstadoPausa("PAUSA")).toBe(true);
    expect(ehEstadoPausa("PAUSA_SAIDA")).toBe(true);
    expect(ehEstadoPausa("ONLINE")).toBe(false);
    expect(ehEstadoPausa("OFFLINE")).toBe(false);
    expect(ehEstadoPausa(null)).toBe(false);
    expect(ROTULO_ESTADO_MANUAL.PAUSA).toBe("Em pausa");
    expect(ROTULO_ESTADO_MANUAL.PAUSA_SAIDA).toBe("Em pausa para saída");
    expect(ROTULO_PRESENCA.PAUSA_SAIDA).toBe("Em pausa para saída");
  });

  it("a presença exibida separa Pausa de Pausa para saída", () => {
    expect(statusPresenca({ status: "PAUSA", emPausa: false })).toBe("PAUSA");
    expect(statusPresenca({ status: "PAUSA_SAIDA", emPausa: false })).toBe("PAUSA_SAIDA");
    expect(statusPresenca({ status: "PAUSA_SAIDA", emPausa: true })).toBe("PAUSA_SAIDA");
    expect(statusPresenca({ status: "ONLINE", emPausa: false })).toBe("ONLINE");
    expect(statusPresenca({ status: "OFFLINE", emPausa: false })).toBe("OFFLINE");
  });

  it("transferência manual é recusada para as duas pausas, e só para elas", () => {
    expect(estadoBloqueiaTransferencia("PAUSA")).toBe(true);
    expect(estadoBloqueiaTransferencia("PAUSA_SAIDA")).toBe(true);
    expect(estadoBloqueiaTransferencia("ONLINE")).toBe(false);
    expect(estadoBloqueiaTransferencia("OFFLINE")).toBe(false);
    expect(estadoBloqueiaTransferencia(null)).toBe(false);
  });

  it("registro antigo sem escolha comprovada exige escolha explícita", () => {
    expect(precisaEscolherPresenca(null)).toBe(true);
    expect(precisaEscolherPresenca("OFFLINE")).toBe(false);
    // Estado técnico legado nunca vira escolha manual.
    expect(precisaEscolherPresenca("AWAY")).toBe(true);
  });

  it("versão protege contra duas telas gravando ao mesmo tempo", () => {
    expect(versaoAceita(3, 3)).toBe(true);
    expect(versaoAceita(3, 2)).toBe(false);
    expect(versaoAceita(3, undefined)).toBe(true);
  });
});
