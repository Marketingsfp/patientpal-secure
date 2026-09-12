/**
 * FASE 6 — VERIFICAÇÃO DO FLUXO COMPLETO DA CORREÇÃO ASSISTIDA.
 *
 * Cada cenário do pedido vira um teste sobre as FUNÇÕES REAIS do fluxo
 * (prontidão do botão, chave de idempotência, pacote de evidências,
 * relatório do executor, regras publicadas, baixa confiabilidade,
 * finalização/transporte). Só o banco é isolado em memória.
 *
 * Nada aqui envia mensagem, publica, chama modelo ou toca dado clínico.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import {
  assinaturaProposta,
  avaliarProntidao,
  type EntradaProntidao,
} from "../correcao-prontidao";
import { chaveIdempotencia, MAX_TENTATIVAS, TEMPO_MAXIMO_MS } from "../correcao-limites";
import { montarRelatorio, type EntradaRelatorio } from "../correcao-relatorio";
import { montarPacoteInvestigacao } from "../evidencias-pacote.server";
import { mesmoConjuntoDeEvidencias } from "../evidencias-pacote";
import { integracaoCodigoDisponivel } from "../executor-codigo.server";
import { extrairRegrasPublicadas } from "../confidence/regras-publicadas";
import {
  saidaControladaBaixaConfianca,
  AVISO_ENCAMINHAMENTO_HUMANO,
  AVISO_ENCAMINHAMENTO_SIMULADO,
  AVISO_ENCAMINHAMENTO_FALHOU,
} from "../confidence/baixa-confiabilidade";
import { criarResultado } from "../resposta/contrato";
import {
  finalizarResposta,
  limparFinalizacoes,
  ultimaFinalizacaoDoTurno,
} from "../resposta/finalizacao.server";
import type { PropostaCorrecao } from "../analise-erro";

const CLINICA = "7570ddde-8c3c-4b32-ba72-cf12b2a6c940";
const OUTRA_CLINICA = "00000000-0000-0000-0000-000000000999";

/* ------------------------------------------------------------------ */
/* Apoio                                                               */
/* ------------------------------------------------------------------ */

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

const prontidao = (over: Partial<EntradaProntidao> = {}): EntradaProntidao => ({
  statusAnalise: "done",
  resultado: null,
  proposta: proposta(),
  temPermissao: true,
  executorDisponivel: true,
  execucaoEmCurso: false,
  ...over,
});

const relatorio = (over: Partial<EntradaRelatorio> = {}): EntradaRelatorio => ({
  proposta: proposta(),
  status: "aplicado",
  resultadoFinal: "verificado",
  aplicavel: true,
  publicado: true,
  valorAnterior: "150,00",
  motivo: "Correção aplicada.",
  passos: [],
  teste: {
    executado: true,
    aprovado: true,
    pergunta: "Quanto custa a consulta?",
    resposta: "R$ 180,00",
    motivo: "A resposta trouxe o valor corrigido.",
  },
  verificacao: {
    conferido: true,
    alvo: "Catálogo",
    esperado: "180,00",
    efetivo: "180,00",
    revisao: "12",
    motivo: "Valor efetivo confere.",
  },
  codigo: null,
  evidencias: {
    analiseId: "an-1",
    pacoteHash: "abc123",
    pacoteRevisao: 1,
    origem: "persistido",
    ambiente: "producao",
    entradas: 2,
    lacunas: [],
    cortes: [],
  },
  trabalho: {
    execucaoId: "ex-1",
    solicitadoPor: "user-1",
    modelo: "openai/gpt-5.6-sol",
    provedor: "Lovable AI Gateway",
    inicio: "2026-09-12T01:00:00Z",
    fim: "2026-09-12T01:00:30Z",
    idempotenciaChave: "k1",
    tentativa: 1,
  },
  ...over,
});

/** Banco em memória: devolve linhas por tabela, respeitando `.eq("clinica_id")`. */
function bancoFake(tabelas: Record<string, Record<string, any>[]>) {
  const criar = (tabela: string) => {
    const filtros: [string, unknown][] = [];
    let dentro: [string, unknown[]] | null = null;
    const linhas = () => {
      let r = tabelas[tabela] ?? [];
      for (const [c, v] of filtros) r = r.filter((l) => l[c] === v);
      if (dentro) r = r.filter((l) => dentro![1].includes(l[dentro![0]]));
      return r;
    };
    const api: any = {
      select: () => api,
      order: () => api,
      limit: () => api,
      gte: () => api,
      lte: () => api,
      eq: (c: string, v: unknown) => {
        filtros.push([c, v]);
        return api;
      },
      in: (c: string, v: unknown[]) => {
        dentro = [c, v];
        return api;
      },
      maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
      then: (ok: (r: any) => unknown) => Promise.resolve({ data: linhas(), error: null }).then(ok),
    };
    return api;
  };
  return { from: (t: string) => criar(t) };
}

/* ------------------------------------------------------------------ */
/* 1–4, 6, 7, 16 — quando o botão pode ser acionado                    */
/* ------------------------------------------------------------------ */

describe("FASE 6 — habilitação do botão", () => {
  it("1. antes de analisar: indisponível, com motivo claro", () => {
    const r = avaliarProntidao(prontidao({ statusAnalise: null, proposta: null }));
    expect(r.habilitado).toBe(false);
    expect(r.codigo).toBe("sem_analise");
    expect(r.motivo).toContain("Analisar com IA");
  });

  it("2. análise concluída com proposta aplicável: disponível para autorizado", () => {
    const p = proposta();
    const r = avaliarProntidao(prontidao({ proposta: p, assinaturaExibida: assinaturaProposta(p) }));
    expect(r).toMatchObject({ habilitado: true, codigo: "pronto" });
  });

  it("3. sem causa manual preenchida, a análise estruturada basta", () => {
    // Nenhum campo de diagnóstico/aprovação manual participa da decisão.
    const r = avaliarProntidao(prontidao());
    expect(r.habilitado).toBe(true);
  });

  it("4. hipótese sem evidência suficiente não habilita alteração especulativa", () => {
    const semMudanca = avaliarProntidao(
      prontidao({ proposta: proposta({ valorNovo: "  " }) }),
    );
    expect(semMudanca).toMatchObject({ habilitado: false, codigo: "informacao_insuficiente" });

    const semPatch = avaliarProntidao(
      prontidao({
        proposta: proposta({ camada: "fluxo", aplicavelAutomaticamente: false, patch: null }),
      }),
    );
    expect(semPatch.codigo).toBe("informacao_insuficiente");

    const semErro = avaliarProntidao(
      prontidao({ proposta: null, resultado: { veredito: "sem_erro" } as never }),
    );
    expect(semErro.codigo).toBe("nenhuma_alteracao_necessaria");
  });

  it("6. proposta ou pacote mudou: aplicação recusada, sem sobrescrever o recente", () => {
    const antiga = proposta();
    const nova = proposta({ valorNovo: "200,00" });
    const r = avaliarProntidao(
      prontidao({ proposta: nova, assinaturaExibida: assinaturaProposta(antiga) }),
    );
    expect(r).toMatchObject({ habilitado: false, codigo: "proposta_desatualizada" });

    // Quantidade de evidências não prova equivalência: só o hash responde.
    expect(mesmoConjuntoDeEvidencias({ hash: "a" }, { hash: "b" })).toBe(false);
    expect(mesmoConjuntoDeEvidencias({ hash: "a" }, { hash: null })).toBeNull();
  });

  it("7. duplo clique, refresh e retomada produzem a MESMA chave de trabalho", () => {
    const p = proposta();
    const arg = {
      feedbackId: "fb-1",
      analiseId: "an-1",
      assinaturaProposta: assinaturaProposta(p),
      pacoteHash: "abc123",
    };
    expect(chaveIdempotencia(arg)).toBe(chaveIdempotencia({ ...arg }));
    expect(chaveIdempotencia(arg)).not.toBe(
      chaveIdempotencia({ ...arg, assinaturaProposta: assinaturaProposta(proposta({ valorNovo: "9" })) }),
    );
    // Uma execução em curso barra a segunda aplicação.
    expect(avaliarProntidao(prontidao({ execucaoEmCurso: true })).codigo).toBe("execucao_em_curso");
    expect(MAX_TENTATIVAS).toBe(3);
    expect(TEMPO_MAXIMO_MS).toBe(180000);
  });

  it("16. permissão e escopo: sem permissão não aplica; alcance global fica visível", () => {
    expect(avaliarProntidao(prontidao({ temPermissao: false })).codigo).toBe("sem_permissao");

    const r = montarRelatorio(
      relatorio({
        proposta: proposta({
          camada: "fluxo",
          escopo: "global",
          alcance: "Código compartilhado: vale para todas as clínicas.",
          aplicavelAutomaticamente: false,
          arquivos: ["src/lib/whatsapp.server.ts"],
          patch: "--- a\n+++ b",
        }),
        aplicavel: false,
        publicado: false,
        resultadoFinal: "aguardando_publicacao",
        codigo: {
          disponivel: false,
          aplicado: false,
          publicado: false,
          revisaoBase: null,
          revisaoNova: null,
          testes: null,
          motivo: "Sem serviço de execução.",
          dependencia: "Serviço de execução de código não configurado.",
        },
      }),
    );
    expect(r.resultado).toBe("pendente_integracao");
    expect(r.alteracoes[0]?.tipo).toBe("codigo");
    expect(r.alteracoes[0]?.efetivada).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 5 — as mensagens vinculadas chegam ao pacote                         */
/* ------------------------------------------------------------------ */

describe("FASE 6 — pacote de evidências", () => {
  const db = bancoFake({
    nina_feedback_erros: [
      {
        id: "fb-1",
        clinica_id: CLINICA,
        conversa_id: "conv-1",
        mensagem_id: "msg-2",
        mensagem_texto: "resposta da Nina",
        pergunta_texto: "ola bom dia",
        categoria: "resposta_errada",
        root_cause: null,
        status: "aberto",
        execucao_id: "exec-1",
        created_at: "2026-09-12T01:20:00Z",
      },
    ],
    nina_feedback_analises: [
      {
        id: "an-1",
        clinica_id: CLINICA,
        feedback_id: "fb-1",
        versao: 1,
        criterios_versao: "v1",
        modelo: "openai/gpt-5.6-sol",
        status: "done",
        conclusao: "Regra condicional aplicada fora da condição.",
        resultado: { veredito: "erro", causaProvavel: "regra condicional" },
      },
    ],
    nina_execucoes: [
      {
        id: "exec-1",
        clinica_id: CLINICA,
        conversation_id: "conv-1",
        model: "google/gemini-3.7-flash",
        created_at: "2026-09-12T01:21:00Z",
        mensagens_entrada: ["msg-1", "msg-sumida"],
        success: true,
        handoff: false,
        error_category: null,
      },
    ],
    whatsapp_mensagens: [
      {
        id: "msg-1",
        clinica_id: CLINICA,
        body: "ola bom dia",
        created_at: "2026-09-12T01:20:59Z",
      },
      // Mesma mensagem em outra clínica: não pode vazar para o pacote.
      { id: "msg-x", clinica_id: OUTRA_CLINICA, body: "de outra clínica", created_at: null },
    ],
  });

  it("5. fragmentos da pergunta viram entradas com IDs, ordem e ausências declaradas", async () => {
    const pacote = await montarPacoteInvestigacao(db, { clinicaId: CLINICA, feedbackId: "fb-1" });

    const ids = pacote.entradas.map((e) => e.id);
    expect(ids).toContain("msg-1");
    expect(ids).toContain("msg-sumida");
    expect(ids).not.toContain("msg-x");

    const real = pacote.entradas.find((e) => e.id === "msg-1")!;
    expect(real.texto).toBe("ola bom dia");
    expect(real.ausente).toBe(false);
    expect(real.execucaoId).toBe("exec-1");

    // Ausência é lacuna declarada, não some e não é preenchida com outra mensagem.
    const ausente = pacote.entradas.find((e) => e.id === "msg-sumida")!;
    expect(ausente.ausente).toBe(true);
    expect(ausente.texto).toBe("");

    expect(pacote.hash).toBeTruthy();
    expect(pacote.entradas.at(-1)?.ausente).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 8–11, 17 — resultado honesto do executor                             */
/* ------------------------------------------------------------------ */

describe("FASE 6 — resultado do executor", () => {
  it("8. Sol indisponível, timeout, HTTP 400 ou falha de ferramenta não vira 'corrigido'", () => {
    for (const motivo of [
      "Modelo indisponível (503).",
      "Tempo máximo da correção excedido.",
      "Provedor recusou a requisição (HTTP 400).",
      "Ferramenta de catálogo falhou.",
    ]) {
      const r = montarRelatorio(
        relatorio({
          status: "falhou",
          resultadoFinal: "falhou",
          publicado: false,
          verificacao: null,
          motivo,
          teste: { executado: false, aprovado: false, pergunta: null, resposta: null, motivo },
        }),
      );
      expect(r.resultado).toBe("falhou");
      expect(r.versao.publicacaoConfirmada).toBe(false);
      expect(r.explicacao.comportamentoEsperado).toContain("Nada mudou");
      expect(r.alteracoes.some((a) => a.efetivada)).toBe(false);
    }
  });

  it("9. configuração: versão publicada e valor relido batem com o antes/depois exibido", () => {
    const r = montarRelatorio(
      relatorio({
        proposta: proposta({ camada: "modelo", alvo: "Arquitetura · regra de saudação" }),
        versaoPrompt: { anterior: "9", nova: "10" },
        verificacao: {
          conferido: true,
          alvo: "Prompt publicado",
          esperado: "texto novo",
          efetivo: "texto novo",
          revisao: "10",
          motivo: "Valor efetivo confere com o publicado.",
        },
      }),
    );
    expect(r.versao).toMatchObject({ anterior: "9", nova: "10", publicacaoConfirmada: true });
    expect(r.versao.revisaoAtual).toBe("10");
    expect(r.alteracoes[0]).toMatchObject({ antes: "150,00", depois: "180,00", efetivada: true });
  });

  it("10. código: patch, testes, revisão e publicação só aparecem quando o serviço confirma", () => {
    const r = montarRelatorio(
      relatorio({
        proposta: proposta({
          camada: "fluxo",
          aplicavelAutomaticamente: false,
          arquivos: ["src/lib/whatsapp.server.ts"],
          patch: "--- a\n+++ b\n@@\n-system\n+user",
          revisaoBase: "rev-1",
        }),
        aplicavel: false,
        publicado: false,
        resultadoFinal: "verificado",
        codigo: {
          disponivel: true,
          aplicado: true,
          publicado: true,
          revisaoBase: "rev-1",
          revisaoNova: "rev-2",
          testes: "3.400 testes aprovados; build ok",
          motivo: "Patch aplicado, testado e publicado pelo serviço externo.",
          dependencia: null,
        },
      }),
    );
    expect(r.resultado).toBe("corrigido_verificado");
    expect(r.alteracoes[0]).toMatchObject({ tipo: "codigo", efetivada: true });
    expect(r.alteracoes[0]?.diff).toContain("+user");
    expect(r.versao).toMatchObject({ anterior: "rev-1", nova: "rev-2", publicado: true });
    expect(r.reversao).toMatchObject({ possivel: true, tipo: "codigo" });
  });

  it("11. sem executor conectado: dependência explícita e nenhum sucesso fictício", () => {
    // Neste ambiente o serviço externo de código não está configurado.
    expect(integracaoCodigoDisponivel()).toBe(false);

    const r = montarRelatorio(
      relatorio({
        proposta: proposta({
          camada: "fluxo",
          aplicavelAutomaticamente: false,
          arquivos: ["src/lib/whatsapp.server.ts"],
          patch: "--- a\n+++ b",
        }),
        aplicavel: false,
        publicado: false,
        status: "pendente_tecnico",
        resultadoFinal: "aguardando_publicacao",
        verificacao: null,
        teste: { executado: false, aprovado: false, pergunta: null, resposta: null, motivo: "—" },
        codigo: {
          disponivel: false,
          aplicado: false,
          publicado: false,
          revisaoBase: null,
          revisaoNova: null,
          testes: null,
          motivo: "Mudança registrada para publicação.",
          dependencia: "Serviço de execução de código não configurado.",
        },
      }),
    );
    expect(r.resultado).toBe("pendente_integracao");
    expect(r.versao.publicado).toBe(false);
    expect(r.testes.naoRealizadas.join(" ")).toContain("não foi aplicada");
    expect(r.reversao.possivel).toBe(false);
  });

  it("17. reversão recupera a versão autorizada sem apagar histórico", () => {
    const catalogo = montarRelatorio(relatorio());
    expect(catalogo.reversao).toMatchObject({ possivel: true, tipo: "catalogo" });
    expect(catalogo.reversao.instrucao).toContain("150,00");

    const prompt = montarRelatorio(
      relatorio({ proposta: proposta({ camada: "modelo" }), versaoPrompt: { anterior: "9", nova: "10" } }),
    );
    expect(prompt.reversao.instrucao).toContain("versão anterior");

    // O relatório não substitui nem apaga os passos registrados do executor.
    const comPassos = montarRelatorio(
      relatorio({
        passos: [
          { ordem: 1, ferramenta: "gravar_item_catalogo", titulo: "Gravou item", detalhe: "ok", ok: true, em: "x" },
        ],
      }),
    );
    expect(comPassos.passos).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* 12–14 — comportamento do atendimento                                 */
/* ------------------------------------------------------------------ */

const TEXTO_APRESENTACAO = `APRESENTAÇÃO

Na primeira resposta de uma nova sessão, cumprimente e apresente-se brevemente usando a identidade configurada.

Se a pessoa já fez uma pergunta, apresente-se e responda à pergunta na mesma mensagem. Não acrescente “Como posso ajudar?” quando ela já explicou o que precisa.`;

const TEXTO_MARCADOR = `TESTE TEMPORÁRIO DE FONTE DO PROMPT — HOMOLOGAÇÃO

Somente quando a mensagem recebida do paciente for EXATAMENTE:

TESTE-ARQUITETURA-9381

responda EXATAMENTE:

ARQUITETURA_CONFIRMADA_9381

Não acrescente saudação, explicação ou qualquer outro texto.`;

const META = { escopo: "whatsapp", versao: "6", versaoId: "v6", hash: "hash-v6" };

describe("FASE 6 — atendimento", () => {
  it("12. saudação simples não gera transferência indevida", () => {
    const regras = extrairRegrasPublicadas(TEXTO_APRESENTACAO, META);
    const incondicionais = regras.regras.filter((r) => r.condicao.tipo === "sempre");
    // Nenhuma proibição incondicional de "pergunta" recai sobre "ola bom dia".
    expect(incondicionais.some((r) => r.proibicoes.includes("pergunta"))).toBe(false);
  });

  it("12b. falha na tentativa de correção não anuncia transferência concluída", () => {
    const s = saidaControladaBaixaConfianca({ tipo: "nao_executado", erro: "HTTP 400" });
    expect(s.aviso).toBe(AVISO_ENCAMINHAMENTO_FALHOU);
    expect(s.aviso).not.toBe(AVISO_ENCAMINHAMENTO_HUMANO);
    expect(s.encaminhamentoConfirmado).toBe(false);
    expect(s.exigeIntervencao).toBe(true);
  });

  it("13. pedido de humano: sucesso confirmado e falha são desfechos distintos", () => {
    const real = saidaControladaBaixaConfianca({ tipo: "real", confirmado: true });
    expect(real.aviso).toBe(AVISO_ENCAMINHAMENTO_HUMANO);
    expect(real.encaminhamentoConfirmado).toBe(true);

    const falhou = saidaControladaBaixaConfianca({ tipo: "real", confirmado: false, erro: "rpc" });
    expect(falhou.encaminhamento).toBe("real_falhou");
    expect(falhou.encaminhamentoConfirmado).toBe(false);

    const simulado = saidaControladaBaixaConfianca({ tipo: "simulado" });
    expect(simulado.aviso).toBe(AVISO_ENCAMINHAMENTO_SIMULADO);
    expect(simulado.aviso).not.toBe(AVISO_ENCAMINHAMENTO_HUMANO);
  });

  it("14. marcador condicional só vale para a entrada prevista", () => {
    const { regras } = extrairRegrasPublicadas(TEXTO_MARCADOR, META);
    const exata = regras.find((r) => r.literal === "ARQUITETURA_CONFIRMADA_9381");
    expect(exata).toBeTruthy();
    expect(exata?.operador).toBe("igualdade");
    // A condição existe e é a entrada exata: não alcança "ola bom dia".
    expect(exata?.condicao).toMatchObject({
      tipo: "mensagem_exata",
      valor: "TESTE-ARQUITETURA-9381",
    });
  });
});

/* ------------------------------------------------------------------ */
/* 15 — transporte                                                      */
/* ------------------------------------------------------------------ */

describe("FASE 6 — transporte", () => {
  beforeEach(() => limparFinalizacoes());

  it("15. o transporte envia a versão final aprovada, não o candidato anterior", async () => {
    const base = { clinicaId: CLINICA, canal: "test-console" as const };
    await finalizarResposta({
      ...base,
      chaveTurno: "t-6",
      chaveTurnoRaiz: "t-6",
      resultado: criarResultado({ origem: "modelo", texto: "candidato antes da correção" }),
    });
    const corrigida = await finalizarResposta({
      ...base,
      chaveTurno: "t-6#correcao",
      chaveTurnoRaiz: "t-6",
      resultado: criarResultado({ origem: "modelo", texto: "texto corrigido e aprovado" }),
    });
    const noEnvio = await finalizarResposta({
      ...base,
      canal: "whatsapp",
      chaveTurno: "t-6",
      chaveTurnoRaiz: "t-6",
      resultado: criarResultado({ origem: "modelo", texto: corrigida.texto }),
    });

    expect(noEnvio.texto).toBe("texto corrigido e aprovado");
    expect(noEnvio.reaproveitada).toBe(true);
    expect(ultimaFinalizacaoDoTurno("t-6")?.texto).toBe("texto corrigido e aprovado");
  });
});
