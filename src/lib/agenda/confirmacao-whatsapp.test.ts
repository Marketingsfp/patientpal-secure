import { describe, expect, it } from "bun:test";
import {
  celularParaEnvio,
  chaveTelefone,
  dentroDaJanelaDeEnvio,
  etapaParaConsulta,
  interpretarResposta,
  lerPayloadBotao,
  parametrosTemplate,
  payloadBotao,
} from "./confirmacao-whatsapp";

describe("interpretarResposta", () => {
  it("reconhece confirmações curtas", () => {
    for (const t of ["1", " 1 ", "Sim", "SIM!", "confirmo", "Confirmar presença", "👍", "ok"]) {
      expect(interpretarResposta(t)).toBe("confirmar");
    }
  });
  it("reconhece cancelamentos curtos", () => {
    for (const t of ["2", "Não", "nao", "NÃO VOU", "Não poderei comparecer", "pode cancelar"]) {
      expect(interpretarResposta(t)).toBe("cancelar");
    }
  });
  it("não intercepta frases com mais conteúdo", () => {
    for (const t of [
      "sim, mas posso mudar o horário?",
      "12",
      "1 e 2",
      "quero remarcar",
      "",
      "bom dia",
    ]) {
      expect(interpretarResposta(t)).toBeNull();
    }
  });
});

describe("celularParaEnvio", () => {
  it("aceita celular com DDD em vários formatos", () => {
    expect(celularParaEnvio("(21) 97588-7584")).toBe("5521975887584");
    expect(celularParaEnvio("5521975887584")).toBe("5521975887584");
    expect(celularParaEnvio("021975887584")).toBe("5521975887584");
  });
  it("recusa número sem DDD, fixo e lixo", () => {
    expect(celularParaEnvio("97588-7584")).toBeNull();
    expect(celularParaEnvio("(21) 2233-4455")).toBeNull();
    expect(celularParaEnvio("")).toBeNull();
    expect(celularParaEnvio(null)).toBeNull();
  });
});

describe("chaveTelefone", () => {
  it("casa o mesmo celular com e sem o nono dígito", () => {
    expect(chaveTelefone("5521975887584")).toBe("2175887584");
    expect(chaveTelefone("552175887584")).toBe("2175887584");
  });
});

describe("payload do botão", () => {
  it("ida e volta", () => {
    const id = "0b7e1c1e-9f0a-4d57-8a57-3f2c0e5b8a11";
    expect(lerPayloadBotao(payloadBotao(id, "confirmar"))).toEqual({
      confirmacaoId: id,
      acao: "confirmar",
    });
    expect(lerPayloadBotao(payloadBotao(id, "cancelar"))?.acao).toBe("cancelar");
    expect(lerPayloadBotao("Confirmar presença")).toBeNull();
  });
});

describe("etapaParaConsulta", () => {
  // 17/09/2026 10:00 em São Paulo = 13:00 UTC
  const inicio = "2026-09-17T13:00:00.000Z";
  it("48h sai dois dias antes e 24h um dia antes", () => {
    expect(etapaParaConsulta(inicio, "2026-09-15", ["48h", "24h"])).toBe("48h");
    expect(etapaParaConsulta(inicio, "2026-09-16", ["48h", "24h"])).toBe("24h");
    expect(etapaParaConsulta(inicio, "2026-09-17", ["48h", "24h"])).toBeNull();
  });
  it("respeita etapas desligadas", () => {
    expect(etapaParaConsulta(inicio, "2026-09-15", ["24h"])).toBeNull();
  });
  it("usa o dia civil da clínica, não o UTC", () => {
    // 17/09 22:30 em SP = 18/09 01:30 UTC
    expect(etapaParaConsulta("2026-09-18T01:30:00.000Z", "2026-09-16", ["24h"])).toBe("24h");
  });
});

describe("parametrosTemplate", () => {
  it("não expõe nada além de nome, dia e hora", () => {
    expect(
      parametrosTemplate({
        pacienteNome: "MARIA DA SILVA",
        inicio: "2026-09-16T12:30:00.000Z",
        ordemChegada: false,
      }),
    ).toEqual(["Maria", "quarta-feira, 16/09", "09:30"]);
  });
  it("avisa ordem de chegada", () => {
    expect(
      parametrosTemplate({
        pacienteNome: "JOSE",
        inicio: "2026-09-16T10:00:00.000Z",
        ordemChegada: true,
      })[2],
    ).toBe("07:00 (atendimento por ordem de chegada)");
  });
});

describe("dentroDaJanelaDeEnvio", () => {
  it("usa o horário de São Paulo", () => {
    expect(dentroDaJanelaDeEnvio("08:00", "19:00", new Date("2026-09-15T10:59:00Z"))).toBe(false);
    expect(dentroDaJanelaDeEnvio("08:00", "19:00", new Date("2026-09-15T11:00:00Z"))).toBe(true);
    expect(dentroDaJanelaDeEnvio("08:00", "19:00", new Date("2026-09-15T22:00:00Z"))).toBe(false);
  });
});
