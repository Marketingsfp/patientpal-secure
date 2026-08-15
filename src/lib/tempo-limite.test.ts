import { describe, expect, it } from "bun:test";
import { comTempoLimite, TempoLimiteExcedido } from "./tempo-limite";

// Trava de regressão do destravamento da interface: o valor destas chamadas
// não é o resultado em si, é a garantia de que a promessa SEMPRE resolve ou
// rejeita. Enquanto ela não resolve, o `finally` da tela não roda e o médico
// fica com o botão desabilitado e o indicador girando.

describe("comTempoLimite", () => {
  it("devolve o resultado quando a chamada responde a tempo", async () => {
    const r = await comTempoLimite(async () => "pronto", "A operação", 500);
    expect(r).toBe("pronto");
  });

  it("rejeita com TempoLimiteExcedido quando a chamada trava", async () => {
    // Promessa que nunca resolve sozinha — simula a conexão que fica pendurada,
    // que é o caso pior: sem isso a tela nunca destrava.
    const travada = (signal: AbortSignal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("AbortError")));
      });

    await expect(comTempoLimite(travada, "A análise do caso", 20)).rejects.toBeInstanceOf(
      TempoLimiteExcedido,
    );
  });

  it("a mensagem de erro diz o que travou e o que fazer", async () => {
    const travada = (signal: AbortSignal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("AbortError")));
      });

    let erro: Error | null = null;
    try {
      await comTempoLimite(travada, "A análise do caso", 20);
    } catch (e) {
      erro = e as Error;
    }
    expect(erro?.message).toContain("A análise do caso");
    expect(erro?.message).toContain("tente novamente");
  });

  it("aborta o sinal repassado, para a requisição não ficar órfã", async () => {
    let abortado = false;
    const travada = (signal: AbortSignal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          abortado = true;
          reject(new Error("AbortError"));
        });
      });

    await comTempoLimite(travada, "A operação", 20).catch(() => undefined);
    expect(abortado).toBe(true);
  });

  it("preserva o erro original quando a falha não é de tempo", async () => {
    const falha = async () => {
      throw new Error("Créditos esgotados");
    };
    let erro: Error | null = null;
    try {
      await comTempoLimite(falha, "A operação", 500);
    } catch (e) {
      erro = e as Error;
    }
    expect(erro).not.toBeInstanceOf(TempoLimiteExcedido);
    expect(erro?.message).toBe("Créditos esgotados");
  });
});
