import { describe, expect, it } from "bun:test";
import { enviarComRetomadaRecuperavel, recuperarHistoricoPendente, temRespostaAoEnvio } from "../homologacao-retomada";

describe("recuperação do chat sem evento Realtime", () => {
  it("recupera resposta tardia e para assim que ela aparece", async () => {
    let leituras = 0, esperas = 0;
    expect(await recuperarHistoricoPendente(async () => ++leituras === 9,
      () => true, async () => { esperas++; })).toBe(true);
    expect(leituras).toBe(9);
    expect(esperas).toBe(9);
  });
  it("não aplica leitura depois de reset ou troca de lead durante a espera", async () => {
    let atual = true, leituras = 0;
    expect(await recuperarHistoricoPendente(async () => { leituras++; return true; },
      () => atual, async () => { atual = false; })).toBe(false);
    expect(leituras).toBe(0);
  });
  it("falhas de leitura não reenviam a mensagem e a recuperação é limitada", async () => {
    let leituras = 0;
    expect(await recuperarHistoricoPendente(async () => { leituras++; throw new Error('rede'); },
      () => true, async () => {})).toBe(false);
    expect(leituras).toBe(24);
  });
  it("não sobrepõe leituras lentas e ignora sucesso de seleção antiga", async () => {
    let atual = true, concluir!: (v: boolean) => void, leituras = 0;
    const p = recuperarHistoricoPendente(() => { leituras++; return new Promise(r => { concluir = r; }); },
      () => atual, async () => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(leituras).toBe(1);
    atual = false;
    concluir(true);
    expect(await p).toBe(false);
  });
});

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
