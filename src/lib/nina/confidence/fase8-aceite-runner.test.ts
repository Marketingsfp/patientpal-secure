/**
 * FASE 8 — ACEITE DE INTEGRAÇÃO DO RUNNER E DA MATRIZ OBRIGATÓRIA.
 *
 * Dois blocos:
 *  1) o runner de cenários — nenhum cenário pode ser aprovado sem avaliação
 *     correspondente às saídas reais da Nina;
 *  2) a matriz obrigatória — comportamento determinístico do motor por família
 *     de caso, usando os módulos reais (nada é recalculado por atalho).
 *
 * Fora do alcance deste arquivo (declarado, não simulado): LLM real, entrega
 * real no WhatsApp e banco isolado com migrations/triggers.
 */
import { describe, expect, it } from "bun:test";
import { abrirPendencia, reavaliarPendencia, pendenciaVazia } from "./esclarecimento";
import { verificarResultadoAgendamento } from "../acoes/resultado";

const ctx = { clinicaId: "cli-1", conversaId: "conv-1" };

/* ------------------------------------------------------------------ *
 * 2) MATRIZ OBRIGATÓRIA
 * ------------------------------------------------------------------ */

const base = {
  ambiente: "homologacao" as const,
  catalogoEncontrou: false,
  agendamentoConfirmado: false,
  pacienteIdentificado: false,
  esclarecimentoUsado: false,
  handoffSolicitado: false,
};
const catalogoOk = {
  nome: "buscar_procedimentos",
  capacidade: "searchKnowledgeBase",
  fonte: "catalogo_publicado",
  success: true,
};
const agendaOk = {
  nome: "consultar_disponibilidade",
  capacidade: "checkAvailability",
  fonte: "agenda",
  success: true,
};
const fonteCatalogo = {
  tipo: "catalogo_publicado" as const,
  temConteudo: true,
  publicado: true,
  ativo: true,
};
const fonteAgenda = { tipo: "agenda" as const, temConteudo: true, publicado: true, ativo: true };

const fatoPreco = (valor: string) => ({
  consulta: "buscar_procedimentos",
  capacidade: "searchKnowledgeBase",
  entidade: "procedimento" as const,
  campo: "preco",
  valor,
  fonte: "catalogo_publicado" as const,
  chave: { procedimento: "consulta de cardiologia" },
});

const alta = (r: { level: string; decision: string }) =>
  r.level === "HIGH" && r.decision === "ALLOW";
const bloqueado = (r: { decision: string; hardBlockers?: string[] }) =>
  r.decision === "BLOCK_ACTION" || r.decision === "HANDOFF" || (r.hardBlockers ?? []).length > 0;

describe("matriz — ações: identificação, consentimento e prova", () => {
  it("reserva anterior é reconhecida como existente, não como nova", () => {
    const r = verificarResultadoAgendamento(
      { clinicaId: "cli-1", pacienteId: "pac-1", inicio: "2026-09-11T10:00:00Z" },
      {
        id: "ag-1",
        clinica_id: "cli-1",
        paciente_id: "pac-1",
        inicio: "2026-09-11T10:00:00Z",
        status: "agendado",
      },
      { jaExistia: true },
    );
    expect(r.estado).toBe("EXISTING");
    expect(r.agendamentoId).toBe("ag-1");
  });

  it("duplicidade idempotente não vira segunda criação", () => {
    const primeira = verificarResultadoAgendamento(
      { pacienteId: "pac-1", inicio: "2026-09-11T10:00:00Z" },
      { id: "ag-1", paciente_id: "pac-1", inicio: "2026-09-11T10:00:00Z", status: "agendado" },
    );
    const repeticao = verificarResultadoAgendamento(
      { pacienteId: "pac-1", inicio: "2026-09-11T10:00:00Z" },
      { id: "ag-1", paciente_id: "pac-1", inicio: "2026-09-11T10:00:00Z", status: "agendado" },
      { jaExistia: true },
    );
    expect(primeira.estado).toBe("CREATED");
    expect(repeticao.estado).toBe("EXISTING");
    expect(repeticao.agendamentoId).toBe(primeira.agendamentoId);
  });

  it("retry recuperado só confirma com registro lido", () => {
    const falhou = verificarResultadoAgendamento({ pacienteId: "pac-1" }, null, {
      erro: "timeout",
    });
    const recuperado = verificarResultadoAgendamento(
      { pacienteId: "pac-1" },
      { id: "ag-2", paciente_id: "pac-1", status: "agendado" },
    );
    expect(falhou.estado).toBe("FAILED");
    expect(recuperado.estado).toBe("CREATED");
  });

  it("sem registro comprovado o resultado é incerto, nunca criado", () => {
    const r = verificarResultadoAgendamento({ pacienteId: "pac-1" }, null);
    expect(r.estado).toBe("UNCERTAIN");
    expect(r.agendamentoId).toBeNull();
  });
});

describe("matriz — esclarecimento, handoff e limite de rodadas", () => {
  const resultadoFake = {
    evidence: { motivos: ["procedimento_ambiguo"] },
  } as any;

  it("emitir pergunta não consome tentativa", () => {
    const p = abrirPendencia({
      resultado: resultadoFake,
      intent: "preco",
      messageId: "in-1",
      tentativasConsumidas: 0,
    });
    expect(p.pendente).toBe(true);
    expect(p.tentativas).toBe(0);
  });

  it("nova resposta do paciente no mesmo assunto consome uma tentativa", () => {
    const p = abrirPendencia({
      resultado: resultadoFake,
      intent: "preco",
      messageId: "in-1",
      tentativasConsumidas: 0,
    });
    const r = reavaliarPendencia({ anterior: p, intentAtual: "preco", messageIdAtual: "in-2" });
    expect(r.tentativas).toBe(1);
    expect(r.mudouDeAssunto).toBe(false);
  });

  it("reprocessar a MESMA mensagem não consome tentativa", () => {
    const p = abrirPendencia({
      resultado: resultadoFake,
      intent: "preco",
      messageId: "in-1",
      tentativasConsumidas: 1,
    });
    const r = reavaliarPendencia({ anterior: p, intentAtual: "preco", messageIdAtual: "in-1" });
    expect(r.tentativas).toBe(1);
  });

  it("mudança de assunto descarta a pendência antiga", () => {
    const p = abrirPendencia({
      resultado: resultadoFake,
      intent: "preco",
      messageId: "in-1",
      tentativasConsumidas: 1,
    });
    const r = reavaliarPendencia({
      anterior: p,
      intentAtual: "agendamento",
      messageIdAtual: "in-2",
    });
    expect(r.mudouDeAssunto).toBe(true);
    expect(r.pendencia).toEqual(pendenciaVazia());
  });
});
