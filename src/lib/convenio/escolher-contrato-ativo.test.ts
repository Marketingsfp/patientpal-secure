import { describe, expect, it } from "bun:test";
import {
  escolherContratoAtivo,
  compararContratosAtivos,
  filtrarTitularesBeneficiarios,
  titularUsaBeneficio,
} from "./escolher-contrato-ativo";

const CONV = "11111111-1111-1111-1111-111111111111";

describe("escolherContratoAtivo", () => {
  it("devolve null para lista vazia", () => {
    expect(escolherContratoAtivo([])).toBeNull();
    expect(escolherContratoAtivo([null, undefined])).toBeNull();
  });

  it("prefere contrato COM convênio, mesmo que seja o mais antigo", () => {
    // Contratos legados sem convenio_id vinham do vínculo automático da
    // importação; se ganhassem, o paciente perdia o desconto do cartão.
    const escolhido = escolherContratoAtivo([
      { convenio_id: null, data_inicio: "2026-08-27", created_at: "2026-08-27T10:00:00Z" },
      { convenio_id: CONV, data_inicio: "2025-01-01", created_at: "2025-01-01T10:00:00Z" },
    ]);
    expect(escolhido?.data_inicio).toBe("2025-01-01");
  });

  it("no empate de convênio, vale o data_inicio mais recente", () => {
    const escolhido = escolherContratoAtivo([
      { convenio_id: CONV, data_inicio: "2025-07-26", created_at: "2026-06-11T10:00:00Z" },
      { convenio_id: CONV, data_inicio: "2026-08-27", created_at: "2026-08-27T10:00:00Z" },
    ]);
    expect(escolhido?.data_inicio).toBe("2026-08-27");
  });

  it("usa created_at para desempatar data_inicio igual", () => {
    const escolhido = escolherContratoAtivo([
      { convenio_id: CONV, data_inicio: "2026-08-27", created_at: "2026-08-27T09:00:00Z" },
      { convenio_id: CONV, data_inicio: "2026-08-27", created_at: "2026-08-27T15:00:00Z" },
    ]);
    expect(escolhido?.created_at).toBe("2026-08-27T15:00:00Z");
  });

  it("contrato sem data nunca ganha de contrato com data", () => {
    const escolhido = escolherContratoAtivo([
      { convenio_id: CONV, data_inicio: null, created_at: null },
      { convenio_id: CONV, data_inicio: "2025-01-01", created_at: "2025-01-01T10:00:00Z" },
    ]);
    expect(escolhido?.data_inicio).toBe("2025-01-01");
  });

  it("é estável: a ordem de entrada não muda o escolhido", () => {
    // Este é o defeito que a função existe para matar. Antes, o resultado
    // dependia da ordem em que o Postgres devolvia as linhas.
    const a = { convenio_id: CONV, data_inicio: "2025-07-26", created_at: "2026-06-11T10:00:00Z" };
    const b = { convenio_id: CONV, data_inicio: "2026-08-27", created_at: "2026-08-27T10:00:00Z" };
    expect(escolherContratoAtivo([a, b])).toBe(b);
    expect(escolherContratoAtivo([b, a])).toBe(b);
  });

  it("caso real: dependente em dois cartões ativos fica com o vendido hoje", () => {
    // NICOLAS aparecia bloqueado por R$ 310,00 do cartão antigo de outro
    // titular, em que também constava como dependente ativo.
    const cartaoAntigoDeOutroTitular = {
      convenio_id: CONV,
      data_inicio: "2025-07-26",
      created_at: "2026-06-11T00:00:00Z",
    };
    const cartaoVendidoHoje = {
      convenio_id: "22222222-2222-2222-2222-222222222222",
      data_inicio: "2026-08-27",
      created_at: "2026-08-27T13:00:00Z",
    };
    expect(escolherContratoAtivo([cartaoAntigoDeOutroTitular, cartaoVendidoHoje])).toBe(
      cartaoVendidoHoje,
    );
  });

  it("comparador ordena a lista inteira do que vale para o que não vale", () => {
    const lista = [
      { convenio_id: null, data_inicio: "2026-12-31", created_at: "2026-12-31T10:00:00Z" },
      { convenio_id: CONV, data_inicio: "2025-01-01", created_at: "2025-01-01T10:00:00Z" },
      { convenio_id: CONV, data_inicio: "2026-08-27", created_at: "2026-08-27T10:00:00Z" },
    ];
    const ordenada = [...lista].sort(compararContratosAtivos);
    expect(ordenada.map((c) => c.data_inicio)).toEqual(["2026-08-27", "2025-01-01", "2026-12-31"]);
  });
});

describe("titularUsaBeneficio", () => {
  it("titular comum é beneficiário do próprio contrato", () => {
    expect(titularUsaBeneficio({ titular_apenas_financeiro: false })).toBe(true);
    // Contrato antigo, gravado antes de a coluna existir, não traz o campo.
    expect(titularUsaBeneficio({})).toBe(true);
  });

  it("titular apenas financeiro NÃO é beneficiário", () => {
    expect(titularUsaBeneficio({ titular_apenas_financeiro: true })).toBe(false);
  });

  it("contrato ausente não dá benefício a ninguém", () => {
    expect(titularUsaBeneficio(null)).toBe(false);
    expect(titularUsaBeneficio(undefined)).toBe(false);
  });

  it("caso real: quem paga o cartão dos pais é cobrado como particular", () => {
    // A paciente comprou o cartão para o pai e a mãe e ficou marcada como
    // titular apenas financeiro. A consulta de endocrinologia dela saía por
    // R$ 10,00 (tabela do convênio) em vez dos R$ 120,00 particulares.
    const cartaoDosPais = {
      convenio_id: CONV,
      data_inicio: "2026-09-03",
      created_at: "2026-09-03T18:52:37Z",
      titular_apenas_financeiro: true,
    };
    expect(filtrarTitularesBeneficiarios([cartaoDosPais])).toEqual([]);
    expect(escolherContratoAtivo(filtrarTitularesBeneficiarios([cartaoDosPais]))).toBeNull();
  });

  it("filtra só o titular apenas financeiro e mantém o desempate normal", () => {
    const soPaga = {
      convenio_id: CONV,
      data_inicio: "2026-09-01",
      created_at: "2026-09-01T10:00:00Z",
      titular_apenas_financeiro: true,
    };
    const proprio = {
      convenio_id: CONV,
      data_inicio: "2026-08-01",
      created_at: "2026-08-01T10:00:00Z",
      titular_apenas_financeiro: false,
    };
    expect(escolherContratoAtivo(filtrarTitularesBeneficiarios([soPaga, proprio]))).toBe(proprio);
  });
});
