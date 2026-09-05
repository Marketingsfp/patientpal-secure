import { describe, expect, it } from "bun:test";
import { estadoVazio } from "./fluxo-estado-normalizar";
import {
  TTL_SESSAO_PADRAO_MINUTOS,
  aplicarTtlSessao,
  blocoPromptSessao,
  encerrarEstadosTransacionais,
  etapaTransacional,
  sessaoExpirada,
  ttlSessaoMinutos,
} from "./sessao";

function estadoEmAndamento() {
  const e = estadoVazio();
  e.patient.id = "pac-1";
  e.patient.first_name = "Ana";
  e.patient.identified = true;
  e.patient.validated = true;
  e.appointment.doctor_name = "Dr. João";
  e.appointment.specialty = "Cardiologia";
  e.appointment.slot_inicio = "2026-09-10T13:00:00Z";
  e.appointment.slot_fim = "2026-09-10T13:30:00Z";
  e.appointment.intent_confirmed = true;
  e.flow.stage = "WAITING_FINAL_CONFIRMATION";
  return e;
}

describe("TTL da sessão da Nina", () => {
  it("usa 240 minutos por padrão", () => {
    expect(TTL_SESSAO_PADRAO_MINUTOS).toBe(240);
    expect(ttlSessaoMinutos({})).toBe(240);
    expect(ttlSessaoMinutos({ NINA_SESSION_MEMORY_TTL_MINUTES: "60" })).toBe(60);
    expect(ttlSessaoMinutos({ NINA_SESSION_MEMORY_TTL_MINUTES: "abc" })).toBe(240);
  });

  it("não expira dentro da janela e expira depois dela", () => {
    const agora = new Date("2026-09-10T12:00:00Z");
    expect(sessaoExpirada("2026-09-10T09:00:00Z", agora, 240)).toBe(false);
    expect(sessaoExpirada("2026-09-10T07:00:00Z", agora, 240)).toBe(true);
    expect(sessaoExpirada(null, agora, 240)).toBe(false);
  });

  it("TTL é deslizante: atividade recente renova a sessão", () => {
    const agora = new Date("2026-09-10T12:00:00Z");
    const e = estadoEmAndamento();
    e.updated_at = "2026-09-10T11:50:00Z";
    const r = aplicarTtlSessao(e, agora, 240);
    expect(r.expirou).toBe(false);
    expect(r.continuacao).toBe(true);
    expect(r.estado.appointment.slot_inicio).toBe("2026-09-10T13:00:00Z");
  });
});

describe("estados transacionais", () => {
  it("reconhece etapas de operação em andamento", () => {
    expect(etapaTransacional("WAITING_FINAL_CONFIRMATION")).toBe(true);
    expect(etapaTransacional("CREATING_APPOINTMENT")).toBe(true);
    expect(etapaTransacional("IDLE")).toBe(false);
    expect(etapaTransacional(null)).toBe(false);
  });

  it("encerra a operação pendente e preserva o contexto recente", () => {
    const r = encerrarEstadosTransacionais(estadoEmAndamento());
    expect(r.flow.stage).toBe("IDLE");
    expect(r.appointment.slot_inicio).toBeNull();
    expect(r.appointment.intent_confirmed).toBe(false);
    // contexto que continua valendo
    expect(r.patient.id).toBe("pac-1");
    expect(r.appointment.specialty).toBe("Cardiologia");
    expect(r.appointment.doctor_name).toBe("Dr. João");
  });
});

describe("expiração e nova sessão", () => {
  it("abre nova sessão sem arrastar assunto antigo, mantendo o paciente do CRM", () => {
    const e = estadoEmAndamento();
    e.updated_at = "2026-09-09T06:00:00Z";
    const r = aplicarTtlSessao(e, new Date("2026-09-10T12:00:00Z"), 240);
    expect(r.expirou).toBe(true);
    expect(r.estado.flow.stage).toBe("GREETING");
    expect(r.estado.appointment.specialty).toBeNull();
    expect(r.estado.appointment.intent_confirmed).toBe(false);
    expect(r.estado.patient.id).toBe("pac-1");
    expect(r.resumoAnterior).toContain("Cardiologia");
  });

  it("orienta saudação padrão após expirar e retomada natural dentro do TTL", () => {
    const e = estadoEmAndamento();
    e.updated_at = "2026-09-09T06:00:00Z";
    const expirada = aplicarTtlSessao(e, new Date("2026-09-10T12:00:00Z"), 240);
    expect(blocoPromptSessao(expirada)).toContain("nova sessão");

    const e2 = estadoEmAndamento();
    e2.updated_at = "2026-09-10T11:30:00Z";
    const recente = aplicarTtlSessao(e2, new Date("2026-09-10T12:00:00Z"), 240);
    expect(blocoPromptSessao(recente)).toContain("continuação recente");
    expect(blocoPromptSessao(recente)).toContain("NÃO interprete");
  });

  it("sessão sem histórico não gera bloco de prompt", () => {
    const r = aplicarTtlSessao(estadoVazio(), new Date(), 240);
    expect(blocoPromptSessao(r)).toBe("");
  });
});
