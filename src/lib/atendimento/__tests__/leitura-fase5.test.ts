import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  deveRegistrarLeituraAoAbrir,
  deveRegistrarLeituraDeNovas,
  aplicarReconciliacao,
} from "../leitura-inbox";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * FASE 5 — a leitura é só leitura.
 *
 * Estes testes travam as garantias combinadas: abrir/visualizar registra
 * apenas o marcador individual e não mexe em resposta, atribuição, status,
 * tempo de espera nem no contador histórico da conversa.
 */
describe("Fase 5 — leitura não é resposta", () => {
  const fns = src("src/lib/atendimento.functions.ts");
  const marcarLida = fns.slice(
    fns.indexOf("export const marcarLida"),
    fns.indexOf("export const", fns.indexOf("export const marcarLida") + 10),
  );

  it("marcarLida não escreve em atend_conversas", () => {
    expect(marcarLida).not.toMatch(/from\("atend_conversas"\)[\s\S]*?\.update\(/);
    expect(marcarLida).not.toMatch(/unread_count/);
  });

  it("marcarLida não altera atribuição, status, espera ou pendências", () => {
    for (const campo of [
      "atribuida_user_id",
      "aguardando_desde",
      "primeiro_resp_em",
      "closed_at",
      "nina_fluxo_estado",
    ]) {
      expect(marcarLida.includes(campo)).toBe(false);
    }
  });

  it("marcarLida só usa as rotinas de leitura individual", () => {
    expect(marcarLida).toMatch(/atend_registrar_leitura/);
    expect(marcarLida).toMatch(/atend_nao_lidas/);
  });

  it("transferência não copia nem apaga marcadores de leitura", () => {
    const transf = fns.slice(
      fns.indexOf("export const transferirConversa"),
      fns.indexOf("export const", fns.indexOf("export const transferirConversa") + 10),
    );
    expect(transf.includes("atend_leituras")).toBe(false);
    expect(transf.includes("atend_registrar_leitura")).toBe(false);
  });

  it("abrir a conversa na tela não assume nem resolve automaticamente", () => {
    const ui = src("src/components/nina/AtendimentoExtraTabs.tsx");
    const efeito = ui.slice(
      ui.indexOf("const marcarLidaFn = useServerFn(marcarLida)"),
      ui.indexOf("const marcarLidaFn = useServerFn(marcarLida)") + 4000,
    );
    expect(efeito.includes("assumirFn(")).toBe(false);
    expect(efeito.includes("resolver")).toBe(false);
  });
});

describe("Fase 5 — cenários obrigatórios", () => {
  const base = {
    conversaId: "c1",
    conversaCarregadaId: "c1",
    abaVisivel: true,
    userId: "maria",
    atribuidaUserId: "maria" as string | null,
    ehGestor: false,
    aberturaPorAlvo: false,
    ultimaMensagemId: "m10",
    ultimaRegistradaId: null as string | null,
  };

  it("atendente abre e visualiza → registra leitura", () => {
    expect(deveRegistrarLeituraAoAbrir(base)).toBe(true);
  });

  it("administrador abre (e chega ao fim) → não registra leitura", () => {
    expect(deveRegistrarLeituraAoAbrir({ ...base, userId: "admin", ehGestor: true })).toBe(false);
    expect(
      deveRegistrarLeituraDeNovas({
        ...base,
        userId: "admin",
        ehGestor: true,
        seguindoFim: true,
      }),
    ).toBe(false);
  });

  it("abertura pela auditoria/revisão (mensagem antiga) não marca as novas", () => {
    expect(deveRegistrarLeituraAoAbrir({ ...base, aberturaPorAlvo: true })).toBe(false);
  });

  it("lendo histórico antigo → novas continuam sinalizadas", () => {
    expect(deveRegistrarLeituraDeNovas({ ...base, seguindoFim: false })).toBe(false);
  });

  it("conversa transferida: nova responsável não herda a leitura da anterior", () => {
    // Maria era responsável; após transferir para Jean, o contexto é de Jean,
    // que ainda não tem marcador — a leitura só é registrada quando ele abre.
    expect(
      deveRegistrarLeituraAoAbrir({ ...base, userId: "jean", atribuidaUserId: "maria" }),
    ).toBe(false);
    expect(
      deveRegistrarLeituraAoAbrir({ ...base, userId: "jean", atribuidaUserId: "jean" }),
    ).toBe(true);
  });


  it("mensagem que chega durante a gravação não é zerada por resposta antiga", () => {
    const r = aplicarReconciliacao({
      sequenciaResposta: 1,
      sequenciaAtual: 2,
      naoLidasBackend: 0,
      naoLidasAnterior: 4,
    });
    expect(r.aplicar).toBe(false);
  });

  it("backend é a fonte da verdade após a gravação", () => {
    const r = aplicarReconciliacao({
      sequenciaResposta: 3,
      sequenciaAtual: 3,
      naoLidasBackend: 1,
      naoLidasAnterior: 4,
    });
    expect(r).toEqual({ aplicar: true, valor: 1 });
  });

  it("falha de gravação devolve o número verdadeiro (não esconde a bolinha)", () => {
    const r = aplicarReconciliacao({
      sequenciaResposta: 2,
      sequenciaAtual: 2,
      naoLidasBackend: null,
      naoLidasAnterior: 4,
    });
    expect(r).toEqual({ aplicar: true, valor: 4 });
  });
});
