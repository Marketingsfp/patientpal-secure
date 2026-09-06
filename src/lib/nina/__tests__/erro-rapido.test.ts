import { describe, expect, it } from "bun:test";
import {
  CATEGORIA_A_CLASSIFICAR,
  ORIGEM_ERRO_RAPIDO,
  ehConflitoDuplicidade,
  montarRegistroErroRapido,
  validarMensagemNina,
  deveMostrarBotaoReporte,
  avisoReporte,
  ROTULO_REPORTE,
  TEXTO_REPORTE_DUPLICADO,
  TEXTO_REPORTE_FALHA,
  TEXTO_REPORTE_SUCESSO,
  estadoAuditoria,
} from "@/lib/nina/erro-rapido";

const CONVERSA = "11111111-1111-4111-8111-111111111111";
const OUTRA = "22222222-2222-4222-8222-222222222222";
const MENSAGEM = "33333333-3333-4333-8333-333333333333";
const CLINICA = "44444444-4444-4444-8444-444444444444";
const USUARIO = "55555555-5555-4555-8555-555555555555";

const msgNina = {
  id: MENSAGEM,
  conversa_id: CONVERSA,
  clinica_id: CLINICA,
  direction: "out",
  enviada_por: "nina",
  body: "Linha 1\nLinha 2\n\n  Linha 4 com espaços  ",
};

describe("reporte rápido de erro da Nina", () => {
  it("aceita mensagem da Nina e preserva o conteúdo exato", () => {
    const r = validarMensagemNina(msgNina, CONVERSA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.snapshot).toBe(msgNina.body);
  });

  it("recusa mensagem vinculada a outra conversa", () => {
    const r = validarMensagemNina(msgNina, OUTRA);
    expect(r).toMatchObject({ ok: false, motivo: "conversa_divergente" });
  });

  it("recusa mensagem de outro autor (paciente ou atendente)", () => {
    expect(
      validarMensagemNina({ ...msgNina, direction: "in", enviada_por: "paciente" }, CONVERSA),
    ).toMatchObject({ ok: false, motivo: "autor_invalido" });
    expect(validarMensagemNina({ ...msgNina, enviada_por: "humano" }, CONVERSA)).toMatchObject({
      ok: false,
      motivo: "autor_invalido",
    });
    expect(validarMensagemNina({ ...msgNina, enviada_por: "sistema" }, CONVERSA)).toMatchObject({
      ok: false,
      motivo: "autor_invalido",
    });
  });

  it("recusa mensagem inexistente ou sem conteúdo", () => {
    expect(validarMensagemNina(null, CONVERSA)).toMatchObject({
      ok: false,
      motivo: "mensagem_inexistente",
    });
    expect(validarMensagemNina({ ...msgNina, body: null }, CONVERSA)).toMatchObject({
      ok: false,
      motivo: "sem_conteudo",
    });
  });

  it("registra sem correção, com categoria neutra, origem e status pendente", () => {
    const r = validarMensagemNina(msgNina, CONVERSA);
    if (!r.ok) throw new Error("esperava mensagem válida");
    const registro = montarRegistroErroRapido({
      clinicaId: CLINICA,
      conversaId: CONVERSA,
      mensagemId: MENSAGEM,
      snapshot: r.snapshot,
      reporterUserId: USUARIO,
    });
    expect(registro).toMatchObject({
      clinica_id: CLINICA,
      conversa_id: CONVERSA,
      mensagem_id: MENSAGEM,
      mensagem_texto: msgNina.body,
      categoria: CATEGORIA_A_CLASSIFICAR,
      correcao: null,
      observacao: null,
      status: "pending",
      origem: ORIGEM_ERRO_RAPIDO,
      reportado_por: USUARIO,
    });
    expect(ORIGEM_ERRO_RAPIDO).toBe("nina_message_quick_report");
  });

  it("reconhece o conflito de duplicidade do banco", () => {
    expect(ehConflitoDuplicidade({ code: "23505" })).toBe(true);
    expect(ehConflitoDuplicidade({ code: "23503" })).toBe(false);
    expect(ehConflitoDuplicidade(null)).toBe(false);
  });
});

describe("botão de reporte rápido no chat", () => {
  it("aparece só em mensagens com autoria da Nina no sistema", () => {
    expect(deveMostrarBotaoReporte({ direction: "out", enviada_por: "nina" })).toBe(true);
    expect(deveMostrarBotaoReporte({ direction: "out", enviada_por: "humano" })).toBe(false);
    expect(deveMostrarBotaoReporte({ direction: "in", enviada_por: "paciente" })).toBe(false);
    expect(deveMostrarBotaoReporte({ direction: "out", enviada_por: "sistema" })).toBe(false);
  });

  it("não usa a palavra 'Nina' no texto para decidir a autoria", () => {
    expect(
      deveMostrarBotaoReporte({ direction: "in", enviada_por: "paciente" } as never),
    ).toBe(false);
  });

  it("mostra o aviso certo para sucesso e para reporte já pendente", () => {
    expect(avisoReporte({ duplicado: false })).toEqual({
      tipo: "sucesso",
      texto: TEXTO_REPORTE_SUCESSO,
    });
    expect(avisoReporte({ duplicado: true })).toEqual({
      tipo: "duplicado",
      texto: TEXTO_REPORTE_DUPLICADO,
    });
    expect(avisoReporte(null).texto).toBe(TEXTO_REPORTE_SUCESSO);
    expect(TEXTO_REPORTE_FALHA).toBe("Não foi possível registrar o erro. Tente novamente.");
    expect(ROTULO_REPORTE).toBe("Reportar erro da Nina");
  });
});

describe("estado da auditoria técnica do reporte", () => {
  const agora = Date.parse("2026-01-10T12:00:00Z");

  it("mensagem antiga sem execução vinculada fica Indisponível", () => {
    expect(
      estadoAuditoria({
        execucaoId: null,
        mensagemCriadaEmMs: agora - 60 * 60 * 1000,
        agoraMs: agora,
      }),
    ).toBe("unavailable");
  });

  it("mensagem recém-enviada sem vínculo ainda aparece Em processamento", () => {
    expect(
      estadoAuditoria({ execucaoId: null, mensagemCriadaEmMs: agora - 5_000, agoraMs: agora }),
    ).toBe("processing");
  });

  it("execução vinculada mas ainda não encontrada fica Em processamento", () => {
    expect(estadoAuditoria({ execucaoId: "exec-1", execucao: null, agoraMs: agora })).toBe(
      "processing",
    );
  });

  it("execução incompleta fica Parcial e execução completa fica Disponível", () => {
    expect(
      estadoAuditoria({
        execucaoId: "exec-1",
        execucao: { model: "gemini", latency_ms: null, created_at: "2026-01-10T11:59:00Z" },
      }),
    ).toBe("partial");
    expect(
      estadoAuditoria({
        execucaoId: "exec-1",
        execucao: { model: "gemini", latency_ms: 800, created_at: "2026-01-10T11:59:00Z" },
      }),
    ).toBe("available");
  });

  it("o registro guarda a execução da mensagem clicada, não a última da conversa", () => {
    const r = montarRegistroErroRapido({
      clinicaId: "c1",
      conversaId: "cv1",
      mensagemId: "m-antiga",
      snapshot: "texto",
      reporterUserId: "u1",
      execucaoId: "exec-da-mensagem",
      auditoriaStatus: "available",
    });
    expect(r.execucao_id).toBe("exec-da-mensagem");
    expect(r.auditoria_status).toBe("available");
    expect(r.mensagem_id).toBe("m-antiga");
    expect(r.status).toBe("pending");
    expect(r.correcao).toBeNull();
  });

  it("sem execução o reporte continua válido, apenas sem auditoria", () => {
    const r = montarRegistroErroRapido({
      clinicaId: "c1",
      conversaId: "cv1",
      mensagemId: "m1",
      snapshot: "texto",
      reporterUserId: "u1",
    });
    expect(r.execucao_id).toBeNull();
    expect(r.auditoria_status).toBe("unavailable");
  });
});
