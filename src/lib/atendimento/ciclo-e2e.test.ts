/**
 * FASE 5 — Ciclo completo de vida da conversa, simulado ponta a ponta sobre as
 * regras puras que o backend usa: ciclo de responsabilidade, espera do
 * paciente (timeout de 30 min) e sessão da Nina.
 *
 * Regra estrutural validada aqui:
 *   conversa humana ABERTA   + nova mensagem = HUMANO
 *   conversa humana RESOLVIDA + nova mensagem = NINA
 */

import { describe, it, expect } from "bun:test";
import {
  CICLO_PATCH,
  derivarResponsavel,
  inconsistenciasCiclo,
  ninaResponde,
  type ConversaCiclo,
} from "./ciclo-responsabilidade";
import { normalizarEstado, type EstadoFluxoNina } from "@/lib/nina/fluxo-estado-normalizar";
import { encerrarEstadosTransacionais, reabrirSessao } from "@/lib/nina/sessao";

const STATUS_ENCERRADOS = ["closed", "finished", "resolved"];

type Conversa = ConversaCiclo & {
  status: string;
  atribuida_user_id: string | null;
  last_assigned_user_id: string | null;
  resolved_by: string | null;
  awaiting_patient_since: string | null;
  patient_response_deadline: string | null;
  estado: EstadoFluxoNina;
};

function novaConversa(): Conversa {
  return {
    status: "bot_attending",
    ...CICLO_PATCH.nina(),
    last_assigned_user_id: null,
    resolved_by: null,
    awaiting_patient_since: null,
    patient_response_deadline: null,
    estado: normalizarEstado({ flow: { stage: "GREETING" } }),
  };
}

/** Nina faz uma pergunta necessária → abre prazo de 30 min. */
function ninaPergunta(c: Conversa, agora: Date, minutos = 30) {
  c.awaiting_patient_since = agora.toISOString();
  c.patient_response_deadline = new Date(agora.getTime() + minutos * 60_000).toISOString();
  c.estado = normalizarEstado({
    ...c.estado,
    flow: { stage: "WAITING_FINAL_CONFIRMATION" },
    appointment: { ...c.estado.appointment, time: "09:00", slot_confirmed_by_patient: false },
  });
}

/** Job de timeout: só age se o prazo venceu e a conversa ainda é da Nina. */
function processarTimeout(c: Conversa, agora: Date, atendenteOnline: string | null): boolean {
  if (!c.patient_response_deadline) return false;
  if (Date.parse(c.patient_response_deadline) > agora.getTime()) return false;
  if (derivarResponsavel(c) !== "NINA") return false;
  c.awaiting_patient_since = null;
  c.patient_response_deadline = null;
  c.status = "waiting";
  Object.assign(c, atendenteOnline ? CICLO_PATCH.humano(atendenteOnline) : CICLO_PATCH.filaHumana());
  return true;
}

/** Resolver. */
function resolver(c: Conversa, userId: string) {
  c.last_assigned_user_id = c.atribuida_user_id ?? c.last_assigned_user_id ?? userId;
  c.resolved_by = userId;
  c.status = "closed";
  Object.assign(c, CICLO_PATCH.resolvida());
  c.awaiting_patient_since = null;
  c.patient_response_deadline = null;
  c.estado = encerrarEstadosTransacionais(c.estado);
}

/** Chegada de mensagem do paciente: reabre se encerrada; senão mantém responsável. */
function mensagemDoPaciente(c: Conversa, agora: Date): { reabriu: boolean } {
  if (STATUS_ENCERRADOS.includes(c.status)) {
    c.status = "bot_attending";
    Object.assign(c, CICLO_PATCH.nina());
    c.awaiting_patient_since = null;
    c.patient_response_deadline = null;
    c.estado = reabrirSessao(c.estado, agora.toISOString());
    return { reabriu: true };
  }
  c.awaiting_patient_since = null;
  c.patient_response_deadline = null;
  return { reabriu: false };
}

const T0 = new Date("2026-09-05T12:00:00Z");
const mais = (min: number) => new Date(T0.getTime() + min * 60_000);

describe("ciclo completo: Nina → humano → resolvido → Nina", () => {
  it("cenário principal percorre todo o ciclo", () => {
    const c = novaConversa();
    expect(derivarResponsavel(c)).toBe("NINA");

    ninaPergunta(c, T0);
    expect(c.patient_response_deadline).toBe(mais(30).toISOString());

    // 30 min sem resposta → handoff com atendente online
    expect(processarTimeout(c, mais(30), "jean")).toBe(true);
    expect(derivarResponsavel(c)).toBe("HUMANO");
    expect(ninaResponde(c)).toBe(false);

    // humano resolve
    resolver(c, "jean");
    expect(derivarResponsavel(c)).toBe("RESOLVIDA");
    expect(c.last_assigned_user_id).toBe("jean");
    expect(c.atribuida_user_id).toBeNull();

    // nova mensagem reabre e devolve para a Nina
    const r = mensagemDoPaciente(c, mais(60));
    expect(r.reabriu).toBe(true);
    expect(derivarResponsavel(c)).toBe("NINA");
    expect(inconsistenciasCiclo(c)).toEqual([]);
  });

  it("cenário 2: humano atendendo sem resolver mantém o humano", () => {
    const c = novaConversa();
    Object.assign(c, CICLO_PATCH.humano("jean"));
    c.status = "human_attending";
    mensagemDoPaciente(c, mais(5));
    expect(derivarResponsavel(c)).toBe("HUMANO");
    expect(ninaResponde(c)).toBe(false);
  });

  it("cenário 3: resolvida por qualquer atendente volta para a Nina", () => {
    for (const quem of ["jean", "maria", "outro"]) {
      const c = novaConversa();
      Object.assign(c, CICLO_PATCH.humano(quem));
      c.status = "human_attending";
      resolver(c, quem);
      mensagemDoPaciente(c, mais(10));
      expect(derivarResponsavel(c)).toBe("NINA");
      expect(c.atribuida_user_id).toBeNull();
      expect(c.last_assigned_user_id).toBe(quem);
    }
  });

  it("cenário 4: 'sim' após resolução não executa a operação antiga", () => {
    const c = novaConversa();
    ninaPergunta(c, T0); // discutia 09:00
    Object.assign(c, CICLO_PATCH.humano("jean"));
    c.status = "human_attending";
    const sessaoAntiga = c.estado.session_id ?? null;
    resolver(c, "jean");
    mensagemDoPaciente(c, mais(45)); // paciente manda "sim"

    expect(c.estado.flow.stage).toBe("IDLE");
    expect(c.estado.appointment.time).toBeNull();
    expect(c.estado.appointment.slot_confirmed_by_patient).toBe(false);
    expect(c.estado.appointment.intent_confirmed).toBe(false);
    expect(c.estado.session_id).toBeTruthy();
    expect(c.estado.session_id).not.toBe(sessaoAntiga);
  });

  it("cenário 5: timeout sem atendente online cai em Não atribuídas", () => {
    const c = novaConversa();
    ninaPergunta(c, T0);
    expect(processarTimeout(c, mais(31), null)).toBe(true);
    expect(derivarResponsavel(c)).toBe("FILA_HUMANA");

    // atendente assume, atende e resolve
    Object.assign(c, CICLO_PATCH.humano("maria"));
    resolver(c, "maria");
    mensagemDoPaciente(c, mais(120));
    expect(derivarResponsavel(c)).toBe("NINA");
  });

  it("resposta antes do prazo cancela o timeout e a Nina continua", () => {
    const c = novaConversa();
    ninaPergunta(c, T0);
    mensagemDoPaciente(c, mais(10));
    expect(c.patient_response_deadline).toBeNull();
    expect(processarTimeout(c, mais(40), "jean")).toBe(false);
    expect(derivarResponsavel(c)).toBe("NINA");
  });
});

describe("concorrência", () => {
  it("dois jobs de timeout geram um único handoff", () => {
    const c = novaConversa();
    ninaPergunta(c, T0);
    expect(processarTimeout(c, mais(31), "jean")).toBe(true);
    expect(processarTimeout(c, mais(31), "maria")).toBe(false);
    expect(c.atribuida_user_id).toBe("jean");
  });

  it("duas reaberturas simultâneas resultam em uma só", () => {
    const c = novaConversa();
    resolver(c, "jean");
    expect(mensagemDoPaciente(c, mais(60)).reabriu).toBe(true);
    expect(mensagemDoPaciente(c, mais(60)).reabriu).toBe(false);
    expect(derivarResponsavel(c)).toBe("NINA");
  });

  it("atribuição humana antiga não reaparece após reabertura", () => {
    const c = novaConversa();
    Object.assign(c, CICLO_PATCH.humano("jean"));
    resolver(c, "jean");
    mensagemDoPaciente(c, mais(60));
    expect(c.atribuida_user_id).toBeNull();
    expect(c.last_assigned_user_id).toBe("jean");
    expect(ninaResponde(c)).toBe(true);
  });

  it("nunca há dois responsáveis ao mesmo tempo", () => {
    const c = novaConversa();
    const trilha: string[] = [];
    ninaPergunta(c, T0);
    trilha.push(derivarResponsavel(c));
    processarTimeout(c, mais(31), "jean");
    trilha.push(derivarResponsavel(c));
    resolver(c, "jean");
    trilha.push(derivarResponsavel(c));
    mensagemDoPaciente(c, mais(90));
    trilha.push(derivarResponsavel(c));
    expect(trilha).toEqual(["NINA", "HUMANO", "RESOLVIDA", "NINA"]);
    expect(inconsistenciasCiclo(c)).toEqual([]);
  });
});
