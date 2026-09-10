/**
 * FASE 6 — REGRESSÃO E ACEITE DO CONJUNTO (fases 1 a 5).
 *
 * O que esta suíte prova: a correspondência entre o que está CONFIGURADO
 * (rascunho x publicado x template), o que é EXECUTADO (finalização única) e o
 * que é ENTREGUE (texto e hash aprovados).
 *
 * O que esta suíte NÃO prova, e não deve ser citado como provado:
 *  - aderência do MODELO real (LLM) aos marcadores — exige rodar a verificação
 *    de fonte com o modelo ligado, pela tela de Homologação;
 *  - envio real por WhatsApp e comportamento em produção;
 *  - RLS do banco (aqui o acesso é simulado; a política vive na migração).
 *
 * Nada aqui toca WhatsApp, produção, publicação real ou dados de paciente:
 * clínicas, telefones e textos são fictícios.
 */
import { describe, expect, it, mock, beforeEach } from "bun:test";

import {
  criarResultado,
  verificarResultado,
  afirmaAgendamento,
  agendamentoComprovado,
  ROTULO_ORIGEM_RESULTADO,
} from "@/lib/nina/resposta/contrato";
import {
  MAPA_TEMPLATES,
  textoDaChave,
  validarTemplatePublicado,
} from "@/lib/nina/resposta/templates";
import { decidirEnvio } from "@/lib/nina/revisao";
import { montarTurnoPaciente, decidirEspera } from "@/lib/nina/burst";
import {
  resolverPrecedencia,
  saudacaoObrigatoriaEfetiva,
  REGRA_SAUDACAO,
  type RestricaoEstruturada,
} from "@/lib/nina/prompt/precedencia";
import {
  decidirModoTecnico,
  excecoesDaVerificacaoDeFonte,
  CANAL_HOMOLOGACAO,
} from "@/lib/nina/homologacao/modo-tecnico";
import {
  PARES_MARCADOR_PADRAO,
  ESCOPO_DA_PROVA_FONTE,
  regraPublicavelDoPar,
  avaliarAderenciaFonte,
  resumirAtendimentoCompleto,
  type ParMarcador,
} from "@/lib/nina/homologacao/verificacoes";
import { decidirHandoff } from "@/lib/nina/confidence/handoff-decision";
import { nivelDaPontuacao } from "@/lib/nina/confidence/policy";
import type { ResultadoConfianca } from "@/lib/nina/confidence/types";

const CLINICA_A = "11111111-1111-4111-8111-111111111111";
const CLINICA_B = "22222222-2222-4222-8222-222222222222";

// ------------------------------------------------- banco simulado (templates)
type LinhaTemplate = {
  clinica_id: string | null;
  chave: string;
  texto: string;
  escopo: string;
  status: string;
  instrucoes_versao_id: string | null;
};

let banco: LinhaTemplate[] = [];
let falharLeitura = false;

function tabela() {
  const eqs: Array<[string, unknown]> = [];
  let clinicaAlvo: string | null | undefined;
  let somenteGlobal = false;

  const executar = () => {
    if (falharLeitura) return { data: null, error: { message: "banco indisponível" } };
    const linhas = banco.filter((l) => {
      for (const [c, v] of eqs) if ((l as any)[c] !== v) return false;
      if (somenteGlobal) return l.clinica_id === null;
      if (clinicaAlvo !== undefined)
        return l.clinica_id === null || l.clinica_id === clinicaAlvo;
      return true;
    });
    return { data: linhas, error: null };
  };

  const api: any = {
    select: () => api,
    eq: (c: string, v: unknown) => {
      eqs.push([c, v]);
      return api;
    },
    is: () => {
      somenteGlobal = true;
      return api;
    },
    or: (expr: string) => {
      const m = /clinica_id\.eq\.([^,)]+)/.exec(expr);
      clinicaAlvo = m ? m[1]! : null;
      return api;
    },
    then: (res: any, rej: any) => Promise.resolve(executar()).then(res, rej),
  };
  return api;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => tabela() },
}));

const { carregarTemplatesPublicados, invalidarCacheTemplates } = await import(
  "@/lib/nina/resposta/templates.server"
);
const { finalizarResposta, finalizarTemplate, limparFinalizacoes } = await import(
  "@/lib/nina/resposta/finalizacao.server"
);

function publicar(chave: string, texto: string, clinicaId: string | null = null) {
  for (const l of banco)
    if (l.chave === chave && l.clinica_id === clinicaId && l.status === "publicada")
      l.status = "arquivada";
  banco.push({
    clinica_id: clinicaId,
    chave,
    texto,
    escopo: "whatsapp",
    status: "publicada",
    instrucoes_versao_id: "v-1",
  });
}

function rascunho(chave: string, texto: string, clinicaId: string | null = null) {
  banco.push({
    clinica_id: clinicaId,
    chave,
    texto,
    escopo: "whatsapp",
    status: "rascunho",
    instrucoes_versao_id: null,
  });
}

beforeEach(() => {
  banco = [];
  falharLeitura = false;
  invalidarCacheTemplates();
  limparFinalizacoes();
});

// ============================================================ 1. publicação
describe("1. rascunho, publicação e histórico", () => {
  it("rascunho não chega ao paciente", async () => {
    rascunho("handoff.aviso", "TEXTO DE RASCUNHO");
    const r = await finalizarTemplate({
      clinicaId: CLINICA_A,
      canal: "whatsapp",
      chaveTurno: "t1",
      origem: "handoff",
      chave: "handoff.aviso",
    });
    expect(r.texto).toBe(MAPA_TEMPLATES["handoff.aviso"]!.padrao);
    expect(r.templatesPublicados).toBe(false);
  });

  it("publicação válida vale para o próximo turno", async () => {
    publicar("handoff.aviso", "Vou chamar a equipe agora.");
    const r = await finalizarTemplate({
      clinicaId: CLINICA_A,
      canal: "whatsapp",
      chaveTurno: "t2",
      origem: "handoff",
      chave: "handoff.aviso",
    });
    expect(r.texto).toBe("Vou chamar a equipe agora.");
    expect(r.templatesPublicados).toBe(true);
  });

  it("a versão anterior fica no histórico e sai de uso", async () => {
    publicar("handoff.aviso", "versão 1");
    publicar("handoff.aviso", "versão 2");
    invalidarCacheTemplates();
    const t = await carregarTemplatesPublicados({ clinicaId: CLINICA_A, inicioDeTurno: true });
    expect(t.textos["handoff.aviso"]).toBe("versão 2");
    expect(banco.filter((l) => l.status === "arquivada").map((l) => l.texto)).toEqual(["versão 1"]);
  });
});

// ============================================================= 2. templates
describe("2. validação, falha de banco e convergência entre instâncias", () => {
  it("recusa variável não permitida, chave desconhecida e texto vazio", () => {
    expect(validarTemplatePublicado("handoff.aviso", "Olá {nome}")).toMatchObject({ ok: false });
    expect(validarTemplatePublicado("chave.que.nao.existe", "oi")).toMatchObject({ ok: false });
    expect(validarTemplatePublicado("handoff.aviso", "   ")).toMatchObject({ ok: false });
    expect(
      validarTemplatePublicado("fluxo.coleta.faltando", "Falta {lista}."),
    ).toMatchObject({ ok: true });
  });

  it("template inválido publicado não é usado e o padrão assume, com motivo", async () => {
    publicar("fluxo.coleta.faltando", "Falta {campo_inventado}.");
    const t = await carregarTemplatesPublicados({ clinicaId: CLINICA_A, inicioDeTurno: true });
    expect(t.textos["fluxo.coleta.faltando"]).toBeUndefined();
    expect(t.recusadas[0]!.motivo).toContain("variável não permitida");

    const r = await finalizarTemplate({
      clinicaId: CLINICA_A,
      canal: "whatsapp",
      chaveTurno: "t3",
      origem: "gate",
      chave: "fluxo.coleta.faltando",
      variaveis: { lista: "o CPF" },
    });
    expect(r.texto).toBe("Obrigada! Só falta o CPF para eu concluir o agendamento.");
    expect(r.templatesPublicados).toBe(false);
  });

  it("falha de banco mostra a origem real e não derruba o atendimento", async () => {
    falharLeitura = true;
    const t = await carregarTemplatesPublicados({ clinicaId: CLINICA_A, inicioDeTurno: true });
    expect(t.recusadas).toEqual([{ chave: "*", motivo: "leitura falhou" }]);
    const r = await finalizarTemplate({
      clinicaId: CLINICA_A,
      canal: "whatsapp",
      chaveTurno: "t4",
      origem: "erro",
      chave: "erro.tecnico",
    });
    expect(r.texto).toBe(MAPA_TEMPLATES["erro.tecnico"]!.padrao);
  });

  it("instância com cache frio converge para a mesma publicação", async () => {
    publicar("handoff.aviso", "versão 1");
    const a = await carregarTemplatesPublicados({ clinicaId: CLINICA_A, inicioDeTurno: true });
    publicar("handoff.aviso", "versão 2");
    invalidarCacheTemplates(); // segunda instância: cache local vazio
    const b = await carregarTemplatesPublicados({ clinicaId: CLINICA_A, inicioDeTurno: true });
    const a2 = await carregarTemplatesPublicados({ clinicaId: CLINICA_A, inicioDeTurno: true });
    expect(a.textos["handoff.aviso"]).toBe("versão 1");
    expect(b.textos["handoff.aviso"]).toBe("versão 2");
    expect(a2.textos["handoff.aviso"]).toBe("versão 2");
  });
});

// ============================================================ 3. marcadores
describe("3. marcadores de verificação de fonte (aderência do modelo)", () => {
  const segundo: ParMarcador = {
    id: "par-fase6",
    gatilho: "Me confirme o selo da fase 6.",
    marcador: "NINA-VERIF-FASE6-0001",
  };

  it("o marcador original e um segundo marcador são tratados do mesmo jeito", () => {
    for (const par of [...PARES_MARCADOR_PADRAO, segundo]) {
      const regra = regraPublicavelDoPar(par);
      expect(regra).toContain(par.marcador);
      expect(regra).toContain(par.gatilho);

      const aderiu = avaliarAderenciaFonte({
        par,
        payload: regra,
        primeiraResposta: par.marcador,
      });
      expect(aderiu.regraChegouAoPayload).toBe(true);
      expect(aderiu.primeiraRespostaCumpriu).toBe(true);

      const naoAderiu = avaliarAderenciaFonte({
        par,
        payload: "prompt sem a regra publicada",
        primeiraResposta: "Olá! Como posso ajudar?",
      });
      expect(naoAderiu.regraChegouAoPayload).toBe(false);
      expect(naoAderiu.primeiraRespostaCumpriu).toBe(false);
    }
  });

  it("um par não passa no marcador do outro (resposta fixa não engana o teste)", () => {
    const a = PARES_MARCADOR_PADRAO[0]!;
    const b = PARES_MARCADOR_PADRAO[1]!;
    const cruzado = avaliarAderenciaFonte({
      par: b,
      payload: regraPublicavelDoPar(b),
      primeiraResposta: a.marcador,
    });
    expect(cruzado.primeiraRespostaCumpriu).toBe(false);
  });

  it("fonte, aderência e entrega ficam em registros separados", () => {
    const par = PARES_MARCADOR_PADRAO[0]!;
    const fonte = avaliarAderenciaFonte({
      par,
      payload: regraPublicavelDoPar(par),
      primeiraResposta: par.marcador,
    });
    const entrega = criarResultado({ origem: "modelo", texto: par.marcador });
    expect(fonte.regraChegouAoPayload).toBe(true);
    expect(entrega.origem).toBe("modelo");
    expect(ROTULO_ORIGEM_RESULTADO.modelo).toBe("Comportamento do modelo");
    // A prova de fonte não aprova o pipeline inteiro — isso fica escrito.
    expect(ESCOPO_DA_PROVA_FONTE).toContain("Não aprova o pipeline completo");
  });

  it("sem registro do turno, o atendimento completo é SEM_EVIDENCIA (nunca aprovado)", () => {
    expect(resumirAtendimentoCompleto(null).resultado).toBe("SEM_EVIDENCIA");
    expect(resumirAtendimentoCompleto(null).lacunas).toContain("registro_do_turno");
  });
});

// ============================================================== 4. saudação
describe("4. saudação, exceção, sessão e mensagens agrupadas", () => {
  const saudacao: RestricaoEstruturada = {
    codigo: REGRA_SAUDACAO,
    nivel: "regra_geral",
    origem: "publicado",
    descricao: "apresentação obrigatória",
    texto: "Apresente-se na primeira mensagem.",
  };

  it("sessão nova mantém a apresentação; sessão em andamento não repete", () => {
    const r = resolverPrecedencia({ regrasGerais: [saudacao], excecoes: [] });
    expect(saudacaoObrigatoriaEfetiva(true, r)).toBe(true);
    expect(saudacaoObrigatoriaEfetiva(false, r)).toBe(false);
  });

  it("exceção autorizada de homologação suprime a apresentação", () => {
    const r = resolverPrecedencia({
      regrasGerais: [saudacao],
      excecoes: excecoesDaVerificacaoDeFonte("responda NINA-X"),
    });
    expect(r.suprimidas).toContain(REGRA_SAUDACAO);
    expect(saudacaoObrigatoriaEfetiva(true, r)).toBe(false);
  });

  it("mensagens agrupadas formam um turno só, na ordem, sem colar textos", () => {
    const turno = montarTurnoPaciente(["oi", "quero marcar", "com a Dra. Ana"]);
    expect(turno).toContain("1. oi");
    expect(turno).toContain("3. com a Dra. Ana");
    expect(turno.indexOf("1. oi")).toBeLessThan(turno.indexOf("2. quero marcar"));
    expect(montarTurnoPaciente(["só uma"]).startsWith("MENSAGENS")).toBe(false);
    expect(decidirEspera(0, 0).forcar).toBe(false);
    expect(decidirEspera(2000, 0).forcar).toBe(true);
  });
});

// ============================================================== 5. confiança
function avaliacao(p: Partial<ResultadoConfianca> = {}): ResultadoConfianca {
  return {
    score: 90,
    decision: "ALLOW",
    hardBlockers: [],
    validators: [],
    ...(p as any),
  } as ResultadoConfianca;
}

describe("5. faixas de confiança e garantias por tipo de turno", () => {
  it("faixas A/B/C/D continuam classificando pela pontuação", () => {
    expect(nivelDaPontuacao(95)).toBe("HIGH");
    expect(nivelDaPontuacao(75)).toBe("MEDIUM");
    expect(nivelDaPontuacao(20)).toBe("LOW");
  });

  it("pedido de humano transfere sem depender de confiança", () => {
    const p = decidirHandoff({
      avaliacaoAcao: avaliacao(),
      decisaoEfetiva: "ALLOW",
      tipoTurno: "HANDOFF",
      pedidoHumanoExplicito: true,
    });
    expect(p.decision).toBe("HANDOFF");
    expect(p.reason).toBe("EXPLICIT_HUMAN_REQUEST");
  });

  it("falha de ferramenta em ação crítica nunca executa a ação", () => {
    const p = decidirHandoff({
      avaliacaoAcao: avaliacao({
        score: 30,
        decision: "BLOCK_ACTION",
        hardBlockers: ["TOOL_FAILURE_ON_CRITICAL_ACTION"] as any,
        actionSafety: { status: "BLOCKED" } as any,
      }),
      decisaoEfetiva: "BLOCK_ACTION",
      tipoTurno: "OPERACAO",
    });
    expect(["HANDOFF", "BLOCK_ACTION"]).toContain(p.decision);
  });

  it("coleta de dados se resolve perguntando, sem transferir de imediato", () => {
    const p = decidirHandoff({
      avaliacaoAcao: avaliacao({
        score: 60,
        decision: "CLARIFY",
        hardBlockers: ["AMBIGUOUS_CRITICAL_ENTITY"] as any,
        actionSafety: { status: "BLOCKED" } as any,
      }),
      decisaoEfetiva: "CLARIFY",
      tipoTurno: "ESCLARECIMENTO",
      tentativasEsclarecimento: 0,
    });
    expect(p.recuperavel).toBe(true);
    expect(p.decision).not.toBe("HANDOFF");
  });

  it("tentativas esgotadas passam para atendente humano", () => {
    const p = decidirHandoff({
      avaliacaoAcao: avaliacao({
        score: 40,
        decision: "BLOCK_ACTION",
        hardBlockers: ["AMBIGUOUS_CRITICAL_ENTITY"] as any,
        actionSafety: { status: "BLOCKED" } as any,
      }),
      decisaoEfetiva: "BLOCK_ACTION",
      tipoTurno: "ESCLARECIMENTO",
      tentativasEsclarecimento: 2,
    });
    expect(p.decision).toBe("HANDOFF");
  });

  it("encerramento continua com texto próprio e origem própria", async () => {
    const r = await finalizarTemplate({
      clinicaId: CLINICA_A,
      canal: "whatsapp",
      chaveTurno: "t-enc",
      origem: "encerramento",
      chave: "encerramento.despedida",
      variaveis: { unidade: "Clínica Fictícia" },
    });
    expect(r.texto).toContain("Clínica Fictícia");
    expect(r.resultado.origem).toBe("encerramento");
  });
});

// ================================================= 6. promessa, revisão, dupla
describe("6. nenhuma promessa sem prova, revisão e reprocessamento", () => {
  it("confirmação de agendamento sem evidência não é entregue", async () => {
    const r = await finalizarResposta({
      clinicaId: CLINICA_A,
      canal: "whatsapp",
      chaveTurno: "t-sem-prova",
      resultado: criarResultado({
        origem: "gate",
        texto: "",
        chaveTemplate: "fluxo.agendamento.confirmado",
        variaveis: { profissional: "Dra. Fictícia", data: "10/09/2026", horario: "09:00" },
      }),
    });
    expect(afirmaAgendamento(r.texto)).toBe(false);
    expect(r.resultado.chaveTemplate).toBe("erro.tecnico");
    expect(r.resultado.restricoes.join(" ")).toContain(
      "confirmacao_de_agendamento_sem_evidencia_de_gravacao",
    );
  });

  it("com evidência de gravação a confirmação é entregue normalmente", async () => {
    const r = await finalizarResposta({
      clinicaId: CLINICA_A,
      canal: "whatsapp",
      chaveTurno: "t-com-prova",
      resultado: criarResultado({
        origem: "gate",
        texto: "",
        chaveTemplate: "fluxo.agendamento.confirmado",
        variaveis: { profissional: "Dra. Fictícia", data: "10/09/2026", horario: "09:00" },
        acoesConcluidas: [
          {
            acao: "agendar",
            idempotencia: "ag|1",
            confirmada: true,
            evidencia: "appointment_id=fake-1",
          },
        ],
      }),
    });
    expect(agendamentoComprovado(r.resultado)).toBe(true);
    expect(r.texto).toContain("09:00");
  });

  it("revisão concorrente descarta a resposta obsoleta", () => {
    expect(decidirEnvio({ processada: 4, atual: 5 })).toEqual({
      enviar: false,
      motivo: "SUPERSEDED",
    });
    expect(decidirEnvio({ processada: 5, atual: 5 }).enviar).toBe(true);
    expect(decidirEnvio({ processada: null, atual: 5 }).enviar).toBe(true);
  });

  it("reprocessar o mesmo turno não gera segunda finalização", async () => {
    const pedido = {
      clinicaId: CLINICA_A,
      canal: "whatsapp" as const,
      chaveTurno: "t-idem",
      resultado: criarResultado({ origem: "handoff", texto: "", chaveTemplate: "handoff.aviso" }),
    };
    const a = await finalizarResposta(pedido);
    const b = await finalizarResposta(pedido);
    expect(a.reaproveitada).toBe(false);
    expect(b.reaproveitada).toBe(true);
    expect(b.textoHash).toBe(a.textoHash);
  });

  it("a mesma ação registrada duas vezes é acusada como repetida", () => {
    const v = verificarResultado(
      criarResultado({
        origem: "modelo",
        texto: "ok",
        acoesConcluidas: [
          { acao: "agendar", idempotencia: "x", confirmada: true, evidencia: "id" },
          { acao: "agendar", idempotencia: "x", confirmada: true, evidencia: "id" },
        ],
      }),
    );
    expect(v.ok).toBe(false);
    expect(v.restricoes).toContain("acao_repetida:agendar");
  });
});

// ====================================================== 7. prévia e isolamento
describe("7. prévia e isolamento entre clínicas", () => {
  it("a prévia é rotulada como contexto de exemplo, não execução real", async () => {
    const arquivo = await Bun.file("src/components/nina/InstrucoesNina.tsx").text();
    expect(arquivo).toContain("Prévia com contexto de exemplo");
    expect(arquivo).toContain("Usada nesta resposta");
  });

  it("template publicado por uma clínica não vaza para outra", async () => {
    publicar("handoff.aviso", "texto exclusivo da clínica A", CLINICA_A);
    const a = await carregarTemplatesPublicados({ clinicaId: CLINICA_A, inicioDeTurno: true });
    invalidarCacheTemplates();
    const b = await carregarTemplatesPublicados({ clinicaId: CLINICA_B, inicioDeTurno: true });
    expect(a.textos["handoff.aviso"]).toBe("texto exclusivo da clínica A");
    expect(b.textos["handoff.aviso"]).toBeUndefined();
  });

  it("a clínica sobrescreve o global, sem alterar o global", async () => {
    publicar("handoff.aviso", "texto global", null);
    publicar("handoff.aviso", "texto da clínica A", CLINICA_A);
    const a = await carregarTemplatesPublicados({ clinicaId: CLINICA_A, inicioDeTurno: true });
    invalidarCacheTemplates();
    const b = await carregarTemplatesPublicados({ clinicaId: CLINICA_B, inicioDeTurno: true });
    expect(a.textos["handoff.aviso"]).toBe("texto da clínica A");
    expect(b.textos["handoff.aviso"]).toBe("texto global");
  });
});

// ============================================ 8. paridade WhatsApp/Homologação
describe("8. mesma finalização nos dois canais e modo técnico isolado", () => {
  it("condições equivalentes produzem exatamente o mesmo texto e hash", async () => {
    publicar("handoff.aviso", "Vou chamar a equipe agora.");
    const wpp = await finalizarTemplate({
      clinicaId: CLINICA_A,
      canal: "whatsapp",
      chaveTurno: "par-wpp",
      origem: "handoff",
      chave: "handoff.aviso",
    });
    const hom = await finalizarTemplate({
      clinicaId: CLINICA_A,
      canal: "test-console",
      chaveTurno: "par-hom",
      origem: "handoff",
      chave: "handoff.aviso",
    });
    expect(hom.texto).toBe(wpp.texto);
    expect(hom.textoHash).toBe(wpp.textoHash);
  });

  it("o modo técnico só existe na homologação autorizada", () => {
    expect(
      decidirModoTecnico({
        ambiente: "producao",
        canal: CANAL_HOMOLOGACAO,
        autorizadoPeloServidor: true,
      }).ativo,
    ).toBe(false);
    expect(
      decidirModoTecnico({
        ambiente: "homologacao",
        canal: CANAL_HOMOLOGACAO,
        autorizadoPeloServidor: false,
      }).ativo,
    ).toBe(false);
    expect(
      decidirModoTecnico({
        ambiente: "homologacao",
        canal: CANAL_HOMOLOGACAO,
        autorizadoPeloServidor: true,
      }).ativo,
    ).toBe(true);
  });

  it("o atendimento completo é resumido separadamente da prova de fonte", () => {
    const resumo = resumirAtendimentoCompleto({
      modelo_chamado: true,
      origem_resposta: "modelo",
      confianca: { decisao: "ALLOW", score: 92, nivel: "HIGH" },
      transformacoes: [{ etapa: "finalizacao", motivo: "origem=modelo; canal=whatsapp" }],
      entrega: { mensagemId: "msg-ficticia-1" },
    });
    expect(resumo.modeloChamado).toBe(true);
    expect(resumo.resultado).toBe("APROVADO_COM_INTERVENCAO");
    expect(resumo.intervencoes[0]!.etapa).toBe("finalizacao");
  });

  it("templates sem publicação continuam iguais ao texto histórico do código", () => {
    const t = textoDaChave("midia.imagem", {}, null);
    expect(t.origemTemplate).toBe("padrao");
    expect(t.texto).toBe(MAPA_TEMPLATES["midia.imagem"]!.padrao);
  });
});
