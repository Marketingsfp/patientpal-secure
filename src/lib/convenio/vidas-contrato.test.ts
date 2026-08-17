import { describe, expect, it } from "bun:test";
import {
  diagnosticarVidas,
  indexarFaixas,
  telefoneInutilComoPista,
  valorDevidoPorVidas,
  type FaixaVidas,
} from "./vidas-contrato";

// Faixas reais dos dois convênios ativos da clínica (jun/2026).
const CONSULTA = "conv-consulta";
const SEGUROS = "conv-seguros";

const FAIXAS: FaixaVidas[] = [
  { convenio_id: CONSULTA, vidas_de: 1, vidas_ate: 1, valor_mensal: 110 },
  { convenio_id: CONSULTA, vidas_de: 2, vidas_ate: 2, valor_mensal: 155 },
  { convenio_id: CONSULTA, vidas_de: 3, vidas_ate: 3, valor_mensal: 180 },
  { convenio_id: CONSULTA, vidas_de: 4, vidas_ate: 4, valor_mensal: 205 },
  { convenio_id: CONSULTA, vidas_de: 5, vidas_ate: 5, valor_mensal: 230 },
  { convenio_id: CONSULTA, vidas_de: 6, vidas_ate: 6, valor_mensal: 255 },
  { convenio_id: SEGUROS, vidas_de: 1, vidas_ate: 1, valor_mensal: 120 },
  { convenio_id: SEGUROS, vidas_de: 2, vidas_ate: 2, valor_mensal: 175 },
  { convenio_id: SEGUROS, vidas_de: 3, vidas_ate: 3, valor_mensal: 210 },
  { convenio_id: SEGUROS, vidas_de: 4, vidas_ate: 4, valor_mensal: 245 },
  { convenio_id: SEGUROS, vidas_de: 5, vidas_ate: 5, valor_mensal: 280 },
  { convenio_id: SEGUROS, vidas_de: 6, vidas_ate: 6, valor_mensal: 295 },
];

const IDX = indexarFaixas(FAIXAS);

const contrato = (over: Partial<Parameters<typeof diagnosticarVidas>[0]> = {}) => ({
  id: "c1",
  convenio_id: SEGUROS,
  valor_mensal: 245,
  titular_apenas_financeiro: false,
  ...over,
});

describe("diagnosticarVidas", () => {
  it("reproduz o caso IARA: R$ 245 no Seguros = 4 vidas, com 0 dependentes = 3 vagas órfãs", () => {
    const d = diagnosticarVidas(contrato(), 0, IDX);
    expect(d.situacao).toBe("faltam_pessoas");
    expect(d.vidasEsperadas).toBe(4);
    expect(d.vidasAtuais).toBe(1); // só o titular
    expect(d.vagasOrfas).toBe(3);
  });

  it("considera o contrato em dia quando os dependentes completam a faixa", () => {
    const d = diagnosticarVidas(contrato(), 3, IDX);
    expect(d.situacao).toBe("ok");
    expect(d.vagasOrfas).toBe(0);
  });

  it("não conta o titular como vida quando ele é apenas financeiro", () => {
    const d = diagnosticarVidas(contrato({ titular_apenas_financeiro: true }), 3, IDX);
    // 0 (titular não usa) + 3 dependentes = 3, faixa paga cobre 4.
    expect(d.vidasAtuais).toBe(3);
    expect(d.situacao).toBe("faltam_pessoas");
    expect(d.vagasOrfas).toBe(1);
  });

  it("aponta cobrança a menor quando há mais gente vinculada que a faixa paga", () => {
    const d = diagnosticarVidas(contrato({ valor_mensal: 175 }), 3, IDX);
    expect(d.situacao).toBe("sobram_pessoas");
    expect(d.vidasEsperadas).toBe(2);
    expect(d.vidasAtuais).toBe(4);
    expect(d.vagasOrfas).toBe(0);
  });

  it("não inventa capacidade quando o valor não bate com nenhuma faixa", () => {
    // R$ 200 não existe na tabela do Seguros. Chutar "4 vidas" porque 200
    // é perto de 245 criaria vaga órfã inexistente — e trabalho manual
    // em cima de um contrato que talvez só tenha desconto antigo.
    const d = diagnosticarVidas(contrato({ valor_mensal: 200 }), 0, IDX);
    expect(d.situacao).toBe("sem_faixa");
    expect(d.vidasEsperadas).toBeNull();
    expect(d.vagasOrfas).toBe(0);
  });

  it("trata contrato sem convênio como sem faixa, nunca como órfão", () => {
    const d = diagnosticarVidas(contrato({ convenio_id: null }), 0, IDX);
    expect(d.situacao).toBe("sem_faixa");
    expect(d.vagasOrfas).toBe(0);
  });

  it("não confunde faixas de convênios diferentes com o mesmo preço", () => {
    // 110 é 1 vida no CONSULTA e não existe no SEGUROS.
    expect(
      diagnosticarVidas(contrato({ convenio_id: CONSULTA, valor_mensal: 110 }), 0, IDX).situacao,
    ).toBe("ok");
    expect(
      diagnosticarVidas(contrato({ convenio_id: SEGUROS, valor_mensal: 110 }), 0, IDX).situacao,
    ).toBe("sem_faixa");
  });

  it("casa o valor mesmo com ruído de ponto flutuante vindo do numeric", () => {
    const d = diagnosticarVidas(contrato({ valor_mensal: 245.00000000001 }), 0, IDX);
    expect(d.vidasEsperadas).toBe(4);
  });
});

describe("indexarFaixas", () => {
  it("em empate de valor, fica com a faixa de menos vidas (hipótese conservadora)", () => {
    const idx = indexarFaixas([
      { convenio_id: "x", vidas_de: 5, vidas_ate: 5, valor_mensal: 300 },
      { convenio_id: "x", vidas_de: 3, vidas_ate: 3, valor_mensal: 300 },
    ]);
    const d = diagnosticarVidas(
      { id: "c", convenio_id: "x", valor_mensal: 300, titular_apenas_financeiro: false },
      0,
      idx,
    );
    expect(d.vidasEsperadas).toBe(3);
  });
});

describe("valorDevidoPorVidas", () => {
  it("acha o valor pela faixa que cobre o nº de vidas", () => {
    expect(valorDevidoPorVidas(SEGUROS, 4, FAIXAS)).toBe(245);
    expect(valorDevidoPorVidas(CONSULTA, 2, FAIXAS)).toBe(155);
  });

  it("devolve null quando nenhuma faixa cobre aquele nº de vidas", () => {
    expect(valorDevidoPorVidas(SEGUROS, 9, FAIXAS)).toBeNull();
  });

  it("respeita faixa aberta (vidas_ate null)", () => {
    const abertas: FaixaVidas[] = [
      { convenio_id: "y", vidas_de: 1, vidas_ate: null, valor_mensal: 290 },
    ];
    expect(valorDevidoPorVidas("y", 12, abertas)).toBe(290);
  });
});

describe("telefoneInutilComoPista", () => {
  it("aceita celular real", () => {
    expect(telefoneInutilComoPista("21990530683")).toBe(false);
  });

  it("descarta curto, vazio, repetido e zerado", () => {
    expect(telefoneInutilComoPista(null)).toBe(true);
    expect(telefoneInutilComoPista("")).toBe(true);
    expect(telefoneInutilComoPista("99999")).toBe(true);
    expect(telefoneInutilComoPista("21999999999")).toBe(true);
    expect(telefoneInutilComoPista("11888888888")).toBe(true);
    expect(telefoneInutilComoPista("00000000000")).toBe(true);
  });
});
