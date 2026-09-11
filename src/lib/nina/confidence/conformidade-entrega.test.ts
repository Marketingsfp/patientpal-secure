/**
 * Conformidade com instruções publicadas x CONTROLE DE ENVIO.
 *
 * Detectar a violação não basta: o candidato tem de ficar bloqueado mesmo com
 * nota média/alta e mesmo na etapa de observação.
 */
import { describe, expect, it } from "vitest";

import {
  conformidadeDasInstrucoes,
  decidirEntregaPorConformidade,
  instrucaoDeCorrecaoPorRegras,
  VALIDADOR_INSTRUCOES,
} from "./conformidade-entrega";
import { revisarSaida } from "./revisao-final";
import type { ResultadoConfianca } from "./types";

function avaliacao(
  status: "PASS" | "FAIL" | "UNKNOWN",
  obrigacoes: Record<string, unknown>[],
  extra?: Partial<ResultadoConfianca>,
): ResultadoConfianca {
  return {
    score: 92,
    level: "HIGH",
    decision: "ALLOW",
    validators: [
      {
        validator: VALIDADOR_INSTRUCOES,
        status,
        reasonCode: status === "FAIL" ? "OBRIGACAO_DESCUMPRIDA" : null,
        evidence: {
          obrigacoes,
          estadoRestricoes:
            status === "FAIL"
              ? "descumpridas"
              : status === "UNKNOWN"
                ? "indeterminadas"
                : "cumpridas",
        },
      },
    ],
    ...extra,
  } as unknown as ResultadoConfianca;
}

const violacaoCritica = {
  id: "obr-1",
  origem: "instrucoes_publicadas",
  status: "descumprida",
  motivo: "a resposta exigida literalmente não foi produzida",
  prioridade: "critica",
  regraId: "regra-9381",
};

describe("conformidade x entrega", () => {
  it("nota alta não compensa violação crítica de regra publicada", () => {
    const c = conformidadeDasInstrucoes(avaliacao("FAIL", [violacaoCritica]));
    expect(c.estado).toBe("descumprida");
    expect(c.bloqueante).toBe(true);
    expect(c.motivoBloqueio).toBe("REGRA_PUBLICADA_DESCUMPRIDA");

    const d = decidirEntregaPorConformidade({
      conformidade: c,
      tentativa: 0,
      limiteTentativas: 2,
    });
    expect(d.entregar).toBe(false);
    expect(d.corrigir).toBe(true);
    expect(d.efeitosExternosPermitidos).toBe(false);
  });

  it("exigência crítica não verificada também bloqueia", () => {
    const c = conformidadeDasInstrucoes(
      avaliacao("UNKNOWN", [{ ...violacaoCritica, status: "indeterminada" }]),
    );
    expect(c.bloqueante).toBe(true);
    expect(c.motivoBloqueio).toBe("REGRA_PUBLICADA_NAO_VERIFICADA");
  });

  it("regra cumprida ou não aplicável libera a entrega", () => {
    const c = conformidadeDasInstrucoes(
      avaliacao("PASS", [{ ...violacaoCritica, status: "cumprida" }]),
    );
    expect(c.bloqueante).toBe(false);
    expect(
      decidirEntregaPorConformidade({ conformidade: c, tentativa: 0, limiteTentativas: 2 })
        .entregar,
    ).toBe(true);
  });

  it("esgotado o limite de correções, o desfecho é atendimento humano", () => {
    const c = conformidadeDasInstrucoes(avaliacao("FAIL", [violacaoCritica]));
    const d = decidirEntregaPorConformidade({
      conformidade: c,
      tentativa: 2,
      limiteTentativas: 2,
    });
    expect(d.corrigir).toBe(false);
    expect(d.desfechoHumano).toBe(true);
    expect(d.entregar).toBe(false);
  });

  it("a instrução de correção não entrega a resposta pronta nem permite ferramentas", () => {
    const c = conformidadeDasInstrucoes(avaliacao("FAIL", [violacaoCritica]));
    const texto = instrucaoDeCorrecaoPorRegras(c);
    expect(texto).toMatch(/NÃO chame nenhuma ferramenta/);
    expect(texto).toMatch(/NÃO repita nenhuma operação/);
    expect(texto).not.toMatch(/ARQUITETURA_CONFIRMADA/);
  });

  it("a revisão final não aprova saída com violação bloqueante, mesmo na etapa A", () => {
    const r = revisarSaida({
      origem: "modelo",
      textoFinal: "Olá! Como posso ajudar?",
      avaliacao: avaliacao("FAIL", [violacaoCritica]),
      etapa: "A",
      risco: "informativo",
    });
    expect(r.bloqueiaEntrega).toBe(true);
    expect(r.aprovada).toBe(false);
    expect(r.conformidade.motivoBloqueio).toBe("REGRA_PUBLICADA_DESCUMPRIDA");
    expect(r.protecaoObrigatoria).toBe(true);
  });
});
