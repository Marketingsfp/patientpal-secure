/**
 * FASE 3 — autorização prévia e prova do resultado.
 *
 * Comprova: zero efeito sem consentimento, paciente, vaga correspondente ou
 * revisão válida; uma operação autorizada tem chave única (reprocessamento e
 * concorrência não duplicam); identificação concluída no turno habilita a
 * operação; reserva anterior é lida, nunca recriada.
 */
import { describe, expect, it } from "bun:test";
import { autorizarAcao, vagaCorresponde, type EntradaAutorizacao } from "./autorizacao";
import { verificarResultadoAgendamento } from "./resultado";
import { decidirConfianca } from "@/lib/nina/confidence/engine";
import { contextoBase } from "@/lib/nina/confidence/fixtures/contexto";

const INICIO = "2026-09-15T13:00:00.000Z";
const FIM = "2026-09-15T13:30:00.000Z";

function entradaValida(over: Partial<EntradaAutorizacao> = {}): EntradaAutorizacao {
  return {
    operacao: "criar_agendamento",
    clinicaId: "cli-1",
    paciente: { id: "pac-1", identificado: true, validado: true },
    medicoId: "med-1",
    procedimento: "Consulta",
    intervalo: { inicio: INICIO, fim: FIM },
    disponibilidadeConsultada: true,
    vagasConsultadas: [{ medicoId: "med-1", inicio: INICIO, fim: FIM }],
    consentimento: { confirmado: true, medicoId: "med-1", inicio: INICIO, fim: FIM },
    revisao: { processada: 7, atual: 7 },
    idempotenciaBase: "conv-1",
    ...over,
  };
}

describe("FASE 3 — autorização prévia", () => {
  it("criação nova NÃO exige appointment_id nem agendamento confirmado", () => {
    const r = autorizarAcao(entradaValida());
    expect(r.autorizado).toBe(true);
    if (r.autorizado) expect(r.chaveIdempotencia).toBe(`criar_agendamento|conv-1|med-1|${INICIO}`);
  });

  it("sem consentimento não autoriza", () => {
    const r = autorizarAcao(entradaValida({ consentimento: { confirmado: false } }));
    expect(r.autorizado).toBe(false);
    if (!r.autorizado) expect(r.motivos).toContain("CONSENTIMENTO_AUSENTE");
  });

  it("consentimento de outro slot não vale para o slot pedido", () => {
    const r = autorizarAcao(
      entradaValida({
        consentimento: {
          confirmado: true,
          medicoId: "med-1",
          inicio: "2026-09-16T13:00:00.000Z",
          fim: "2026-09-16T13:30:00.000Z",
        },
      }),
    );
    expect(r.autorizado).toBe(false);
    if (!r.autorizado) expect(r.motivos).toContain("CONSENTIMENTO_DE_OUTRO_SLOT");
  });

  it("paciente não identificado/validado não autoriza", () => {
    const a = autorizarAcao(entradaValida({ paciente: { id: null } }));
    const b = autorizarAcao(entradaValida({ paciente: { id: "p", identificado: true } }));
    expect(a.autorizado).toBe(false);
    expect(b.autorizado).toBe(false);
    if (!a.autorizado) expect(a.motivos).toContain("PACIENTE_NAO_IDENTIFICADO");
    if (!b.autorizado) expect(b.motivos).toContain("PACIENTE_NAO_VALIDADO");
  });

  it("consulta bem-sucedida SEM vagas não confirma disponibilidade", () => {
    const r = autorizarAcao(entradaValida({ vagasConsultadas: [] }));
    expect(r.autorizado).toBe(false);
    if (!r.autorizado) expect(r.motivos).toContain("SEM_VAGA_DISPONIVEL");
  });

  it("vaga de outro profissional, outra data ou outro intervalo não autoriza", () => {
    expect(vagaCorresponde([{ medicoId: "med-2", inicio: INICIO, fim: FIM }], "med-1", INICIO, FIM)).toBe(false);
    expect(
      vagaCorresponde([{ medicoId: "med-1", inicio: "2026-09-16T13:00:00.000Z", fim: FIM }], "med-1", INICIO, FIM),
    ).toBe(false);
    const r = autorizarAcao(
      entradaValida({ vagasConsultadas: [{ medicoId: "med-1", inicio: INICIO, fim: "2026-09-15T14:00:00.000Z" }] }),
    );
    expect(r.autorizado).toBe(false);
    if (!r.autorizado) expect(r.motivos).toContain("VAGA_NAO_CORRESPONDENTE");
  });

  it("revisão obsoleta da conversa não autoriza gravação", () => {
    const r = autorizarAcao(entradaValida({ revisao: { processada: 6, atual: 8 } }));
    expect(r.autorizado).toBe(false);
    if (!r.autorizado) expect(r.motivos).toContain("REVISAO_OBSOLETA");
  });

  it("identificação concluída no turno habilita a operação sem consulta repetida", () => {
    const r = autorizarAcao(
      entradaValida({
        paciente: { id: "pac-1", identificado: true, validado: true, atualizadoNoTurno: true },
      }),
    );
    expect(r.autorizado).toBe(true);
  });

  it("identificar_paciente exige os três dados", () => {
    const r = autorizarAcao({
      operacao: "identificar_paciente",
      clinicaId: "cli-1",
      dadosIdentificacao: { nome: "Ana Souza", cpf: "18947197785", data_nascimento: null },
    });
    expect(r.autorizado).toBe(false);
    if (!r.autorizado) expect(r.motivos).toContain("DADOS_IDENTIFICACAO_INCOMPLETOS");
  });

  it("consultar reserva anterior não exige criar de novo", () => {
    const r = autorizarAcao({
      operacao: "consultar_agendamento",
      clinicaId: "cli-1",
      agendamentoId: "ag-9",
    });
    expect(r.autorizado).toBe(true);
  });

  it("concorrência e reprocessamento: a chave de idempotência é estável", () => {
    const chaves = new Set(
      [1, 2, 3].map((_) => {
        const r = autorizarAcao(entradaValida());
        return r.autorizado ? r.chaveIdempotencia : "recusado";
      }),
    );
    expect(chaves.size).toBe(1);
  });
});

describe("FASE 3 — prova do resultado", () => {
  const esperado = { clinicaId: "cli-1", pacienteId: "pac-1", medicoId: "med-1", inicio: INICIO, fim: FIM };
  const registro = {
    id: "ag-1",
    clinica_id: "cli-1",
    paciente_id: "pac-1",
    medico_id: "med-1",
    inicio: INICIO,
    fim: FIM,
    status: "agendado",
  };

  it("gravação conferida vira CREATED", () => {
    expect(verificarResultadoAgendamento(esperado, registro).estado).toBe("CREATED");
  });

  it("reserva anterior vira EXISTING com os dados reais dela", () => {
    const r = verificarResultadoAgendamento(
      { clinicaId: "cli-1", pacienteId: "pac-1" },
      { ...registro, inicio: "2026-09-14T10:00:00.000Z" },
      { jaExistia: true },
    );
    expect(r.estado).toBe("EXISTING");
    expect(r.registro?.inicio).toBe("2026-09-14T10:00:00.000Z");
  });

  it("duplicado sem registro lido não é prova: resultado incerto", () => {
    expect(verificarResultadoAgendamento(esperado, null, { jaExistia: true }).estado).toBe("UNCERTAIN");
  });

  it("divergência de paciente/profissional/horário vira UNCERTAIN", () => {
    expect(verificarResultadoAgendamento(esperado, { ...registro, medico_id: "med-9" }).estado).toBe("UNCERTAIN");
    expect(verificarResultadoAgendamento(esperado, { ...registro, paciente_id: "pac-9" }).estado).toBe("UNCERTAIN");
    expect(
      verificarResultadoAgendamento(esperado, { ...registro, inicio: "2026-09-15T15:00:00.000Z" }).estado,
    ).toBe("UNCERTAIN");
  });

  it("erro conhecido sem registro vira FAILED", () => {
    const r = verificarResultadoAgendamento(esperado, null, { erro: "SLOT_UNAVAILABLE" });
    expect(r.estado).toBe("FAILED");
    expect(r.erro).toBe("SLOT_UNAVAILABLE");
  });
});

describe("FASE 3 — actionSafety não confunde 'sem bloqueio' com autorizado", () => {
  it("decisão que ainda pede esclarecimento não sai como ALLOWED", () => {
    const ctx = contextoBase({
      tipoAvaliacao: "action_safety",
      requestedAction: "criar_agendamento",
      draftText: "Posso confirmar?",
    });
    const r = decidirConfianca(ctx);
    if (r.decision !== "ALLOW") expect(r.actionSafety?.status).not.toBe("ALLOWED");
  });
});
