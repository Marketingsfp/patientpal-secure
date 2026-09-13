import { describe, expect, it } from "bun:test";

import {
  MOTIVO_SEM_NOTA_AVISO,
  notaAplicavelAoTextoFinal,
  validacaoDoEncaminhamento,
  versoesParaTrace,
  type VersaoTexto,
} from "../versoes-texto";

const versao = (p: Partial<VersaoTexto>): VersaoTexto => ({
  ordem: 1,
  etapa: "modelo.resposta",
  motivo: "texto original",
  origem: "modelo",
  hash: "h1",
  tamanho: 3,
  texto: "oi!",
  em: "2024-01-01T00:00:00.000Z",
  ...p,
});

describe("nota x texto entregue", () => {
  it("liga a nota quando o texto entregue é exatamente o avaliado", () => {
    const r = notaAplicavelAoTextoFinal({
      avaliacoes: [{ avaliacao: "answer_confidence", textoHash: "h1", score: 80 }],
      hashFinal: "h1",
    });
    expect(r.aplicavel).toBe(true);
    expect(r.motivo).toBe("hash_confere");
    expect(r.avaliacao?.score).toBe(80);
  });

  it("não apresenta a nota anterior quando o texto mudou depois da avaliação", () => {
    const r = notaAplicavelAoTextoFinal({
      avaliacoes: [{ avaliacao: "answer_confidence", textoHash: "h1", score: 80 }],
      hashFinal: "h2",
    });
    expect(r.aplicavel).toBe(false);
    expect(r.motivo).toBe("texto_alterado_apos_avaliacao");
    expect(r.avaliacao).toBeNull();
  });

  it("aviso operacional nunca herda a nota do texto bloqueado", () => {
    const r = notaAplicavelAoTextoFinal({
      avaliacoes: [{ avaliacao: "answer_confidence", textoHash: "h1", score: 20 }],
      hashFinal: "h1",
      avisoOperacional: true,
    });
    expect(r.aplicavel).toBe(false);
    expect(r.motivo).toBe("aviso_operacional_nao_avaliado");
  });

  it("sem avaliação e sem hash, declara a lacuna em vez de supor", () => {
    expect(notaAplicavelAoTextoFinal({ avaliacoes: [], hashFinal: "h1" }).motivo).toBe(
      "sem_avaliacao",
    );
    expect(
      notaAplicavelAoTextoFinal({
        avaliacoes: [{ avaliacao: "answer_confidence" }],
        hashFinal: null,
      }).motivo,
    ).toBe("sem_hash_para_comparar");
  });

  it("escolhe a avaliação da representação entregue quando há várias", () => {
    const r = notaAplicavelAoTextoFinal({
      avaliacoes: [
        { avaliacao: "answer_confidence", textoHash: "texto", representacao: "texto_completo" },
        { avaliacao: "answer_confidence", textoHash: "audio", representacao: "audio_resumo" },
      ],
      hashFinal: "audio",
    });
    expect(r.aplicavel).toBe(true);
    expect(r.avaliacao?.representacao).toBe("audio_resumo");
  });
});

describe("validação do aviso operacional", () => {
  it("distingue simulado, confirmado, falho e não verificado", () => {
    expect(validacaoDoEncaminhamento({ tipo: "simulado" })).toBe("encaminhamento_simulado");
    expect(validacaoDoEncaminhamento({ tipo: "real", confirmado: true })).toBe(
      "encaminhamento_confirmado",
    );
    expect(validacaoDoEncaminhamento({ tipo: "real", confirmado: false })).toBe(
      "encaminhamento_falhou",
    );
    expect(validacaoDoEncaminhamento(null)).toBe("nao_verificada");
  });

  it("tem motivo explícito para a ausência de porcentagem", () => {
    expect(MOTIVO_SEM_NOTA_AVISO).toBe("aviso_operacional_nao_avaliado_pelo_motor");
  });
});

describe("serialização das versões", () => {
  it("mostra hash sempre e o texto só com diagnóstico autorizado", () => {
    const v = [versao({}), versao({ ordem: 2, origem: "aviso_operacional", hash: "h2" })];
    const semDiag = versoesParaTrace(v, false);
    expect(semDiag).toHaveLength(2);
    expect(semDiag[0]).not.toHaveProperty("texto");
    expect(semDiag[0].hash).toBe("h1");
    expect(versoesParaTrace(v, true)[0].texto).toBe("oi!");
  });
});
