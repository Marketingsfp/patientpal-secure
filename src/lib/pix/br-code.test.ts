import { describe, expect, it } from "bun:test";
import {
  competenciaDeVencimento,
  crc16,
  montarPayloadPix,
  normalizarTexto,
  normalizarTxid,
  txidMensalidade,
} from "./br-code";

/**
 * Lê um payload BR Code e devolve os campos de primeiro nível num objeto.
 * Serve para os testes conferirem valor por valor em vez de comparar uma
 * string gigante — quando quebra, o erro aponta o campo.
 */
function lerCampos(payload: string): Record<string, string> {
  const campos: Record<string, string> = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const tamanho = Number(payload.slice(i + 2, i + 4));
    campos[id] = payload.slice(i + 4, i + 4 + tamanho);
    i += 4 + tamanho;
  }
  return campos;
}

const BASE = {
  chave: "12345678000199",
  beneficiario: "Clínica Menino Jesus",
  cidade: "São Paulo",
};

describe("crc16", () => {
  it("bate com o vetor de referência do CRC-16/CCITT-FALSE", () => {
    // "123456789" → 0x29B1 é o valor publicado para este algoritmo. Se este
    // teste quebrar, o QR inteiro passa a ser recusado pelos bancos.
    expect(crc16("123456789")).toBe("29B1");
  });

  it("devolve sempre 4 dígitos em maiúsculas", () => {
    expect(crc16("A")).toMatch(/^[0-9A-F]{4}$/);
    expect(crc16("")).toBe("FFFF");
  });
});

describe("normalizarTexto", () => {
  it("tira acento e sobe para maiúsculas", () => {
    expect(normalizarTexto("São Paulo", 15)).toBe("SAO PAULO");
    expect(normalizarTexto("Clínica Menino Jesus", 25)).toBe("CLINICA MENINO JESUS");
  });

  it("corta no limite pedido sem deixar espaço sobrando na ponta", () => {
    expect(normalizarTexto("CLINICA MENINO JESUS LTDA", 15)).toBe("CLINICA MENINO");
  });

  it("troca pontuação por espaço e junta espaços repetidos", () => {
    expect(normalizarTexto("Clinica  -  Menino/Jesus", 40)).toBe("CLINICA MENINO JESUS");
  });
});

describe("normalizarTxid", () => {
  it("mantém só letras e números", () => {
    expect(normalizarTxid("CT 2026-2655 / P8")).toBe("CT20262655P8");
  });

  it("usa *** quando não sobra nada", () => {
    expect(normalizarTxid("---")).toBe("***");
    expect(normalizarTxid("")).toBe("***");
  });

  it("corta em 25 caracteres", () => {
    expect(normalizarTxid("A".repeat(40))).toHaveLength(25);
  });
});

describe("txidMensalidade", () => {
  it("monta o identificador a partir do contrato e da parcela", () => {
    expect(txidMensalidade(20262655, 8)).toBe("CT20262655P8");
  });

  it("aguenta contrato sem número", () => {
    expect(txidMensalidade(null, 3)).toBe("CT0P3");
  });
});

describe("competenciaDeVencimento", () => {
  it("devolve mês/ano do vencimento", () => {
    expect(competenciaDeVencimento("2026-08-10")).toBe("08/2026");
  });

  it("devolve vazio quando não há data", () => {
    expect(competenciaDeVencimento(null)).toBe("");
    expect(competenciaDeVencimento("")).toBe("");
  });
});

describe("montarPayloadPix", () => {
  it("recusa sem chave, sem beneficiário ou sem cidade", () => {
    expect(montarPayloadPix({ ...BASE, chave: "  " }).erro).toBe("sem-chave");
    expect(montarPayloadPix({ ...BASE, beneficiario: "" }).erro).toBe("sem-beneficiario");
    expect(montarPayloadPix({ ...BASE, cidade: "" }).erro).toBe("sem-cidade");
    expect(montarPayloadPix({ ...BASE, chave: "" }).payload).toBeNull();
  });

  it("monta os campos obrigatórios do padrão", () => {
    const { payload, erro } = montarPayloadPix({ ...BASE, valor: 120 });
    expect(erro).toBeNull();
    const campos = lerCampos(payload!);
    expect(campos["00"]).toBe("01"); // formato do payload
    expect(campos["52"]).toBe("0000"); // categoria não informada
    expect(campos["53"]).toBe("986"); // real
    expect(campos["58"]).toBe("BR");
    expect(campos["59"]).toBe("CLINICA MENINO JESUS");
    expect(campos["60"]).toBe("SAO PAULO");
  });

  it("leva a chave dentro do campo 26, com o GUI do Banco Central", () => {
    const { payload } = montarPayloadPix({ ...BASE, valor: 120 });
    const conta = lerCampos(payload!)["26"];
    const sub = lerCampos(conta);
    expect(sub["00"]).toBe("br.gov.bcb.pix");
    expect(sub["01"]).toBe("12345678000199");
  });

  it("grava o valor com duas casas e ponto decimal", () => {
    expect(lerCampos(montarPayloadPix({ ...BASE, valor: 120 }).payload!)["54"]).toBe("120.00");
    expect(lerCampos(montarPayloadPix({ ...BASE, valor: 155.5 }).payload!)["54"]).toBe("155.50");
    expect(lerCampos(montarPayloadPix({ ...BASE, valor: 7.5 }).payload!)["54"]).toBe("7.50");
  });

  it("omite o valor quando ele é zero, negativo ou ausente — QR fica em aberto", () => {
    expect(lerCampos(montarPayloadPix({ ...BASE, valor: 0 }).payload!)["54"]).toBeUndefined();
    expect(lerCampos(montarPayloadPix({ ...BASE, valor: -5 }).payload!)["54"]).toBeUndefined();
    expect(lerCampos(montarPayloadPix({ ...BASE }).payload!)["54"]).toBeUndefined();
  });

  it("leva o identificador da cobrança no campo 62", () => {
    const { payload } = montarPayloadPix({
      ...BASE,
      valor: 120,
      txid: txidMensalidade(20262655, 8),
    });
    expect(lerCampos(lerCampos(payload!)["62"])["05"]).toBe("CT20262655P8");
  });

  it("usa *** como identificador quando nenhum é informado", () => {
    const { payload } = montarPayloadPix({ ...BASE, valor: 120 });
    expect(lerCampos(lerCampos(payload!)["62"])["05"]).toBe("***");
  });

  it("inclui a descrição da mensalidade quando informada", () => {
    const { payload } = montarPayloadPix({
      ...BASE,
      valor: 120,
      descricao: "Mensalidade Contrato #20262655 - 08/2026",
    });
    const sub = lerCampos(lerCampos(payload!)["26"]);
    expect(sub["02"]).toBe("MENSALIDADE CONTRATO 20262655 08 2026");
  });

  it("fecha com um CRC que confere sobre o próprio payload", () => {
    const { payload } = montarPayloadPix({ ...BASE, valor: 120, txid: "CT1P1" });
    // O CRC é calculado sobre tudo, inclusive o "6304" que o antecede.
    const semCrc = payload!.slice(0, -4);
    expect(semCrc.endsWith("6304")).toBe(true);
    expect(payload!.slice(-4)).toBe(crc16(semCrc));
  });

  it("muda o CRC quando qualquer dado muda", () => {
    const a = montarPayloadPix({ ...BASE, valor: 120 }).payload!;
    const b = montarPayloadPix({ ...BASE, valor: 121 }).payload!;
    expect(a.slice(-4)).not.toBe(b.slice(-4));
  });

  it("todos os campos de primeiro nível somam o tamanho do payload", () => {
    // Garante que nenhum campo ficou com o tamanho declarado errado — é o erro
    // que faz o aplicativo do banco dizer "QR Code inválido".
    const { payload } = montarPayloadPix({
      ...BASE,
      valor: 99.9,
      txid: "CT9P9",
      descricao: "Mensalidade",
    });
    const campos = lerCampos(payload!);
    const somaDeclarada = Object.entries(campos).reduce(
      (soma, [, valor]) => soma + valor.length + 4,
      0,
    );
    expect(somaDeclarada).toBe(payload!.length);
  });
});
