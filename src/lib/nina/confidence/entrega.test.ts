/**
 * FASE 5 — a nota tem de pertencer à saída realmente entregue.
 *
 * O que estes testes protegem:
 *  - texto alterado depois da avaliação exige nova avaliação;
 *  - contexto alterado (revisão, evidências, política) também exige;
 *  - áudio, resumo falado e texto completo são conteúdos distintos;
 *  - "existe linha no banco" não é "o paciente recebeu";
 *  - saídas sem vínculo são detectadas, não silenciadas.
 */
import { describe, expect, it } from "vitest";
import {
  avaliacaoAindaVale,
  descreverSaida,
  entregaConfirmada,
  identidadeDaAvaliacao,
  identidadeEvidencias,
  saidaCorrespondeAoAvaliado,
  saidasSemVinculo,
  type ContextoDaAvaliacao,
} from "./entrega";

const base: ContextoDaAvaliacao = {
  textoFinal: "Sua consulta está marcada para quinta às 14h.",
  revisaoConversa: 7,
  evidenciasHash: "ev-1",
  policyVersion: "v5",
  engineVersion: "e2",
  representacao: "texto_completo",
};

describe("identidade da avaliação", () => {
  it("é estável para o mesmo texto e o mesmo contexto", () => {
    expect(identidadeDaAvaliacao(base).chave).toBe(identidadeDaAvaliacao({ ...base }).chave);
  });

  it("muda quando só o contexto muda, mesmo com o texto idêntico", () => {
    const outra = identidadeDaAvaliacao({ ...base, revisaoConversa: 8 });
    expect(outra.chave).not.toBe(identidadeDaAvaliacao(base).chave);
    expect(outra.textoHash).toBe(identidadeDaAvaliacao(base).textoHash);
  });

  it("muda quando as evidências mudam", () => {
    expect(identidadeDaAvaliacao({ ...base, evidenciasHash: "ev-2" }).chave).not.toBe(
      identidadeDaAvaliacao(base).chave,
    );
  });
});

describe("reaproveitamento da nota", () => {
  it("não reaproveita quando não existe avaliação anterior", () => {
    expect(avaliacaoAindaVale(null, base)).toEqual({
      vale: false,
      motivo: "sem_avaliacao_previa",
    });
  });

  it("reaproveita apenas com a mesma identidade completa", () => {
    const previa = { chaveIdentidade: identidadeDaAvaliacao(base).chave };
    expect(avaliacaoAindaVale(previa, base).vale).toBe(true);
  });

  it("recusa quando o texto mudou depois de avaliado", () => {
    const previa = { chaveIdentidade: identidadeDaAvaliacao(base).chave };
    const r = avaliacaoAindaVale(previa, { ...base, textoFinal: "Outro texto." });
    expect(r).toEqual({ vale: false, motivo: "texto_alterado_apos_avaliacao" });
  });

  it("recusa mesmo hash de texto quando o contexto mudou", () => {
    const anterior = identidadeDaAvaliacao(base);
    const previa = {
      chaveIdentidade: anterior.chave,
      textoAvaliadoHash: anterior.textoHash,
    };
    const r = avaliacaoAindaVale(previa, { ...base, policyVersion: "v6" });
    expect(r).toEqual({ vale: false, motivo: "contexto_alterado_apos_avaliacao" });
  });
});

describe("representações e entrega", () => {
  it("resumo falado não passa por avaliação do texto completo", () => {
    const saida = descreverSaida({
      representacao: "audio_resumo",
      texto: "Resumo curto.",
      estado: "envio_tentado",
    });
    const avaliacaoDoTexto = {
      textoAvaliadoHash: identidadeDaAvaliacao(base).textoHash,
      representacao: "texto_completo" as const,
    };
    expect(saidaCorrespondeAoAvaliado(saida, avaliacaoDoTexto)).toBe(false);
  });

  it("texto enviado idêntico ao avaliado confere", () => {
    const saida = descreverSaida({
      representacao: "texto_completo",
      texto: base.textoFinal,
      estado: "confirmada",
    });
    expect(
      saidaCorrespondeAoAvaliado(saida, {
        textoAvaliadoHash: identidadeDaAvaliacao(base).textoHash,
        representacao: "texto_completo",
      }),
    ).toBe(true);
  });

  it("linha persistida não é entrega confirmada", () => {
    expect(entregaConfirmada("persistida")).toBe(false);
    expect(entregaConfirmada("confirmada")).toBe(true);
  });

  it("detecta saída sem vínculo registrado", () => {
    const texto = descreverSaida({
      representacao: "texto_completo",
      texto: base.textoFinal,
      estado: "confirmada",
    });
    const audio = descreverSaida({
      representacao: "audio_resumo",
      texto: "Resumo curto.",
      estado: "confirmada",
    });
    expect(
      saidasSemVinculo([texto, audio], [
        { representacao: "texto_completo", estado: "confirmada" },
      ]),
    ).toEqual(["audio_resumo"]);
  });
});

describe("identidade das evidências", () => {
  it("independe da ordem das ferramentas", () => {
    const a = identidadeEvidencias([{ ferramenta: "agenda" }, { ferramenta: "catalogo" }]);
    const b = identidadeEvidencias([{ ferramenta: "catalogo" }, { ferramenta: "agenda" }]);
    expect(a).toBe(b);
  });

  it("é nula quando não houve evidência", () => {
    expect(identidadeEvidencias([])).toBeNull();
    expect(identidadeEvidencias(null)).toBeNull();
  });
});
