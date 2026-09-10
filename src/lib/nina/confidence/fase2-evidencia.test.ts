/**
 * FASE 2 — EVIDÊNCIA FACTUAL E VALIDADORES.
 *
 * O motor só pode considerar comprovado o que veio de um retorno REAL de
 * ferramenta. Sucesso técnico não é prova de fato; retorno vazio não é
 * "não temos"; retry recuperado não é falha do turno.
 */
import { describe, expect, it } from "bun:test";
import { extrairEvidencia, identidadeConsulta } from "./evidencia-extrator";
import { consolidarTentativas, corresponder, houveTruncamento } from "./evidencia";
import { verificarRespostaFinalDoTurno } from "./runtime";
import { turnoBase, FERRAMENTA_CATALOGO_OK } from "./fixtures/clinica-ficticia";
import type { FatoRecuperado } from "./evidencia";

const catalogoUltrassom = {
  ferramenta: "consultar_catalogo",
  capacidade: "searchKnowledgeBase",
  fonte: "base_conhecimento",
  success: true,
  dados: {
    procedimento: "Ultrassonografia abdominal",
    preco: "R$ 150,00",
    fonte: "catalogo_publicado",
  },
  args: { termo: "ultrassom" },
};

function fatosDoCatalogo(): FatoRecuperado[] {
  return extrairEvidencia(catalogoUltrassom as never).fatos;
}

describe("FASE 2 — fatos vêm do retorno real da ferramenta", () => {
  it("preço do catálogo vira fato com procedimento, valor e fonte", () => {
    const fatos = fatosDoCatalogo();
    const preco = fatos.find((f) => f.campo === "preco");
    expect(preco?.valor).toBe("R$ 150,00");
    expect(preco?.fonte).toBe("catalogo_publicado");
    expect(preco?.chave?.procedimento).toBe("Ultrassonografia abdominal");
  });

  it("valor diferente do fato (R$ 999 contra R$ 150) não passa", () => {
    const r = verificarRespostaFinalDoTurno(
      turnoBase({
        acao: "informar_valor",
        tipoTurno: "INFORMACAO",
        catalogoEncontrou: true,
        ferramentas: [FERRAMENTA_CATALOGO_OK],
        fatos: fatosDoCatalogo(),
      }),
      "A ultrassonografia abdominal custa R$ 999,00.",
    );
    expect(r.decision).not.toBe("ALLOW");
  });

  it("mesmo valor do fato (R$ 150) é liberado", () => {
    const r = verificarRespostaFinalDoTurno(
      turnoBase({
        acao: "informar_valor",
        tipoTurno: "INFORMACAO",
        catalogoEncontrou: true,
        ferramentas: [FERRAMENTA_CATALOGO_OK],
        fatos: fatosDoCatalogo(),
      }),
      "A ultrassonografia abdominal custa R$ 150,00.",
    );
    expect(r.decision).toBe("ALLOW");
  });

  it("endereço nunca consultado não pode ser afirmado", () => {
    const r = verificarRespostaFinalDoTurno(
      turnoBase({
        acao: "responder_informacao",
        tipoTurno: "INFORMACAO",
        catalogoEncontrou: true,
        ferramentas: [FERRAMENTA_CATALOGO_OK],
        fatos: fatosDoCatalogo(),
      }),
      "Estamos na Rua das Palmeiras, 120, centro.",
    );
    expect(r.decision).not.toBe("ALLOW");
  });
});

describe("FASE 2 — status da consulta", () => {
  it("falha técnica não vira 'não temos'", () => {
    const ex = extrairEvidencia({
      ferramenta: "consultar_catalogo",
      capacidade: "searchKnowledgeBase",
      fonte: "base_conhecimento",
      success: false,
      erro: "timeout",
      dados: null,
    } as never);
    expect(ex.consulta.status).toBe("falha");
    expect(ex.fatos).toHaveLength(0);
  });

  it("mesma ferramenta com mesmos argumentos é a mesma consulta", () => {
    expect(identidadeConsulta("x", { b: 1, a: 2 })).toBe(identidadeConsulta("x", { a: 2, b: 1 }));
    expect(identidadeConsulta("x", { a: 1 })).not.toBe(identidadeConsulta("x", { a: 2 }));
  });

  it("retry recuperado consolida em uma consulta bem-sucedida", () => {
    const consultas = consolidarTentativas([
      { id: "c1", consulta: "agenda", capacidade: "checkAvailability", status: "falha", tentativas: 1, falhasAnteriores: [], erro: "timeout" },
      { id: "c1", consulta: "agenda", capacidade: "checkAvailability", status: "com_itens", tentativas: 1, falhasAnteriores: [] },
    ]);
    expect(consultas).toHaveLength(1);
    expect(consultas[0]?.status).toBe("com_itens");
    expect(consultas[0]?.falhasAnteriores).toContain("timeout");
  });

  it("retorno truncado é avaliação incompleta", () => {
    expect(
      houveTruncamento([
        { id: "c1", consulta: "catalogo", capacidade: "listCatalog", status: "com_itens", tentativas: 1, falhasAnteriores: [], truncado: true },
      ]),
    ).toBe(true);
  });
});

describe("FASE 2 — correspondência entre afirmação e fato", () => {
  it("fato de outro procedimento não sustenta a afirmação", () => {
    const r = corresponder(fatosDoCatalogo(), {
      entidades: ["procedimento"],
      campo: "preco",
      valor: "R$ 150,00",
      monetario: true,
      chave: { procedimento: "Ressonância magnética" },
    } as never);
    expect(r.situacao).not.toBe("confirmado");
  });

  it("mesmo procedimento com valor divergente é divergência, não ausência", () => {
    const r = corresponder(fatosDoCatalogo(), {
      entidades: ["procedimento"],
      campo: "preco",
      valor: "R$ 999,00",
      monetario: true,
      chave: { procedimento: "Ultrassonografia abdominal" },
    } as never);
    expect(r.situacao).toBe("divergente");
  });
});
