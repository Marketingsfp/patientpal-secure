import { describe, it, expect, afterEach } from "bun:test";
import { formatarCep, resolverEnderecoDoTomador } from "./nfse-endereco-tomador";

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

/** Finge o ViaCEP: `resposta` é o corpo JSON, ou "falha" para simular queda. */
function fingirViaCep(resposta: Record<string, unknown> | "falha") {
  globalThis.fetch = (async () => {
    if (resposta === "falha") throw new Error("rede fora");
    return new Response(JSON.stringify(resposta), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const base = {
  temLogradouro: true,
  codigoMunicipioEmitente: "3305158",
  nomeTomador: "ROSA DA SILVA",
};

describe("resolverEnderecoDoTomador", () => {
  it("usa o município do CEP quando o CEP existe", async () => {
    fingirViaCep({ ibge: "3305109" });
    const r = await resolverEnderecoDoTomador({ ...base, cep: "25535-040" });
    expect(r.enviarEndereco).toBe(true);
    expect(r.codigoMunicipio).toBe("3305109");
    expect(r.aviso).toBeNull();
  });

  it("descarta o endereço quando o CEP não existe nos Correios (evita E0240)", async () => {
    fingirViaCep({ erro: "true" });
    const r = await resolverEnderecoDoTomador({ ...base, cep: "25000000" });
    expect(r.enviarEndereco).toBe(false);
    expect(r.codigoMunicipio).toBeUndefined();
    expect(r.aviso).toContain("25000-000");
    expect(r.aviso).toContain("ROSA DA SILVA");
  });

  it("descarta CEP zerado sem nem consultar os Correios", async () => {
    globalThis.fetch = (() => {
      throw new Error("não deveria consultar");
    }) as unknown as typeof fetch;
    const r = await resolverEnderecoDoTomador({ ...base, cep: "00000000" });
    expect(r.enviarEndereco).toBe(false);
    expect(r.aviso).toContain("00000-000");
  });

  it("descarta CEP incompleto", async () => {
    globalThis.fetch = (() => {
      throw new Error("não deveria consultar");
    }) as unknown as typeof fetch;
    const r = await resolverEnderecoDoTomador({ ...base, cep: "2553" });
    expect(r.enviarEndereco).toBe(false);
  });

  it("mantém o endereço quando o ViaCEP está fora do ar", async () => {
    fingirViaCep("falha");
    const r = await resolverEnderecoDoTomador({
      ...base,
      cep: "25535-040",
      codigoMunicipioCadastro: "3305109",
    });
    expect(r.enviarEndereco).toBe(true);
    expect(r.codigoMunicipio).toBe("3305109");
    expect(r.aviso).toBeNull();
  });

  it("cai no município do emitente quando o ViaCEP falha e a ficha não tem código", async () => {
    fingirViaCep("falha");
    const r = await resolverEnderecoDoTomador({ ...base, cep: "25535-040" });
    expect(r.enviarEndereco).toBe(true);
    expect(r.codigoMunicipio).toBe("3305158");
  });

  it("não envia endereço quando não há logradouro cadastrado", async () => {
    globalThis.fetch = (() => {
      throw new Error("não deveria consultar");
    }) as unknown as typeof fetch;
    const r = await resolverEnderecoDoTomador({
      ...base,
      temLogradouro: false,
      cep: "25535-040",
    });
    expect(r.enviarEndereco).toBe(false);
    expect(r.aviso).toBeNull();
  });
});

describe("formatarCep", () => {
  it("formata 8 dígitos", () => {
    expect(formatarCep("25535040")).toBe("25535-040");
  });
  it("mostra (vazio) quando não há CEP", () => {
    expect(formatarCep("")).toBe("(vazio)");
    expect(formatarCep(null)).toBe("(vazio)");
  });
});
