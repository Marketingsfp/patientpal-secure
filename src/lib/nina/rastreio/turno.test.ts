/**
 * FASE 1 (Rastreabilidade) — testes do registro do turno.
 * Módulo puro: nada de banco, nada de WhatsApp, nada de produção.
 */
import { describe, expect, it } from "vitest";
import {
  criarRegistroTurno,
  finalizarRegistroTurno,
  lacunasDoTurno,
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
