import { describe, expect, it } from "bun:test";
import { enviarComRetomadaRecuperavel, temRespostaAoEnvio } from "../homologacao-retomada";

describe("retomada idempotente da homologação", () => {
  it("reutiliza o mesmo envio somente após erro recuperável persistido", async () => {
    const entrada = { chave: "mesma-chave" };
    const recebidas: unknown[] = [];
    const r = await enviarComRetomadaRecuperavel(async () => {
      recebidas.push(entrada);
      return { mensagemPersistida: true, recuperavel: recebidas.length < 2 };
    }, () => true, async () => {});
    expect(recebidas).toEqual([entrada, entrada]);
    expect(r.recuperavel).toBe(false);
  });
  it("limita a três chamadas e não repete falha sem persistência", async () => {
    for (const persistida of [true, false]) {
      let n = 0;
      await enviarComRetomadaRecuperavel(async () => {
        n++; return { recuperavel: true, mensagemPersistida: persistida };
      }, () => true, async () => {});
      expect(n).toBe(persistida ? 3 : 1);
    }
  });
  it("não repete exceção de resultado desconhecido", async () => {
    let n = 0;
    await expect(enviarComRetomadaRecuperavel(async () => {
      n++; throw new Error("rede");
    }, () => true)).rejects.toThrow("rede");
    expect(n).toBe(1);
  });
  it("interrompe a retomada quando há reset durante a espera", async () => {
    let atual = true, n = 0;
    await enviarComRetomadaRecuperavel(async () => {
      n++; return { recuperavel: true, mensagemPersistida: true };
    }, () => atual, async () => { atual = false; });
    expect(n).toBe(1);
  });
});

describe("resposta correlacionada ao envio", () => {
  const base = { conversa_id: "c1", body: "texto", created_at: "2026-09-28T15:00:00Z" };
  const entrada = { ...base, id: "in1", direction: "in", enviada_por: "paciente", wa_message_id: "test-k1" };
  const saida = { ...base, id: "out1", direction: "out", enviada_por: "nina" };
  it("ignora resposta antiga, entrada ausente e bolha otimista", () => {
    expect(temRespostaAoEnvio([saida, entrada], "test-k1")).toBe(false);
    expect(temRespostaAoEnvio([saida], "test-k1")).toBe(false);
    expect(temRespostaAoEnvio([{ ...entrada, id: "otimista:k1" }, saida], "test-k1")).toBe(false);
  });
  it("exige resposta da Nina na mesma conversa após a entrada", () => {
    expect(temRespostaAoEnvio([entrada, saida], "test-k1")).toBe(true);
    expect(temRespostaAoEnvio([entrada, { ...saida, conversa_id: "c2" }], "test-k1")).toBe(false);
    expect(temRespostaAoEnvio([entrada, { ...saida, enviada_por: "sistema" }], "test-k1")).toBe(false);
  });
});
