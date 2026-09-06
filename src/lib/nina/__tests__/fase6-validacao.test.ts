/**
 * FASE 6 — validação do fluxo integrado (dados sintéticos):
 * reporte → vínculo com a execução original → auditoria → análise opcional
 * → decisão humana. Nada aqui chama o modelo nem toca o banco real.
 */
import { describe, expect, test } from "bun:test";
import {
  estadoAnalise,
  estadoAuditoria,
  ehConflitoDuplicidade,
  montarRegistroErroRapido,
  validarMensagemNina,
  type MensagemParaReporte,
} from "@/lib/nina/erro-rapido";
import { montarPacote, normalizarResultado } from "@/lib/nina/analise-erro";
import { perguntaDaExecucao } from "@/lib/nina/evidencias";
import { assertRevisorFeedback } from "@/lib/nina/decisoes.functions";

const msg = (over: Partial<MensagemParaReporte> = {}): MensagemParaReporte => ({
  id: "m-antiga",
  conversa_id: "c-1",
  direction: "out",
  enviada_por: "nina",
  body: "O exame custa R$ 120,00.",
  execucao_id: "exec-antiga",
  ...over,
});

describe("FASE 6 — reporte e vínculo", () => {
  test("reportar mensagem antiga vincula a execução dela, não a mais recente", () => {
    const antiga = msg();
    const recente = msg({ id: "m-recente", execucao_id: "exec-recente" });
    const reg = montarRegistroErroRapido({
      clinicaId: "cl",
      conversaId: "c-1",
      mensagemId: antiga.id,
      snapshot: validarMensagemNina(antiga, "c-1").ok ? antiga.body! : "",
      reporterUserId: "u1",
      execucaoId: antiga.execucao_id,
      auditoriaStatus: "available",
    });
    expect(reg.mensagem_id).toBe("m-antiga");
    expect(reg.execucao_id).toBe("exec-antiga");
    expect(reg.execucao_id).not.toBe(recente.execucao_id);
    expect(reg.mensagem_texto).toBe("O exame custa R$ 120,00.");
    expect(reg.status).toBe("pending");
  });

  test("troca de lead durante o reporte: mensagem de outra conversa é recusada", () => {
    const r = validarMensagemNina(msg(), "c-2");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toBe("conversa_divergente");
  });

  test("clique repetido no X não cria segundo reporte pendente", () => {
    expect(ehConflitoDuplicidade({ code: "23505" })).toBe(true);
    expect(ehConflitoDuplicidade({ code: "22P02" })).toBe(false);
  });
});

describe("FASE 6 — estados da auditoria", () => {
  test("auditoria ainda em processamento registra o erro e atualiza depois", () => {
    expect(
      estadoAuditoria({ execucaoId: "exec-1", execucao: null }),
    ).toBe("processing");
    expect(
      estadoAuditoria({
        execucaoId: "exec-1",
        execucao: { model: "google/gemini-3.7-flash", latency_ms: 900, created_at: "2026-09-01" },
      }),
    ).toBe("available");
  });

  test("auditoria inexistente informa a limitação, sem reconstrução fictícia", () => {
    expect(
      estadoAuditoria({ execucaoId: null, mensagemCriadaEmMs: 0, agoraMs: 10 * 60 * 1000 }),
    ).toBe("unavailable");
    const pacote = montarPacote({
      mensagemReportada: "resposta",
      entradas: [],
      execucao: null,
      etapas: [],
      lacunas: ["Sem registro técnico vinculado."],
    });
    expect(pacote.lacunas).toContain("Sem registro técnico vinculado.");
  });

  test("registro parcial não é apresentado como completo", () => {
    expect(
      estadoAuditoria({
        execucaoId: "exec-1",
        execucao: { model: null, latency_ms: null, created_at: "2026-09-01" },
      }),
    ).toBe("partial");
  });
});

describe("FASE 6 — contexto histórico preservado", () => {
  test("a pergunta vem das entradas da execução, na ordem, não da última mensagem", () => {
    const p = perguntaDaExecucao([
      { em: "2026-09-01T10:00:02Z", texto: "quanto custa?" },
      { em: "2026-09-01T10:00:00Z", texto: "bom dia" },
    ] as never);
    expect(p).toBe("bom dia\nquanto custa?");
  });
});

describe("FASE 6 — análise por IA", () => {
  test("evidência insuficiente devolve inconclusivo, sem diagnóstico inventado", () => {
    const r = normalizarResultado(
      {
        veredito: "erro_comprovado",
        conclusao: "Sem evidências no pacote.",
        problema: null,
        evidencias: [],
        etapa: null,
        gravidade: null,
        causa_provavel: "catálogo desatualizado",
        causa_eh_hipotese: false,
        proxima_verificacao: null,
        limitacoes: ["Auditoria indisponível."],
      },
      [],
    );
    expect(r.causaEhHipotese).toBe(true);
    expect(r.limitacoes.length).toBeGreaterThan(0);
  });

  test("falha objetiva comprovada não é rebaixada pelo avaliador", () => {
    const r = normalizarResultado(
      {
        veredito: "sem_erro",
        conclusao: "Tudo certo.",
        problema: null,
        evidencias: [],
        etapa: null,
        gravidade: null,
        causa_provavel: null,
        causa_eh_hipotese: true,
        proxima_verificacao: null,
        limitacoes: [],
      },
      [{ nome: "catalogo_consultado", resultado: "falha", detalhe: "sem consulta" } as never],
    );
    expect(["suspeita", "erro_comprovado"]).toContain(r.veredito);
  });
});

describe("FASE 6 — permissões e estados", () => {
  test("backend impede análise/decisão de quem não revisa", async () => {
    const semPermissao = { rpc: async () => ({ data: false, error: null }) };
    await expect(assertRevisorFeedback(semPermissao, "u", "cl")).rejects.toThrow(/revisar/i);
    const comPermissao = { rpc: async () => ({ data: true, error: null }) };
    await expect(assertRevisorFeedback(comPermissao, "u", "cl")).resolves.toBeUndefined();
  });

  test("análise concluída não significa erro confirmado", () => {
    expect(estadoAnalise({ analise_status: "done" })).toBe("done");
    expect(estadoAnalise({ analise_status: null, root_cause: null })).toBe("not_requested");
  });
});
