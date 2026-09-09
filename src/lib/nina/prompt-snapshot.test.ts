/**
 * FASE 5 — snapshot do prompt + dossiê do avaliador Sol.
 *
 * Provas: hash determinístico, imutabilidade do snapshot, texto real chegando
 * ao Sol e mensagem legada NUNCA reconstruída com o prompt atual.
 */
import { describe, expect, test } from "bun:test";
import { criarColetor } from "./evidencias";
import { hashDoTexto } from "./confidence/hash";
import { montarInputSol, type Dossie } from "./avaliador-sol";

const base = (instrucoes: Dossie["instrucoes"]): Dossie => ({
  cenario: "Paciente pergunta preço",
  objetivo: "Informar preço publicado",
  criteriosEsperados: ["não inventar valor"],
  instrucoes,
  turnos: [],
  ferramentas: [],
  conhecimento: [],
  eventos: [],
  execucoes: [],
  resultadoFinal: null,
});

describe("hash do behavior prompt", () => {
  test("mesmo conteúdo, mesmo hash", () => {
    expect(hashDoTexto("Você é a Nina.")).toBe(hashDoTexto("Você é a Nina."));
  });

  test("uma palavra alterada muda o hash", () => {
    expect(hashDoTexto("Você é a Nina.")).not.toBe(hashDoTexto("Você era a Nina."));
  });
});

describe("snapshot da execução", () => {
  const snap = {
    behaviorPromptTemplate: "template v4",
    behaviorPromptRendered: "prompt v4 renderizado",
    behaviorPromptHash: hashDoTexto("prompt v4 renderizado") ?? "",
    envelopeTecnico: "envelope",
    runtimeContext: { agora: "2026-09-10T12:00:00Z" },
    requestFinal: "envelope + prompt + contexto",
    model: null,
    modelParameters: { perfil: "whatsapp" },
    toolSchemas: ["consultar_catalogo"],
  };

  test("é imutável: a primeira captura é a que vale", () => {
    const c = criarColetor();
    c.promptSnapshot(snap);
    c.promptSnapshot({ ...snap, behaviorPromptRendered: "prompt v5 renderizado" });
    expect(c.pacote().snapshot?.behaviorPromptRendered).toBe("prompt v4 renderizado");
  });

  test("sem captura, o pacote não inventa snapshot", () => {
    expect(criarColetor().pacote().snapshot).toBeNull();
  });
});

describe("dossiê do Sol", () => {
  test("recebe o texto real utilizado na resposta", () => {
    const input = montarInputSol(
      base({
        versao: 4,
        publicadoEm: "2026-09-01T00:00:00Z",
        origem: "publicada",
        hash: "t1:abc:10",
        textoUtilizado: "CONTEUDO EXATO DA V4",
      }),
    );
    const texto = JSON.stringify(input);
    expect(texto).toContain("CONTEUDO EXATO DA V4");
    expect(texto).toContain("t1:abc:10");
  });

  test("mensagem legada: declara ausência em vez de usar o prompt atual", () => {
    const input = montarInputSol(
      base({ versao: null, publicadoEm: null, origem: null }),
    );
    const texto = JSON.stringify(input);
    expect(texto).toContain("Snapshot do prompt não disponível para esta execução.");
    expect(texto).toContain("evidência insuficiente");
  });
});
