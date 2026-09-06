import { describe, expect, it } from "bun:test";
import { classificarEvento, criarAgrupador } from "../realtime-roteador";

const ctx = { clinicaId: "cl-1", conversaAberta: "A" };

describe("Fase 3 — roteamento de eventos do atendimento", () => {
  it("mensagem no lead B atualiza lista/espera, mas não o histórico de A", () => {
    const alvos = classificarEvento(
      { table: "whatsapp_mensagens", eventType: "INSERT", new: { clinica_id: "cl-1", conversa_id: "B" } },
      ctx,
    );
    expect(alvos.sort()).toEqual(["espera", "lista"]);
  });

  it("mensagem na conversa aberta também sincroniza o histórico", () => {
    const alvos = classificarEvento(
      { table: "whatsapp_mensagens", eventType: "INSERT", new: { clinica_id: "cl-1", conversa_id: "A" } },
      ctx,
    );
    expect(alvos).toContain("conversa");
  });

  it("evento de outra clínica é ignorado", () => {
    expect(
      classificarEvento(
        { table: "whatsapp_mensagens", new: { clinica_id: "outra", conversa_id: "A" } },
        ctx,
      ),
    ).toEqual([]);
  });

  it("conversa do console de homologação não mexe no atendimento real", () => {
    expect(
      classificarEvento(
        { table: "atend_conversas", new: { clinica_id: "cl-1", id: "A", is_teste: true } },
        ctx,
      ),
    ).toEqual([]);
  });

  it("transferência, encerramento e exclusão continuam atualizando a lista", () => {
    for (const ev of [
      { table: "atend_conversas", eventType: "UPDATE", new: { clinica_id: "cl-1", id: "Z", atribuida_user_id: "u2" } },
      { table: "atend_conversas", eventType: "UPDATE", new: { clinica_id: "cl-1", id: "Z", status: "closed" } },
      { table: "atend_conversas", eventType: "INSERT", new: { clinica_id: "cl-1", id: "novo" } },
      { table: "atend_conversas", eventType: "DELETE", old: { clinica_id: "cl-1", id: "Z" } },
    ]) {
      expect(classificarEvento(ev as any, ctx)).toContain("lista");
    }
  });

  it("mudança na própria conversa aberta atualiza lista e conversa", () => {
    const alvos = classificarEvento(
      { table: "atend_conversas", eventType: "UPDATE", new: { clinica_id: "cl-1", id: "A", status: "closed" } },
      ctx,
    );
    expect(alvos).toContain("lista");
    expect(alvos).toContain("conversa");
  });

  it("nota interna e resumo de handoff só atualizam o apoio da conversa aberta", () => {
    expect(
      classificarEvento(
        { table: "atend_notas_internas", new: { clinica_id: "cl-1", conversa_id: "A" } },
        ctx,
      ),
    ).toEqual(["apoio"]);
    expect(
      classificarEvento(
        { table: "atend_handoff_resumos", new: { clinica_id: "cl-1", conversa_id: "B" } },
        ctx,
      ),
    ).toEqual([]);
  });

  it("evento de estado de outra conversa não recarrega o histórico aberto", () => {
    expect(
      classificarEvento(
        { table: "atend_conversa_eventos", new: { clinica_id: "cl-1", conversa_id: "B" } },
        ctx,
      ),
    ).toEqual([]);
  });

  it("tabela desconhecida mantém o comportamento conservador", () => {
    expect(classificarEvento({ table: "outra_tabela", new: {} }, ctx)).toEqual(["lista"]);
  });
});

describe("Fase 3 — agrupamento com teto", () => {
  function relogio() {
    let t = 0;
    let seq = 0;
    const timers = new Map<number, { em: number; fn: () => void }>();
    return {
      agora: () => t,
      agendarTimer: (fn: () => void, ms: number) => {
        const id = ++seq;
        timers.set(id, { em: t + ms, fn });
        return id;
      },
      cancelarTimer: (id: any) => timers.delete(id),
      avancar(ms: number) {
        const fim = t + ms;
        let proximo = [...timers.entries()].filter(([, x]) => x.em <= fim).sort((a, b) => a[1].em - b[1].em)[0];
        while (proximo) {
          t = proximo[1].em;
          timers.delete(proximo[0]);
          proximo[1].fn();
          proximo = [...timers.entries()].filter(([, x]) => x.em <= fim).sort((a, b) => a[1].em - b[1].em)[0];
        }
        t = fim;
      },
    };
  }

  it("junta eventos próximos numa execução só", () => {
    const c = relogio();
    let n = 0;
    const g = criarAgrupador({ executar: () => n++, atrasoMs: 400, tetoMs: 1500, ...c });
    g.agendar();
    c.avancar(100);
    g.agendar();
    c.avancar(100);
    g.agendar();
    expect(n).toBe(0);
    c.avancar(400);
    expect(n).toBe(1);
  });

  it("tráfego contínuo não adia a atualização além do teto", () => {
    const c = relogio();
    let n = 0;
    const g = criarAgrupador({ executar: () => n++, atrasoMs: 400, tetoMs: 1000, ...c });
    for (let i = 0; i < 20; i++) {
      g.agendar();
      c.avancar(100);
    }
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it("cancelar encerra o temporizador pendente", () => {
    const c = relogio();
    let n = 0;
    const g = criarAgrupador({ executar: () => n++, atrasoMs: 400, tetoMs: 1000, ...c });
    g.agendar();
    g.cancelar();
    c.avancar(2000);
    expect(n).toBe(0);
    expect(g.pendente()).toBe(false);
  });

  it("descarregarAgora executa o pendente na reconexão", () => {
    const c = relogio();
    let n = 0;
    const g = criarAgrupador({ executar: () => n++, atrasoMs: 400, tetoMs: 1000, ...c });
    g.agendar();
    g.descarregarAgora();
    expect(n).toBe(1);
    c.avancar(2000);
    expect(n).toBe(1);
  });
});
