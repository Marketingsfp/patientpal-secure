import { describe, expect, it } from "bun:test";
import { montarResultadoCatalogo, type ServicoPublicado } from "../catalogo-conhecimento";
import { extrairEvidencia } from "./evidencia-extrator";
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
    ferramenta: "consultar_cadastro",
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
  it("forma explicitamente publicada mantém seu preço e não cria um resumo sem condição", () => {
    const { retorno, evidencia } = contexto([{ forma: "PIX", valor: 75 }]);
    expect(retorno.records[0]?.extras?.valor_referencia).toBeNull();
    expect(
      evidencia.fatos.filter((f) => f.campo === "preco").every((f) => f.chave?.condicoes !== null),
    ).toBe(true);
  });
});
