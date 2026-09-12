/**
 * FASE 5 — o relatório vem dos FATOS do executor, não da afirmação do modelo.
 */
import { describe, expect, it } from "vitest";
import { montarRelatorio, type EntradaRelatorio } from "../correcao-relatorio";
import type { PropostaCorrecao } from "../analise-erro";

const proposta = (over: Partial<PropostaCorrecao> = {}): PropostaCorrecao => ({
  camada: "catalogo",
  alvo: "Consulta clínico geral · preço",
  valorAtual: "150,00",
  valorNovo: "180,00",
  justificativa: "A Nina informou preço desatualizado.",
  alcance: "Todas as conversas desta clínica.",
  escopo: "local",
  ambiente: "producao",
  arquivos: [],
  patch: null,
  revisaoBase: null,
  aplicavelAutomaticamente: true,
  ...over,
});

const base = (over: Partial<EntradaRelatorio> = {}): EntradaRelatorio => ({
  proposta: proposta(),
  status: "aplicado",
  resultadoFinal: "verificado",
  aplicavel: true,
  publicado: true,
  valorAnterior: "150,00",
  motivo: "Correção aplicada.",
  passos: [
    { ordem: 1, ferramenta: "sistema", titulo: "Proposta autorizada", detalhe: "…", ok: true, em: "2026-09-12T01:00:00Z" },
  ],
  teste: {
    executado: true,
    aprovado: true,
    pergunta: "Quanto custa a consulta?",
    resposta: "R$ 180,00",
    motivo: "A resposta passou a trazer a informação corrigida.",
  },
  verificacao: { conferido: true, alvo: "Catálogo", motivo: "Valor efetivo confere.", revisao: "12" },
  codigo: null,
  evidencias: {
    analiseId: "an-1",
    pacoteHash: "abc123",
    pacoteRevisao: 2,
    origem: "persistido",
    ambiente: "producao",
    entradas: 3,
    lacunas: [],
    cortes: [],
  },
  trabalho: {
    execucaoId: "ex-1",
    solicitadoPor: "user-1",
    modelo: "openai/gpt-5.6-sol",
    provedor: "Lovable AI Gateway",
    inicio: "2026-09-12T01:00:00Z",
    fim: "2026-09-12T01:00:42Z",
    idempotenciaChave: "k1",
    tentativa: 1,
  },
  ...over,
});

describe("relatório da correção", () => {
  it("mostra corrigido e verificado com antes/depois real e reversão do catálogo", () => {
    const r = montarRelatorio(base());
    expect(r.resultado).toBe("corrigido_verificado");
    expect(r.alteracoes).toHaveLength(1);
    expect(r.alteracoes[0]).toMatchObject({ tipo: "catalogo", antes: "150,00", depois: "180,00", efetivada: true });
    expect(r.trabalho.duracaoMs).toBe(42000);
    expect(r.reversao).toMatchObject({ possivel: true, tipo: "catalogo" });
    expect(r.versao.publicacaoConfirmada).toBe(true);
  });

  it("camada de código sem serviço de execução fica pendente de integração, não aplicada", () => {
    const r = montarRelatorio(
      base({
        proposta: proposta({
          camada: "fluxo",
          aplicavelAutomaticamente: false,
          arquivos: ["src/lib/whatsapp.server.ts"],
          patch: "--- a\n+++ b\n@@\n-antigo\n+novo",
        }),
        aplicavel: false,
        publicado: false,
        status: "pendente_tecnico",
        resultadoFinal: "aguardando_publicacao",
        verificacao: null,
        teste: { executado: false, aprovado: false, pergunta: null, resposta: null, motivo: "Teste ainda não executado." },
        codigo: {
          disponivel: false,
          aplicado: false,
          publicado: false,
          revisaoBase: null,
          revisaoNova: null,
          testes: null,
          motivo: "Serviço de execução de código não configurado.",
          dependencia: "Falta serviço de execução.",
        },
      }),
    );
    expect(r.resultado).toBe("pendente_integracao");
    expect(r.alteracoes[0]).toMatchObject({ tipo: "codigo", efetivada: false });
    expect(r.alteracoes[0]?.diff).toContain("+novo");
    expect(r.reversao.possivel).toBe(false);
    expect(r.testes.naoRealizadas.join(" ")).toContain("Teste em homologação não foi executado.");
  });

  it("falha do executor não vira sucesso mesmo com proposta preenchida", () => {
    const r = montarRelatorio(base({ status: "falhou", resultadoFinal: "falhou", publicado: false }));
    expect(r.resultado).toBe("falhou");
    expect(r.explicacao.comportamentoEsperado).toContain("Nada mudou");
  });

  it("prompt publicado registra versão anterior e nova reais", () => {
    const r = montarRelatorio(
      base({
        proposta: proposta({ camada: "modelo", alvo: "Arquitetura · regra de saudação" }),
        versaoPrompt: { anterior: "9", nova: "10" },
      }),
    );
    expect(r.versao).toMatchObject({ anterior: "9", nova: "10", publicado: true });
    expect(r.reversao.tipo).toBe("prompt");
  });
});
