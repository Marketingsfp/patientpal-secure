/**
 * FASE 6 — validação de ponta a ponta do protocolo e do handoff.
 *
 * Cobre os casos obrigatórios (pedido do paciente, informação ausente,
 * atendente online, ninguém online, destino conhecido/desconhecido, falha de
 * envio, retry, evento duplicado, Homologação, Test Runner e novo ciclo),
 * a paridade produção x teste e as travas de segurança do ambiente de teste.
 */

import { describe, expect, it } from "bun:test";
import {
  auditoriaCompleta,
  compararParidadeHandoff,
  montarRegistroAuditoriaHandoff,
  violacoesDeSeguranca,
  type EntradaAuditoriaHandoff,
} from "./handoff-auditoria";

const baseProducao: EntradaAuditoriaHandoff = {
  conversaId: "conv-prod-1",
  handoffEventoId: "evt-1",
  protocolo: "MJ-14712",
  criadoEm: "2026-09-07T18:00:00.000Z",
  motivo: "pedido_do_paciente",
  destino: "Recepção",
  atribuidaPara: "Ana",
  mensagemId: "msg-1",
  mensagemTexto: "Vou encaminhar para nossa equipe. Protocolo: MJ-14712",
  mensagemOrigem: "modelo",
  statusEnvio: "sent",
  transporte: "whatsapp",
  ambiente: "producao",
};

const baseTeste: EntradaAuditoriaHandoff = {
  ...baseProducao,
  conversaId: "conv-teste-1",
  cicloId: "ciclo-1",
  ninaSessionId: "sess-1",
  handoffEventoId: "evt-2",
  protocolo: "MJ-14713",
  atribuidaPara: null,
  mensagemId: "msg-2",
  mensagemTexto: "Vou encaminhar para nossa equipe. Protocolo: MJ-14713",
  transporte: "test-console",
  ambiente: "homologacao",
};

describe("registro de auditoria do handoff", () => {
  it("responde qual protocolo, em qual mensagem, handoff e ciclo", () => {
    const r = montarRegistroAuditoriaHandoff(baseTeste);
    expect(r.protocol_number).toBe("MJ-14713");
    expect(r.message_id).toBe("msg-2");
    expect(r.handoff_event_id).toBe("evt-2");
    expect(r.cycle_id).toBe("ciclo-1");
    expect(r.nina_session_id).toBe("sess-1");
    expect(r.environment).toBe("homologacao");
    expect(auditoriaCompleta(r).ok).toBe(true);
  });

  it("paciente pede humano — registro completo em produção", () => {
    const r = montarRegistroAuditoriaHandoff(baseProducao);
    expect(r.handoff_reason).toBe("pedido_do_paciente");
    expect(auditoriaCompleta(r).ok).toBe(true);
  });

  it("informação ausente no catálogo gera protocolo e mensagem", () => {
    const r = montarRegistroAuditoriaHandoff({
      ...baseProducao,
      motivo: "informacao_indisponivel",
    });
    expect(r.handoff_reason).toBe("informacao_indisponivel");
    expect(r.protocol_number).toBeTruthy();
    expect(r.message_body).toContain("MJ-14712");
  });

  it("atendente online x ninguém online — só muda a atribuição", () => {
    const comAtendente = montarRegistroAuditoriaHandoff(baseProducao);
    const naFila = montarRegistroAuditoriaHandoff({ ...baseProducao, atribuidaPara: null });
    expect(comAtendente.assigned_to).toBe("Ana");
    expect(naFila.assigned_to).toBeNull();
    expect(auditoriaCompleta(naFila).ok).toBe(true);
  });

  it("destino conhecido x desconhecido", () => {
    const conhecido = montarRegistroAuditoriaHandoff(baseProducao);
    const desconhecido = montarRegistroAuditoriaHandoff({ ...baseProducao, destino: null });
    expect(conhecido.destination_known).toBe(true);
    expect(conhecido.destination).toBe("Recepção");
    expect(desconhecido.destination_known).toBe(false);
    expect(desconhecido.destination).toBeNull();
  });

  it("falha de envio continua auditável e não invalida o protocolo", () => {
    const r = montarRegistroAuditoriaHandoff({
      ...baseProducao,
      mensagemId: null,
      statusEnvio: "falhou",
    });
    expect(r.send_status).toBe("falhou");
    expect(r.protocol_number).toBe("MJ-14712");
    expect(auditoriaCompleta(r).ok).toBe(true);
  });

  it("retry reaproveita o mesmo protocolo e fica marcado", () => {
    const r = montarRegistroAuditoriaHandoff({ ...baseProducao, retry: true });
    expect(r.retry).toBe(true);
    expect(r.protocol_number).toBe(baseProducao.protocolo ?? null);
  });

  it("evento duplicado: dois registros do mesmo handoff mantêm um protocolo", () => {
    const a = montarRegistroAuditoriaHandoff(baseProducao);
    const b = montarRegistroAuditoriaHandoff({ ...baseProducao, retry: true });
    expect(new Set([a.protocol_number, b.protocol_number]).size).toBe(1);
    expect(a.handoff_event_id).toBe(b.handoff_event_id);
  });

  it("homologação sem ciclo é auditoria incompleta", () => {
    const r = montarRegistroAuditoriaHandoff({ ...baseTeste, cicloId: null });
    const c = auditoriaCompleta(r);
    expect(c.ok).toBe(false);
    expect(c.faltando).toContain("cycle_id");
  });

  it("handoff sem protocolo é apontado como incompleto", () => {
    const c = auditoriaCompleta(montarRegistroAuditoriaHandoff({ ...baseProducao, protocolo: null }));
    expect(c.ok).toBe(false);
    expect(c.faltando).toContain("protocol_number");
  });

  it("novo ciclo após handoff gera outro registro, sem apagar o anterior", () => {
    const primeiro = montarRegistroAuditoriaHandoff(baseTeste);
    const segundo = montarRegistroAuditoriaHandoff({
      ...baseTeste,
      cicloId: "ciclo-2",
      ninaSessionId: "sess-2",
      handoffEventoId: "evt-3",
      protocolo: "MJ-14714",
      mensagemId: "msg-3",
      mensagemTexto: "Vou encaminhar para nossa equipe. Protocolo: MJ-14714",
    });
    expect(primeiro.cycle_id).not.toBe(segundo.cycle_id);
    expect(primeiro.protocol_number).not.toBe(segundo.protocol_number);
  });
});

describe("paridade produção x teste", () => {
  it("mesma regra de negócio: só transporte e identificadores divergem", () => {
    const r = compararParidadeHandoff(
      montarRegistroAuditoriaHandoff(baseProducao),
      montarRegistroAuditoriaHandoff(baseTeste),
    );
    expect(r.ok).toBe(true);
    expect(r.esperadas.map((d) => d.campo)).toContain("transport");
    expect(r.esperadas.map((d) => d.campo)).toContain("environment");
  });

  it("acusa comportamento simplificado no teste (sem protocolo)", () => {
    const r = compararParidadeHandoff(
      montarRegistroAuditoriaHandoff(baseProducao),
      montarRegistroAuditoriaHandoff({ ...baseTeste, protocolo: null }),
    );
    expect(r.ok).toBe(false);
    expect(r.divergencias.map((d) => d.campo)).toContain("protocol_number:presenca");
  });

  it("acusa teste sem mensagem de transferência", () => {
    const r = compararParidadeHandoff(
      montarRegistroAuditoriaHandoff(baseProducao),
      montarRegistroAuditoriaHandoff({ ...baseTeste, mensagemTexto: null, mensagemId: null }),
    );
    expect(r.ok).toBe(false);
    expect(r.divergencias.map((d) => d.campo)).toContain("message_body:presenca");
  });

  it("acusa decisão/destino diferentes entre ambientes", () => {
    const r = compararParidadeHandoff(
      montarRegistroAuditoriaHandoff(baseProducao),
      montarRegistroAuditoriaHandoff({ ...baseTeste, motivo: "indefinido", destino: null }),
    );
    expect(r.ok).toBe(false);
    const campos = r.divergencias.map((d) => d.campo);
    expect(campos).toContain("handoff_reason");
    expect(campos).toContain("destination");
  });
});

describe("segurança do ambiente de teste", () => {
  it("teste normal não tem violação", () => {
    expect(violacoesDeSeguranca(montarRegistroAuditoriaHandoff(baseTeste))).toEqual([]);
  });

  it("bloqueia WhatsApp real, atendente real e paciente real", () => {
    const v = violacoesDeSeguranca(
      montarRegistroAuditoriaHandoff({
        ...baseTeste,
        transporte: "whatsapp",
        atribuidaPara: "Ana",
      }),
      { pacienteRealId: "pac-1" },
    );
    expect(v).toContain("whatsapp_real");
    expect(v).toContain("atendente_real");
    expect(v).toContain("paciente_real");
  });

  it("não aplica travas de teste a handoff de produção", () => {
    expect(violacoesDeSeguranca(montarRegistroAuditoriaHandoff(baseProducao))).toEqual([]);
  });
});
