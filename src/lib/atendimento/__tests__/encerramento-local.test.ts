import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { aplicarEncerramentoLocal } from "../encerramento-local";
import { conversaComNina, podeEncerrarConversa } from "../perfil-atendimento";

describe("encerramento na tela (17/10/2026)", () => {
  const aberta: {
    id: string;
    status: string;
    owner_type: string;
    atribuida_user_id: string | null;
    last_assigned_user_id: string | null;
    resolved_by?: string | null;
  } = {
    id: "c1",
    status: "active",
    owner_type: "HUMAN",
    atribuida_user_id: "ana",
    last_assigned_user_id: "bia",
  };

  it("marca encerrada com os mesmos campos que o servidor grava", () => {
    const r = aplicarEncerramentoLocal(aberta, "c1", "gestor");
    expect(r).toEqual({
      id: "c1",
      status: "closed",
      owner_type: "AI",
      atribuida_user_id: null,
      last_assigned_user_id: "ana",
      resolved_by: "gestor",
    });
    // Encerrada não volta a ser "conversa com a Nina" na tela.
    expect(conversaComNina(r)).toBe(false);
  });

  it("não mexe em outra conversa", () => {
    expect(aplicarEncerramentoLocal(aberta, "outra", "ana")).toBe(aberta);
  });

  it("a tela libera o botão sem esperar a lista recarregar", () => {
    const tela = readFileSync("src/components/nina/AtendimentoExtraTabs.tsx", "utf8");
    const fechar = tela.slice(
      tela.indexOf("const fechar = async"),
      tela.indexOf("const statusBadge"),
    );
    expect(fechar).toContain("aplicarEncerramentoLocal(");
    // Recarga em segundo plano: o "Encerrando…" some antes dela.
    expect(fechar.indexOf("setFechando(false)")).toBeLessThan(fechar.indexOf("carregarConvs()"));
    expect(fechar).not.toContain("await Promise.all([\n        carregarConvs()");
  });

  it("regra de quem pode encerrar não muda", () => {
    expect(
      podeEncerrarConversa({ userId: "bia", responsavelId: "ana", admin: false, gestor: false }),
    ).toBe(false);
  });
});
