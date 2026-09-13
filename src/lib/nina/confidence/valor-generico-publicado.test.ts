import { describe, expect, it } from "bun:test";
import { montarResultadoCatalogo, type ServicoPublicado } from "../catalogo-conhecimento";
import { extrairEvidencia } from "./evidencia-extrator";
import { avaliarGrounding } from "./claims";
import type { ContextoConfianca } from "./types";

const servico: ServicoPublicado = {
  id: "exame-teste",
  nome: "Eletrocardiograma",
  valor: 75,
  formas_pagamento: null,
  executantes: [],
  valor_observacao: null,
  descricao_publica: null,
  preparo: null,
  restricoes: null,
};

function contexto(formas_pagamento: unknown = null) {
  const retorno = montarResultadoCatalogo({
    servicos: [{ ...servico, formas_pagamento }],
    profissionais: [],
    hojeISO: "2026-09-13",
  });
  const evidencia = extrairEvidencia({
    ferramenta: "consultar_base_conhecimento",
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    success: true,
    dados: retorno,
  });
  const ctx: ContextoConfianca = {
    requestedAction: null,
    intent: "informacao",
    toolResults: [],
    fatos: evidencia.fatos,
    consultas: [evidencia.consulta],
    retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true }],
    businessContext: {
      ambiente: "homologacao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
  };
  return { retorno, evidencia, ctx };
}

describe("valor publicado sem forma de pagamento", () => {
  it("preserva valor de referência no mapper e gera fato sem condição", () => {
    const { retorno, evidencia, ctx } = contexto();
    expect(retorno.records[0]?.preco_dinheiro).toBeNull();
    expect(retorno.records[0]?.extras?.valor_referencia).toBe(75);
    expect(retorno.records[0]?.extras?.formas_pagamento).toBeNull();
    expect(evidencia.fatos.find((f) => f.campo === "preco")).toMatchObject({
      valor: "75",
      chave: { procedimento: "Eletrocardiograma", condicoes: null },
    });
    expect(
      avaliarGrounding(ctx, "O eletrocardiograma custa R$ 75,00.").claims.find(
        (c) => c.tipo === "valor",
      )?.suportado,
    ).toBe(true);
  });

  it.each(["dinheiro", "PIX", "cartão"])("valor genérico não comprova a forma %s", (forma) => {
    const { ctx } = contexto();
    expect(
      avaliarGrounding(ctx, `O eletrocardiograma custa R$ 75,00 no ${forma}.`).claims.find(
        (c) => c.tipo === "valor",
      )?.suportado,
    ).toBe(false);
  });

  it("forma explicitamente publicada mantém seu preço e não cria um resumo sem condição", () => {
    const { retorno, evidencia } = contexto([{ forma: "PIX", valor: 75 }]);
    expect(retorno.records[0]?.extras?.valor_referencia).toBeNull();
    expect(
      evidencia.fatos.filter((f) => f.campo === "preco").every((f) => f.chave?.condicoes !== null),
    ).toBe(true);
  });
});
