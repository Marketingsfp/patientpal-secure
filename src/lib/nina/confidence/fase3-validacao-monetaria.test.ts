/**
 * FASE 3 — VALIDAÇÃO MONETÁRIA POR FORMA DE PAGAMENTO.
 *
 * Dados fictícios. Sem banco, sem rede, sem modelo, sem mensagem real.
 * Nenhum tratamento especial por exame: os casos usam exames diferentes.
 */
import { describe, expect, it } from "bun:test";
import { montarResultadoConhecimento } from "../knowledge-contract";
import { extrairEvidencia, type RetornoFerramenta } from "./evidencia-extrator";
import { avaliarGrounding } from "./claims";
import type { FatoRecuperado } from "./evidencia";
import type { ContextoConfianca } from "./types";

type Registro = Record<string, unknown>;

function fatosDe(registros: Registro[]): FatoRecuperado[] {
  const retorno: RetornoFerramenta = {
    ferramenta: "buscar_conhecimento",
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    success: true,
    dados: montarResultadoConhecimento({
      registros,
      base: { versao: 6, arquivo: "catalogo.xlsx" },
    }),
    args: { termo: "preco" },
  };
  return extrairEvidencia(retorno).fatos;
}

function contexto(fatos: FatoRecuperado[]): ContextoConfianca {
  return {
    requestedAction: null,
    fatos,
    retrievedSources: [
      { tipo: "catalogo_publicado", referencia: "cat", temConteudo: true, publicado: true },
    ],
    toolResults: [
      {
        nome: "buscar_conhecimento",
        fonte: "catalogo_publicado",
        capacidade: "searchKnowledgeBase",
        success: true,
        temConteudo: true,
        erro: null,
      },
    ],
    businessContext: {
      ambiente: "producao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
  };
}

/** Situação de cada afirmação monetária, na ordem em que aparece no texto. */
function monetarias(registros: Registro[], resposta: string) {
  const r = avaliarGrounding(contexto(fatosDe(registros)), resposta);
  return r.claims
    .filter((c) => c.tipo === "valor")
    .map((c) => ({
      trecho: c.trecho,
      situacao: c.situacao,
      suportado: c.suportado,
      valorDaFonte: c.valorDaFonte ?? null,
      motivo: c.motivo ?? "",
    }));
}

const ECG: Registro = {
  id: "reg-ecg",
  procedimento: "Eletrocardiograma",
  medico: "Dra. Marina",
  preco_dinheiro: 51,
  preco_cartao: 60,
};

describe("FASE 3 — critérios de aceite (fonte: dinheiro 51, cartão 60)", () => {
  it("dinheiro 51 / cartão 60: as duas afirmações passam", () => {
    const r = monetarias(
      [ECG],
      "O eletrocardiograma custa R$ 51,00 no dinheiro e R$ 60,00 no cartão.",
    );
    expect(r).toHaveLength(2);
    expect(r.every((c) => c.situacao === "confirmado" && c.suportado)).toBe(true);
  });

  it("dinheiro 60 / cartão 51: preços trocados são detectados nas duas", () => {
    const r = monetarias(
      [ECG],
      "O eletrocardiograma custa R$ 60,00 no dinheiro e R$ 51,00 no cartão.",
    );
    expect(r).toHaveLength(2);
    expect(r.every((c) => c.situacao === "divergente" && !c.suportado)).toBe(true);
    expect(r[0]!.valorDaFonte).toBe("51");
    expect(r[1]!.valorDaFonte).toBe("60");
  });

  it("cartão 999: divergência detectada", () => {
    const r = monetarias([ECG], "No cartão o eletrocardiograma sai por R$ 999,00.");
    expect(r).toHaveLength(1);
    expect(r[0]!.situacao).toBe("divergente");
    expect(r[0]!.valorDaFonte).toBe("60");
  });

  it("fonte só com dinheiro: afirmar o mesmo valor no cartão não é comprovado", () => {
    const r = monetarias(
      [{ id: "r", procedimento: "Eletrocardiograma", preco_dinheiro: 51 }],
      "No cartão o eletrocardiograma custa R$ 51,00.",
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.suportado).toBe(false);
    expect(r[0]!.situacao).toBe("fora_do_escopo");
    expect(r[0]!.motivo).toContain("cartao");
  });
});

describe("FASE 3 — a validação vale para qualquer exame e qualquer valor", () => {
  const BASE: Registro[] = [
    { id: "r1", procedimento: "Ultrassonografia", preco_dinheiro: 120, preco_cartao: 140 },
    { id: "r2", procedimento: "Raio-X", preco_dinheiro: 60, preco_cartao: 75 },
  ];

  it("o número existir na base não comprova o preço do exame perguntado", () => {
    const r = monetarias(BASE, "A ultrassonografia custa R$ 60,00 no dinheiro.");
    expect(r[0]!.situacao).toBe("divergente");
    expect(r[0]!.valorDaFonte).toBe("120");
  });

  it("preços trocados entre exames são detectados", () => {
    const r = monetarias(
      BASE,
      "A ultrassonografia custa R$ 75,00 no cartão. O raio-x custa R$ 140,00 no cartão.",
    );
    expect(r.map((c) => c.situacao)).toEqual(["divergente", "divergente"]);
  });

  it("valores corretos de exames diferentes passam juntos", () => {
    const r = monetarias(
      BASE,
      "A ultrassonografia custa R$ 120,00 no dinheiro. O raio-x custa R$ 75,00 no cartão.",
    );
    expect(r.every((c) => c.situacao === "confirmado")).toBe(true);
  });

  it("pix não é comprovado por preço de dinheiro", () => {
    const r = monetarias([ECG], "No pix o eletrocardiograma custa R$ 51,00.");
    expect(r[0]!.suportado).toBe(false);
    expect(r[0]!.motivo).toContain("pix");
  });
});

describe("FASE 3 — diferenças legítimas por profissional e condição", () => {
  const POR_MEDICO: Registro[] = [
    {
      id: "m1",
      procedimento: "Consulta",
      medico: "Dra. Marina",
      preco_dinheiro: 200,
      preco_cartao: 220,
    },
    {
      id: "m2",
      procedimento: "Consulta",
      medico: "Dr. Paulo",
      preco_dinheiro: 300,
      preco_cartao: 330,
    },
  ];

  it("cada profissional é conferido com o próprio preço", () => {
    const r = monetarias(
      POR_MEDICO,
      "A consulta com a Dra. Marina custa R$ 200,00 no dinheiro. Com o Dr. Paulo, a consulta custa R$ 330,00 no cartão.",
    );
    expect(r.every((c) => c.situacao === "confirmado")).toBe(true);
  });

  it("preço trocado entre profissionais é detectado", () => {
    const r = monetarias(POR_MEDICO, "A consulta com a Dra. Marina custa R$ 300,00 no dinheiro.");
    expect(r[0]!.situacao).toBe("divergente");
    expect(r[0]!.valorDaFonte).toBe("200");
  });

  it("diferença entre dinheiro e cartão não vira conflito entre fontes", () => {
    const r = avaliarGrounding(
      contexto(fatosDe([ECG])),
      "O eletrocardiograma custa R$ 51,00 no dinheiro e R$ 60,00 no cartão.",
    );
    const conflitos = r.claims.filter((c) => /conflito|conflict/i.test(c.motivo ?? ""));
    expect(conflitos).toHaveLength(0);
  });
});
