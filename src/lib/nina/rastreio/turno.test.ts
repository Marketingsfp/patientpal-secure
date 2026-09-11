/**
 * FASE 1 (Rastreabilidade) — testes do registro do turno.
 * Módulo puro: nada de banco, nada de WhatsApp, nada de produção.
 */
import { describe, expect, it } from "bun:test";
import {
  avaliacaoEmObservacao,
  avaliacaoOperacional,
  avaliarTransformacoes,
  descreverAvaliacaoConfianca,
  criarRegistroTurno,
  finalizarRegistroTurno,
  lacunasDoTurno,
  origemComSituacao,
  resumoTurnoParaTrace,
  truncarParaDiagnostico,
  MARCA_TRUNCADO,
  type RegistroTurno,
} from "./turno";

function base(): RegistroTurno {
  return criarRegistroTurno({
    turnoId: "t-1",
    clinicaId: "c-1",
    conversaId: "conv-1",
    mensagensEntrada: ["m-1", "m-1", "m-2"],
    ambiente: "homologacao",
    teste: true,
  });
}

describe("registro do turno", () => {
  it("não duplica mensagens de entrada e nasce sem evidência inventada", () => {
    const r = base();
    expect(r.mensagensEntrada).toEqual(["m-1", "m-2"]);
    expect(r.modeloChamado).toBe(false);
    expect(r.rodadas).toBe(0);
    expect(r.origemResposta).toBeNull();
    expect(r.prompt).toBeNull();
  });

  it("declara lacunas quando falta versão, origem ou entrega", () => {
    const faltas = lacunasDoTurno(base());
    expect(faltas).toContain("versao_prompt");
    expect(faltas).toContain("origem_resposta");
  });

  it("acusa incoerência: texto do modelo sem chamada ao modelo", () => {
    const r = { ...base(), origemResposta: "modelo" as const };
    expect(lacunasDoTurno(r)).toContain("chamada_modelo");
  });

  it("cache normal da versão publicada não é fallback por erro", () => {
    const r = base();
    r.prompt = {
      escopo: "whatsapp",
      versaoId: "v-9",
      versao: 9,
      publicadoEm: "2026-09-01T10:00:00.000Z",
      origem: "cache",
      fallbackPorErro: false,
      motivo: "versão publicada servida do cache da instância",
      hash: "t1:abc:10",
      carregadoEm: "2026-09-10T10:00:00.000Z",
    };
    const resumo = resumoTurnoParaTrace(r) as { versao_prompt: Record<string, unknown> };
    expect(resumo.versao_prompt.selecao).toBe("cache");
    expect(resumo.versao_prompt.fallback_por_erro).toBe(false);
    expect(lacunasDoTurno(r)).not.toContain("versao_prompt");
  });

  it("origem vira 'modelo_transformado' quando o código altera o texto depois", () => {
    const r = base();
    r.modeloChamado = true;
    r.rodadas = 2;
    r.execucaoId = "e-1";
    r.origemResposta = "modelo";
    r.transformacoes.push({
      etapa: "handoff.aviso",
      motivo: "aviso obrigatório de transferência",
      antesHash: "t1:a:1",
      depoisHash: "t1:b:2",
      em: "2026-09-10T10:00:01.000Z",
    });
    const fechado = finalizarRegistroTurno(r, "2026-09-10T10:00:02.000Z");
    expect(fechado.origemResposta).toBe("modelo_transformado");
    expect(fechado.encerradoEm).toBe("2026-09-10T10:00:02.000Z");
  });

  it("caminho sem modelo é registrado como gate, sem lacuna de chamada ao modelo", () => {
    const r = base();
    r.origemResposta = "gate";
    r.motivoOrigem = "gate de identificação respondeu antes do modelo";
    r.prompt = {
      escopo: "whatsapp",
      versaoId: "v-9",
      versao: 9,
      publicadoEm: null,
      origem: "publicada",
      fallbackPorErro: false,
      motivo: null,
      hash: "t1:abc:10",
      carregadoEm: "2026-09-10T10:00:00.000Z",
    };
    const faltas = lacunasDoTurno(r);
    expect(faltas).not.toContain("chamada_modelo");
    expect(faltas).not.toContain("confianca");
    expect(faltas).toContain("mensagem_entregue");
  });

  it("resumo do trace leva contadores e impressões digitais, não texto do paciente", () => {
    const r = base();
    r.modeloChamado = true;
    r.rodadas = 3;
    r.modelos = ["modelo-a"];
    r.execucaoId = "e-1";
    r.origemResposta = "modelo";
    r.entrega = { mensagemId: "out-1", textoHash: "t1:z:9", tamanho: 42, canal: "whatsapp" };
    const resumo = resumoTurnoParaTrace(r);
    expect(resumo.rodadas).toBe(3);
    expect(resumo.mensagens_entrada).toBe(2);
    expect(JSON.stringify(resumo)).not.toContain("Olá");
  });

  it("diagnóstico marca explicitamente o conteúdo truncado", () => {
    const curto = truncarParaDiagnostico("abc", 10);
    expect(curto.truncado).toBe(false);
    const longo = truncarParaDiagnostico("x".repeat(50), 10);
    expect(longo.truncado).toBe(true);
    expect(longo.texto.endsWith(MARCA_TRUNCADO)).toBe(true);
  });
});

describe("situação das transformações (FASE 1 — fidelidade)", () => {
  const t = (antes: string | null, depois: string | null, etapa = "finalizacao") => ({
    etapa,
    motivo: "m",
    antesHash: antes,
    depoisHash: depois,
    em: "2026-09-11T10:00:00.000Z",
  });

  it("passagem pelo finalizador sem mudar o texto não é transformação", () => {
    expect(avaliarTransformacoes([t("t1:a:1", "t1:a:1")])).toBe("sem_alteracao");
    const r = criarRegistroTurno({ turnoId: "x" });
    r.origemResposta = "modelo";
    r.transformacoes.push(t("t1:a:1", "t1:a:1"));
    expect(finalizarRegistroTurno(r).origemResposta).toBe("modelo");
  });

  it("mudança efetiva é registrada como alteração", () => {
    expect(avaliarTransformacoes([t("t1:a:1", "t1:b:2")])).toBe("alterado");
  });

  it("alteração intermediária com retorno ao original é 'revertido'", () => {
    expect(avaliarTransformacoes([t("t1:a:1", "t1:b:2"), t("t1:b:2", "t1:a:1")])).toBe("revertido");
    const r = criarRegistroTurno({ turnoId: "x" });
    r.origemResposta = "modelo";
    r.transformacoes.push(t("t1:a:1", "t1:b:2"), t("t1:b:2", "t1:a:1"));
    expect(finalizarRegistroTurno(r).origemResposta).toBe("modelo");
  });

  it("sem hash suficiente, declara indeterminado em vez de supor", () => {
    expect(avaliarTransformacoes([t(null, null)])).toBe("indeterminado");
    expect(avaliarTransformacoes([t("t1:a:1", null)])).toBe("indeterminado");
  });

  it("nenhuma etapa registrada", () => {
    expect(avaliarTransformacoes([])).toBe("sem_transformacoes");
  });

  it("origem antiga 'modelo_transformado' sem evidência volta a 'modelo'", () => {
    expect(origemComSituacao("modelo_transformado", "sem_alteracao")).toBe("modelo");
    expect(origemComSituacao("modelo_transformado", "alterado")).toBe("modelo_transformado");
    expect(origemComSituacao("codigo", "alterado")).toBe("codigo");
  });

  it("o resumo do trace carrega a situação e o efeito de cada etapa", () => {
    const r = criarRegistroTurno({ turnoId: "x" });
    r.origemResposta = "modelo";
    r.transformacoes.push(t("t1:a:1", "t1:a:1"));
    const resumo = resumoTurnoParaTrace(finalizarRegistroTurno(r)) as Record<string, unknown>;
    expect(resumo["situacao_transformacoes"]).toBe("sem_alteracao");
    expect((resumo["transformacoes"] as Array<Record<string, unknown>>)[0]!["alterou"]).toBe(false);
  });
});

// ============================================================================
// FASE 2 — confiança: avaliação, modo e ação aplicada
// ============================================================================
describe("FASE 2 — avaliações de confiança", () => {
  const base = { etapa: null, nivel: null } as const;

  it("CLARIFY em shadow é observação, nunca intervenção aplicada", () => {
    const c = {
      ...base,
      avaliacao: "answer_confidence",
      decisao: "CLARIFY",
      modo: "shadow",
      score: 65,
      aplicada: false,
    };
    expect(avaliacaoEmObservacao(c)).toBe(true);
    expect(descreverAvaliacaoConfianca(c)).toBe(
      "Confiança da mensagem final · nota 65 · decisão registrada CLARIFY · modo shadow",
    );
    expect(avaliacaoOperacional([c])).toBeNull();
  });

  it("avaliação operacional com ação comprovada é separada da shadow", () => {
    const op = {
      ...base,
      avaliacao: "action_safety",
      decisao: "ALLOW",
      modo: "enforce",
      score: 90,
      aplicada: true,
    };
    const shadow = {
      ...base,
      avaliacao: "answer_confidence",
      decisao: "CLARIFY",
      modo: "shadow",
      score: 65,
      aplicada: false,
    };
    expect(avaliacaoOperacional([op, shadow])).toEqual(op);
    expect(avaliacaoEmObservacao(op)).toBe(false);
  });

  it("sem informação suficiente não deduz nota nem decisão", () => {
    const c = {
      ...base,
      avaliacao: "action_safety",
      decisao: null,
      modo: null,
      score: null,
    };
    expect(descreverAvaliacaoConfianca(c)).toBe(
      "Segurança da ação (operacional) · nota não registrada · decisão não registrada · modo não registrado",
    );
  });

  it("o resumo do turno leva todas as avaliações e a operacional", () => {
    const r = criarRegistroTurno({ turnoId: "t1" });
    r.avaliacoes = [
      { ...base, avaliacao: "action_safety", decisao: "ALLOW", modo: "enforce", score: 90, aplicada: true },
      { ...base, avaliacao: "answer_confidence", decisao: "CLARIFY", modo: "shadow", score: 65, aplicada: false },
    ];
    const resumo = resumoTurnoParaTrace(r) as Record<string, unknown>;
    expect((resumo["avaliacoes"] as unknown[]).length).toBe(2);
    expect((resumo["avaliacao_operacional"] as Record<string, unknown>)["avaliacao"]).toBe(
      "action_safety",
    );
  });
});
