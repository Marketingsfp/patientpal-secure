import { describe, expect, it } from "bun:test";
import {
  extrairCodigo,
  gerarCodigo,
  nomeExibicao,
  normalizarCodigo,
  ultimos8,
  MAX_OPCOES,
  RESPOSTA_VERIFICACAO,
  interceptarCodigoVerificacao,
} from "./verificacao-v1.server";

describe("código do desafio", () => {
  it("gera no formato MJ- + 4 caracteres sem O/0/I/1/L", () => {
    for (let i = 0; i < 200; i++) {
      const c = gerarCodigo();
      expect(c).toMatch(/^MJ-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    }
  });

  it("normaliza pontuação e caixa", () => {
    expect(normalizarCodigo(" mj-a2b3 ")).toBe("MJA2B3");
  });

  it("acha o código dentro de um texto livre", () => {
    expect(extrairCodigo("Olá! Meu código de verificação é MJ-A2B3")).toBe("MJA2B3");
    expect(extrairCodigo("oi, tudo bem?")).toBeNull();
  });
});

describe("telefone — últimos 8 dígitos", () => {
  it("ignora máscara, DDI e nono dígito", () => {
    expect(ultimos8("+55 (81) 99876-5432")).toBe("98765432");
    expect(ultimos8("8198765432")).toBe("98765432");
    expect(ultimos8("98765432")).toBe("98765432");
    expect(ultimos8("998765432")).toBe("98765432");
  });

  it("recusa telefone curto ou vazio", () => {
    expect(ultimos8("1234567")).toBeNull();
    expect(ultimos8("")).toBeNull();
    expect(ultimos8(null)).toBeNull();
  });
});

describe("nome exibido na escolha", () => {
  it("mostra primeiro nome e inicial do sobrenome", () => {
    expect(nomeExibicao("Maria Silva Santos")).toBe("Maria S.");
    expect(nomeExibicao("João Souza")).toBe("João S.");
    expect(nomeExibicao("Ana")).toBe("Ana");
  });
});

// --------------------------------------------------------------- stub do banco

type Patch = Record<string, unknown>;

function stubDb(pacientes: Array<{ id: string; nome: string }>) {
  const patches: Patch[] = [];
  const desafio = {
    id: "d1",
    expira_em: new Date(Date.now() + 600_000).toISOString(),
  };
  const chain = (tabela: string) => {
    const api: Record<string, unknown> = {};
    const self = () => api;
    api["select"] = self;
    api["eq"] = self;
    api["is"] = self;
    api["gte"] = self;
    api["update"] = (p: Patch) => {
      if (tabela === "integracao_verificacoes") patches.push(p);
      return api;
    };
    api["maybeSingle"] = async () => {
      if (tabela === "integracao_verificacoes") return { data: desafio };
      if (tabela === "whatsapp_configs") return { data: { display_phone_number: "5581999990000" } };
      return { data: null };
    };
    return api;
  };
  return {
    patches,
    db: {
      from: (t: string) => chain(t),
      rpc: async () => ({ data: pacientes }),
    } as never,
  };
}

async function intercepta(pacientes: Array<{ id: string; nome: string }>) {
  const { db, patches } = stubDb(pacientes);
  const r = await interceptarCodigoVerificacao({
    db,
    clinicaId: "c1",
    texto: "Olá! Meu código de verificação é MJ-A2B3",
    fromNumber: "5581988887777",
    mensagemId: null,
    waMessageId: "wamid.1",
  });
  return { r, patch: patches[0] as Patch };
}

describe("reconhecimento pelo número que enviou", () => {
  const gente = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nome: `Fulano ${i} Silva` }));

  it("um cadastro verifica direto", async () => {
    const { r, patch } = await intercepta(gente(1));
    expect(r.tratada).toBe(true);
    expect(r.resposta).toBe(RESPOSTA_VERIFICACAO);
    expect(patch["status"]).toBe("verificado");
    expect(patch["paciente_id"]).toBe("p0");
  });

  it("de 2 a 6 cadastros pede a escolha, sem expor o paciente_id", async () => {
    for (const n of [2, 3, MAX_OPCOES]) {
      const { patch } = await intercepta(gente(n));
      expect(patch["status"]).toBe("escolher_paciente");
      const opcoes = patch["opcoes"] as Array<Record<string, string>>;
      expect(opcoes).toHaveLength(n);
      expect(opcoes[0]!["nome_exibicao"]).toBe("Fulano S.");
      expect(opcoes[0]!["opcao_id"]).not.toBe("p0");
    }
  });

  it("7 ou mais é cadastro sujo e não localiza", async () => {
    const { patch } = await intercepta(gente(MAX_OPCOES + 1));
    expect(patch["status"]).toBe("nao_localizado");
    expect(patch["opcoes"]).toBeUndefined();
  });

  it("nenhum cadastro não localiza", async () => {
    const { patch } = await intercepta([]);
    expect(patch["status"]).toBe("nao_localizado");
  });
});
