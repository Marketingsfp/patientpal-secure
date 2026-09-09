import { describe, expect, it } from "bun:test";
import { criarReconciliadorRetomada, motivoDeRetomada } from "../retomada";

function relogio() {
  let t = 0;
  return { agora: () => t, avancar: (ms: number) => (t += ms) };
}

describe("FASE 2 — reconciliação ao retomar a Inbox", () => {
  it("A — aba volta a ficar visível e a lista é conferida sem F5", () => {
    const c = relogio();
    let lista = ["A"];
    const servidor = ["A"];
    const r = criarReconciliadorRetomada({
      executar: () => {
        lista = [...servidor];
      },
      agora: c.agora,
    });

    // Aba em segundo plano: a transferência acontece sem chegar aviso.
    servidor.push("X");
    expect(lista).not.toContain("X");

    const motivo = motivoDeRetomada("visibilitychange", "visible");
    expect(motivo).toBe("visibility");
    r.solicitar(motivo!);
    expect(lista).toContain("X");
  });

  it("B — internet volta e a lista se reconcilia sozinha", () => {
    const c = relogio();
    let n = 0;
    const r = criarReconciliadorRetomada({ executar: () => n++, agora: c.agora });
    expect(motivoDeRetomada("online", "visible")).toBe("online");
    r.solicitar("online");
    expect(n).toBe(1);
  });

  it("C — foco e visibilidade juntos geram uma única conferência", () => {
    const c = relogio();
    let n = 0;
    const r = criarReconciliadorRetomada({ executar: () => n++, agora: c.agora, janelaMs: 1500 });
    expect(r.solicitar("focus")).toBe(true);
    c.avancar(20);
    expect(r.solicitar("visibility")).toBe(false);
    c.avancar(30);
    expect(r.solicitar("online")).toBe(false);
    expect(n).toBe(1);
    expect(r.motivos()).toEqual(["focus", "visibility", "online"]);

    // Passada a janela, uma nova retomada volta a conferir.
    c.avancar(2000);
    expect(r.solicitar("visibility")).toBe(true);
    expect(n).toBe(2);
  });

  it("D — ir para segundo plano ou perder o foco não recarrega nada", () => {
    expect(motivoDeRetomada("visibilitychange", "hidden")).toBeNull();
    expect(motivoDeRetomada("focus", "hidden")).toBeNull();
  });

  it("sem retomada não existe consulta periódica: nada executa sozinho", () => {
    const c = relogio();
    let n = 0;
    criarReconciliadorRetomada({ executar: () => n++, agora: c.agora });
    c.avancar(60_000);
    expect(n).toBe(0);
  });
});
