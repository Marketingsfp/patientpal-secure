import { describe, expect, it } from "bun:test";
import { assinaturaProposta, avaliarProntidao } from "../correcao-prontidao";
import type { PropostaCorrecao } from "../analise-erro";

const proposta = (over: Partial<PropostaCorrecao> = {}): PropostaCorrecao => ({
  camada: "catalogo",
  alvo: "Preço da consulta",
  valorAtual: "100",
  valorNovo: "120",
  justificativa: "Catálogo publicado divergia.",
  alcance: "Todas as clínicas",
  escopo: "global",
  ambiente: "producao",
  arquivos: [],
  patch: null,
  revisaoBase: null,
  aplicavelAutomaticamente: true,
  ...over,
});

const base = {
  statusAnalise: "done" as const,
  resultado: null,
  proposta: proposta(),
  temPermissao: true,
  executorDisponivel: true,
  execucaoEmCurso: false,
};

describe("prontidão para aplicar correção", () => {
  it("habilita quando análise concluída, proposta aplicável e permissão", () => {
    const r = avaliarProntidao(base);
    expect(r.habilitado).toBe(true);
    expect(r.codigo).toBe("pronto");
  });

  it("bloqueia sem permissão", () => {
    expect(avaliarProntidao({ ...base, temPermissao: false }).codigo).toBe("sem_permissao");
  });

  it("bloqueia com análise em andamento", () => {
    expect(avaliarProntidao({ ...base, statusAnalise: "processing" }).codigo).toBe(
      "analise_em_andamento",
    );
  });

  it("bloqueia execução duplicada", () => {
    expect(avaliarProntidao({ ...base, execucaoEmCurso: true }).codigo).toBe("execucao_em_curso");
  });

  it("bloqueia mudança de código sem patch concreto", () => {
    const r = avaliarProntidao({
      ...base,
      proposta: proposta({ camada: "fluxo", aplicavelAutomaticamente: false, patch: null }),
    });
    expect(r.codigo).toBe("informacao_insuficiente");
  });

  it("invalida proposta diferente da exibida", () => {
    const r = avaliarProntidao({ ...base, assinaturaExibida: "0000000000000000" });
    expect(r.codigo).toBe("proposta_desatualizada");
  });

  it("aceita a assinatura da própria proposta exibida", () => {
    const p = proposta();
    expect(
      avaliarProntidao({ ...base, proposta: p, assinaturaExibida: assinaturaProposta(p) })
        .habilitado,
    ).toBe(true);
  });

  it("muda de assinatura quando o valor proposto muda", () => {
    expect(assinaturaProposta(proposta())).not.toBe(
      assinaturaProposta(proposta({ valorNovo: "130" })),
    );
  });
});
