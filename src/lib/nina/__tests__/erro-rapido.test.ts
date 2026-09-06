import { describe, expect, it } from "bun:test";
import {
  CATEGORIA_A_CLASSIFICAR,
  ORIGEM_ERRO_RAPIDO,
  ehConflitoDuplicidade,
  montarRegistroErroRapido,
  validarMensagemNina,
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
