import { describe, expect, test } from "bun:test";
import { estadoVazio, normalizarEstado } from "../fluxo-estado-normalizar";
import { lembrarProcedimentoSolicitado, procedimentoDaSessao, vagaPreservaProcedimento } from "../procedimento-sessao";
import type { ResultadoConhecimento } from "../knowledge-contract";

function resultado(id = "servico-1", nome = "Ecocardiograma"): ResultadoConhecimento {
  return { found: true, knowledge_status: "found", source: "nina_catalogo", source_type: "catalog",
    tipo_atendimento: "exame_procedimento", base_version: null, base_file: null, procedure: nome,
    price: null, doctors: [], units: [], days: [], notes: [], trace: [], instrucao: "",
    records: [{ id, tipo: "servico", procedimento: nome }] };
}
function iniciar() {
  const estado = estadoVazio(); estado.session_id = "sessao-1";
  lembrarProcedimentoSolicitado(estado, "clinica-1", resultado());
  return estado;
}

describe("identidade do procedimento na sessão", () => {
  test("ID operacional sobrevive à serialização e recusa mesmo nome com outro ID", () => {
    const r = resultado(); r.records[0]!.extras = { procedimento_id: "proc-123" };
    const estado = estadoVazio(); estado.session_id = "sessao-1";
    lembrarProcedimentoSolicitado(estado, "clinica-1", r);
    const restaurado = normalizarEstado(JSON.parse(JSON.stringify(estado)));
    expect(procedimentoDaSessao(restaurado, "clinica-1")?.procedimento_id).toBe("proc-123");
    const vaga = { procedimento: "Ecocardiograma", catalogo_id: "servico-1", tipo_atendimento: "exame_procedimento", procedimento_id: "proc-123" };
    expect(vagaPreservaProcedimento(restaurado, "clinica-1", vaga)).toBe(true);
    expect(vagaPreservaProcedimento(restaurado, "clinica-1", { ...vaga, procedimento_id: "outro" })).toBe(false);
  });
  test("sobrevive à serialização e às pesquisas auxiliares", () => {
    const estado = normalizarEstado(JSON.parse(JSON.stringify(iniciar())));
    lembrarProcedimentoSolicitado(estado, "clinica-1", resultado("consulta-2", "Cardiologia"));
    expect(procedimentoDaSessao(estado, "clinica-1")?.catalogo_id).toBe("servico-1");
    expect(vagaPreservaProcedimento(estado, "clinica-1", {
      catalogo_id: "servico-1", tipo_atendimento: "exame_procedimento", procedimento: "Ecocardiograma",
    })).toBe(true);
    for (const vaga of [
      { catalogo_id: "outro", tipo_atendimento: "exame_procedimento", procedimento: "Ecocardiograma" },
      { catalogo_id: "servico-1", tipo_atendimento: "consulta", procedimento: "Ecocardiograma" },
      { catalogo_id: "servico-1", tipo_atendimento: "exame_procedimento", procedimento: "Consulta Cardiologia" },
    ]) expect(vagaPreservaProcedimento(estado, "clinica-1", vaga)).toBe(false);
  });
  test("não transporta pedido entre clínica, sessão ou reset", () => {
    const estado = iniciar();
    expect(procedimentoDaSessao(estado, "outra-clinica")).toBeNull();
    estado.session_id = "nova-sessao";
    expect(procedimentoDaSessao(estado, "clinica-1")).toBeNull();
    expect(procedimentoDaSessao(estadoVazio(), "clinica-1")).toBeNull();
  });
  test("novo pedido explícito limpa escolha e aceite anteriores", () => {
    const estado = iniciar(); estado.appointment.procedure = "Ecocardiograma";
    estado.appointment.slot_confirmed_by_patient = true;
    lembrarProcedimentoSolicitado(estado, "clinica-1", resultado("servico-2", "Ecobiometria"), true);
    expect(procedimentoDaSessao(estado, "clinica-1")?.nome).toBe("Ecobiometria");
    expect(estado.appointment.procedure).toBeNull();
    expect(estado.appointment.slot_confirmed_by_patient).toBe(false);
    expect(estado.appointment.slot_options).toBeNull();
    expect(estado.appointment.confirmation).toBeNull();
  });
  test.each(["consulta", "ambiguo", "nao_encontrado"])("novo pedido %s não herda procedimento antigo", modo => {
    const estado = iniciar(); const r = resultado();
    if (modo === "consulta") r.records[0]!.tipo = "profissional";
    if (modo === "ambiguo") r.esclarecimento = { tipo: "procedimento", pergunta: "Qual?", opcoes: [] };
    if (modo === "nao_encontrado") r.found = false;
    lembrarProcedimentoSolicitado(estado, "clinica-1", r, true);
    expect(procedimentoDaSessao(estado, "clinica-1")).toBeNull();
  });
  test("não escolhe automaticamente entre dois IDs com mesmo nome", () => {
    const estado = estadoVazio(); estado.session_id = "sessao-1";
    const r = resultado(); r.records.push({ ...r.records[0], id: "outro-servico" });
    lembrarProcedimentoSolicitado(estado, "clinica-1", r);
    expect(procedimentoDaSessao(estado, "clinica-1")).toBeNull();
  });
});
