/** Replays determinísticos do núcleo; nenhuma chamada ao modelo, banco ou WhatsApp. */
import { describe, expect, it } from "bun:test";
import { normalizarEstado, type EstadoFluxoNina } from "../fluxo-estado-normalizar";
import { encerrarEstadosTransacionais, reabrirSessao, resolverEstadoDaSessao } from "../sessao";
import { reservaDaSessaoAtual, resultadoComprovaCriacaoNoTurno } from "../agendamento-sessao";
import { validarResultado } from "../tool-broker";
import { derivarEtapa } from "../atendimento-fase6";
import type { ContextoConfianca, EstadoOperacionalTurno } from "../confidence/types";

const AGORA = new Date("2026-09-14T01:04:00Z");
const FIM = "2026-09-14T00:00:00Z";
const TEXTO =
  "Olá, Jean! Eu sou a Nina, atendente virtual da Policlínica Menino Jesus. Como posso te ajudar hoje?";
function reserva(): EstadoFluxoNina {
  return normalizarEstado({
    session_id: "sessao-1",
    session_started_at: "2026-09-01T12:00:00Z",
    updated_at: "2026-09-14T00:55:00Z",
    patient: { id: "paciente-1", first_name: "Jean", identified: true },
    appointment: {
      appointment_id: "reserva-anterior",
      confirmed_in_session: "sessao-1",
      doctor_name: "Dr. Alex Louza",
      specialty: "Cardiologia",
      price: "120",
      date: "2026-09-01",
      time: "09:00",
      slot_inicio: "2026-09-01T09:00:00Z",
      slot_fim: "2026-09-01T09:30:00Z",
      intent_confirmed: true,
      slot_confirmed_by_patient: true,
    },
    flow: { stage: "APPOINTMENT_CONFIRMED" },
  });
}
function contexto(
  ambiente: "producao" | "homologacao",
  st: EstadoOperacionalTurno,
  texto = TEXTO,
): ContextoConfianca {
  return {
    turnType: "SAUDACAO",
    requestedAction: null,
    intent: "saudacao",
    mensagemPaciente: "Olá",
    draftText: texto,
    retrievedSources: [],
    toolResults: [],
    fatos: [],
    consultas: [],
    operationalState: st,
    businessContext: {
      ambiente,
      pacienteIdentificado: true,
      agendamentoConfirmado: st.appointmentCreated === true,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
  };
}

describe("memória de agendamento respeita o encerramento do atendimento", () => {
  it("resolver e reabrir removem vínculo operacional, sem alterar a entrada ou paciente", () => {
    const antigo = reserva();
    const antes = JSON.stringify(antigo);
    for (const estado of [
      encerrarEstadosTransacionais(antigo),
      reabrirSessao(antigo, AGORA.toISOString()),
    ]) {
      expect(estado.appointment.appointment_id).toBeNull();
      expect(estado.appointment.confirmed_in_session).toBeNull();
      expect(estado.appointment.price).toBeNull();
      expect(estado.appointment.slot_inicio).toBeNull();
      expect(estado.appointment.intent_confirmed).toBe(false);
      expect(estado.appointment.slot_confirmed_by_patient).toBe(false);
      expect(estado.patient.id).toBe("paciente-1");
      expect(estado.appointment.specialty).toBe("Cardiologia");
      expect(estado.flow.stage).toBe("IDLE");
    }
    expect(JSON.stringify(antigo)).toBe(antes);
  });

  it("saneia estado anterior ao encerramento mesmo com updated_at recente", () => {
    const resultado = resolverEstadoDaSessao(reserva(), AGORA, 240, FIM);
    expect(resultado.saneouEncerramento).toBe(true);
    expect(resultado.estado.appointment.appointment_id).toBeNull();
    expect(resultado.estado.session_id).not.toBe("sessao-1");
    expect(resultado.continuacao).toBe(false);
  });

  it("recupera reabertura legada que trocou sessão mas reteve a reserva de setembro", () => {
    const legado = reserva();
    legado.session_id = "sessao-2";
    legado.session_started_at = "2026-09-14T00:10:00Z";
    delete legado.appointment.confirmed_in_session;
    const { estado, saneouEncerramento } = resolverEstadoDaSessao(legado, AGORA, 240, FIM);
    expect(saneouEncerramento).toBe(true);
    expect(estado.session_id).toBe("sessao-2");
    expect(estado.appointment.appointment_id).toBeNull();
    expect(derivarEtapa({ estado, mensagem: "oi", primeiraMensagem: true, intencoes: [] })).toBe(
      "GREETING",
    );
  });

  it("mantém reserva comprovada no atendimento atual, mesmo havendo resolução anterior", () => {
    const atual = reserva();
    atual.session_started_at = "2026-09-14T00:10:00Z";
    const resultado = resolverEstadoDaSessao(atual, AGORA, 240, FIM);
    expect(resultado.estado).toBe(atual);
    expect(reservaDaSessaoAtual(resultado.estado)).toBe(true);
  });

  it("mantém continuidade legada sem encerramento e não deriva reserva de ID solto em IDLE", () => {
    const legado = reserva();
    delete legado.appointment.confirmed_in_session;
    const { estado } = resolverEstadoDaSessao(legado, AGORA, 240);
    expect(reservaDaSessaoAtual(estado)).toBe(true);
    expect(
      derivarEtapa({ estado, mensagem: "obrigado", primeiraMensagem: false, intencoes: [] }),
    ).toBe("APPOINTMENT_CONFIRMED");
    const solto = normalizarEstado({
      appointment: { appointment_id: "reserva-anterior" },
      flow: { stage: "IDLE" },
    });
    expect(reservaDaSessaoAtual(solto)).toBe(false);
    expect(
      derivarEtapa({ estado: solto, mensagem: "oi", primeiraMensagem: true, intencoes: [] }),
    ).toBe("GREETING");
  });

  it("não reinicia operação atual pendente ao reler data de um encerramento anterior", () => {
    const atual = reabrirSessao(reserva(), "2026-09-14T00:10:00Z");
    atual.flow.stage = "WAITING_FINAL_CONFIRMATION";
    atual.appointment.slot_inicio = "2026-09-15T13:00:00Z";
    atual.appointment.intent_confirmed = true;
    expect(resolverEstadoDaSessao(atual, AGORA, 240, FIM).estado).toBe(atual);
  });

  it("TTL vencido continua expirando, sem reabertura renovar atividade artificialmente", () => {
    const antigo = reserva();
    antigo.updated_at = "2026-09-01T12:01:00Z";
    const resultado = resolverEstadoDaSessao(antigo, AGORA, 240, "2026-09-01T13:00:00Z");
    expect(resultado.expirou).toBe(true);
    expect(resultado.estado.appointment.appointment_id).toBeNull();
    expect(resultado.estado.appointment.specialty).toBeNull();
    expect(resultado.estado.session_started_at).toBe(AGORA.toISOString());
  });

  it("origem em outra sessão impede reaproveitar confirmação mesmo sem data de resolução", () => {
    const antigo = reserva();
    antigo.session_id = "sessao-2";
    const resultado = resolverEstadoDaSessao(antigo, AGORA, 240);
    expect(resultado.estado.appointment.appointment_id).toBeNull();
    expect(resultado.estado.appointment.intent_confirmed).toBe(false);
  });

  it("só retorno de criação verificada para o mesmo ID comprova nova operação no turno", () => {
    const estado = reserva();
    const criado = {
      ok: true,
      estado_acao: "CREATED",
      appointment_id: "reserva-anterior",
      verificado_no_banco: true,
    };
    expect(resultadoComprovaCriacaoNoTurno(estado, validarResultado("agendar", criado))).toBe(true);
    for (const patch of [
      { estado_acao: "EXISTING", duplicado: true },
      { appointment_id: "outro-id" },
      { appointment_id: null },
      { ok: false },
      { verificado_no_banco: false },
      { erro: "APPOINTMENT_NOT_PERSISTED" },
    ])
      expect(
        resultadoComprovaCriacaoNoTurno(
          estado,
          validarResultado("agendar", { ...criado, ...patch }),
        ),
      ).toBe(false);
  });
});
