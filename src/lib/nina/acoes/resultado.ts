/**
 * FASE 3 — PROVA DO RESULTADO DAS AÇÕES (parte pura, testável).
 *
 * Depois de executar, a Nina só pode afirmar aquilo que o registro REAL
 * comprova. Este módulo compara o que foi pedido com o que foi lido no banco e
 * classifica o desfecho:
 *
 * - CREATED   — gravou agora e a leitura confere;
 * - EXISTING  — já existia (idempotência): os dados vêm da reserva existente;
 * - FAILED    — não gravou, com erro conhecido;
 * - UNCERTAIN — executou, mas a leitura não comprova (ou diverge).
 *
 * `duplicado: true` sozinho NUNCA é prova: sem registro lido o desfecho é
 * UNCERTAIN.
 */

export type EstadoResultadoAcao = "CREATED" | "EXISTING" | "FAILED" | "UNCERTAIN";

export type RegistroAgendamento = {
  id?: string | null;
  clinica_id?: string | null;
  paciente_id?: string | null;
  medico_id?: string | null;
  inicio?: string | null;
  fim?: string | null;
  status?: string | null;
};

export type EsperadoAgendamento = {
  clinicaId?: string | null;
  pacienteId?: string | null;
  medicoId?: string | null;
  inicio?: string | null;
  fim?: string | null;
};

export type ResultadoAcaoAgendamento = {
  estado: EstadoResultadoAcao;
  agendamentoId: string | null;
  /** Dados REAIS lidos do registro — nunca ecoam o pedido. */
  registro: RegistroAgendamento | null;
  divergencias: string[];
  erro?: string | null;
};

const vazio = (v?: string | null) => !v || String(v).trim() === "";

function mesmoInstante(a?: string | null, b?: string | null): boolean {
  if (vazio(a) || vazio(b)) return false;
  const ta = Date.parse(String(a));
  const tb = Date.parse(String(b));
  if (Number.isNaN(ta) || Number.isNaN(tb)) return String(a).trim() === String(b).trim();
  return ta === tb;
}

function comparar(esperado: EsperadoAgendamento, lido: RegistroAgendamento): string[] {
  const d: string[] = [];
  if (!vazio(esperado.clinicaId) && String(lido.clinica_id ?? "") !== String(esperado.clinicaId))
    d.push("clinica");
  if (!vazio(esperado.pacienteId) && String(lido.paciente_id ?? "") !== String(esperado.pacienteId))
    d.push("paciente");
  if (!vazio(esperado.medicoId) && String(lido.medico_id ?? "") !== String(esperado.medicoId))
    d.push("profissional");
  if (!vazio(esperado.inicio) && !mesmoInstante(lido.inicio, esperado.inicio)) d.push("inicio");
  if (!vazio(esperado.fim) && !vazio(lido.fim) && !mesmoInstante(lido.fim, esperado.fim))
    d.push("fim");
  if (vazio(lido.id)) d.push("id");
  if (vazio(lido.status)) d.push("status");
  return d;
}

/**
 * Classifica o desfecho de uma tentativa de agendamento.
 *
 * @param jaExistia quando true, o registro lido é uma reserva ANTERIOR
 *                  (idempotência) e não uma criação deste turno.
 */
export function verificarResultadoAgendamento(
  esperado: EsperadoAgendamento,
  lido: RegistroAgendamento | null,
  opcoes?: { jaExistia?: boolean; erro?: string | null },
): ResultadoAcaoAgendamento {
  const erro = opcoes?.erro ?? null;
  if (erro && !lido) return { estado: "FAILED", agendamentoId: null, registro: null, divergencias: [], erro };
  if (!lido || vazio(lido.id))
    return {
      estado: "UNCERTAIN",
      agendamentoId: null,
      registro: null,
      divergencias: ["registro_nao_lido"],
      erro,
    };

  const divergencias = comparar(esperado, lido);
  // Divergência de paciente/profissional/horário: não dá para afirmar nada.
  const graves = divergencias.filter((d) => d !== "fim");
  if (graves.length > 0)
    return { estado: "UNCERTAIN", agendamentoId: String(lido.id), registro: lido, divergencias, erro };

  const cancelado = String(lido.status ?? "").toLowerCase() === "cancelado";
  if (cancelado)
    return {
      estado: "UNCERTAIN",
      agendamentoId: String(lido.id),
      registro: lido,
      divergencias: ["status_cancelado"],
      erro,
    };

  return {
    estado: opcoes?.jaExistia ? "EXISTING" : "CREATED",
    agendamentoId: String(lido.id),
    registro: lido,
    divergencias: [],
    erro: null,
  };
}
