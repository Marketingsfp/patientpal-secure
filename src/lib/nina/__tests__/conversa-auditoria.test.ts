/**
 * FASE 5 — testes da funcionalidade "Ver conversa" (modal de auditoria).
 * Cobre vínculo exato, ausência de vínculo, localização por id e timestamps.
 */
import { describe, expect, it } from "bun:test";
import {
  autorDe,
  avisoAuditoria,
  curto,
  estadoAuditoria,
  fmtHora,
  localizarMensagem,
  montarTimeline,
  type MensagemAuditoria,
} from "../conversa-auditoria";

const msg = (over: Partial<MensagemAuditoria> & { id: string }): MensagemAuditoria => ({
  direction: "out",
  body: "Boa tarde!",
  tipo: "text",
  enviada_por: "nina",
  recebida_em: "2026-09-05T16:51:52.000Z",
  media_url: null,
  media_mime: null,
  ...over,
});

describe("ver conversa — vínculo exato", () => {
  it("TESTE 1/8 — o estado depende do conversa_id do reporte, nunca do lead", () => {
    // dois erros do mesmo lead, em conversas diferentes
    expect(estadoAuditoria({ conversaId: "conv-2", mensagemId: "m2", mensagemEncontrada: true }))
      .toBe("ok");
    expect(estadoAuditoria({ conversaId: "conv-3", mensagemId: "m9", mensagemEncontrada: true }))
      .toBe("ok");
  });

  it("TESTE 6 — sem conversa vinculada mostra erro e não sugere outra conversa", () => {
    const e = estadoAuditoria({ conversaId: null, mensagemId: "m1" });
    expect(e).toBe("sem-conversa");
    expect(avisoAuditoria(e)).toBe(
      "Não foi possível localizar a conversa exata vinculada a este reporte.",
    );
  });

  it("TESTE 6 — falha ao carregar a conversa também não abre outra", () => {
    const e = estadoAuditoria({ conversaId: "conv-x", mensagemId: "m1", erroCarregamento: true });
    expect(e).toBe("falha-conversa");
    expect(avisoAuditoria(e)).toContain("Não foi possível localizar a conversa exata");
  });

  it("TESTE 7 — conversa válida com mensagem inexistente avisa sem destacar aproximação", () => {
    const e = estadoAuditoria({
      conversaId: "conv-2",
      mensagemId: "m-apagada",
      mensagemEncontrada: false,
    });
    expect(e).toBe("mensagem-nao-encontrada");
    expect(avisoAuditoria(e)).toBe(
      "Conversa localizada, mas a mensagem original do reporte não foi encontrada.",
    );
    expect(localizarMensagem([msg({ id: "m1" })], "m-apagada")).toBeNull();
  });

  it("reporte antigo sem mensagem indica vínculo histórico indisponível", () => {
    const e = estadoAuditoria({ conversaId: "conv-2", mensagemId: null });
    expect(e).toBe("sem-mensagem-vinculada");
    expect(avisoAuditoria(e)).toBe("Vínculo histórico exato indisponível.");
  });
});

describe("ver conversa — mensagem reportada", () => {
  it("TESTE 2/9 — localiza pelo id, mesmo com textos idênticos", () => {
    const lista = [
      msg({ id: "m1", body: "Boa tarde, Jean! Como posso ajudar você hoje?" }),
      msg({
        id: "m2",
        body: "Boa tarde, Jean! Como posso ajudar você hoje?",
        recebida_em: "2026-09-05T17:10:00.000Z",
      }),
    ];
    const alvo = localizarMensagem(lista, "m2");
    expect(alvo?.id).toBe("m2");
    expect(alvo?.recebida_em).toBe("2026-09-05T17:10:00.000Z");
    // e nunca a primeira só porque o texto bate
    expect(lista.findIndex((m) => m.id === alvo?.id)).toBe(1);
  });

  it("TESTE 2 — contexto anterior e posterior continua disponível", () => {
    const lista = [msg({ id: "a" }), msg({ id: "b" }), msg({ id: "c" })];
    const tl = montarTimeline(lista, []);
    expect(tl).toHaveLength(3);
  });
});

describe("ver conversa — timestamps e autoria", () => {
  it("TESTE 3 — todas as mensagens exibem DD/MM/AAAA HH:mm:ss", () => {
    for (const m of [msg({ id: "a" }), msg({ id: "b", enviada_por: "paciente", direction: "in" })]) {
      expect(fmtHora(m.recebida_em)).toMatch(/^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}:\d{2}$/);
    }
    expect(fmtHora("2026-09-05T16:51:52.000Z")).toContain("05/09/2026");
    expect(fmtHora("2026-09-05T16:51:52.000Z")).toContain("13:51:52");
  });

  it("TESTE 10 — data da mensagem e data do reporte são formatadas separadamente", () => {
    const dataMensagem = fmtHora("2026-09-05T16:51:52.000Z");
    const dataReporte = fmtHora("2026-09-06T14:01:22.000Z");
    expect(dataMensagem).not.toBe(dataReporte);
    expect(dataMensagem).toContain("05/09/2026");
    expect(dataReporte).toContain("06/09/2026");
  });

  it("autoria não depende do lado do balão", () => {
    expect(autorDe({ enviada_por: "sistema", direction: "out" }, null)).toBe("Sistema");
    expect(autorDe({ enviada_por: "nina", direction: "in" }, null)).toBe("Nina");
    expect(autorDe({ enviada_por: "humano", direction: "out" }, "Ana")).toBe("Atendente — Ana");
    expect(autorDe({ enviada_por: "paciente", direction: "out" }, null)).toBe("Paciente");
    expect(autorDe({ enviada_por: null, direction: "in" }, null)).toBe("Paciente");
  });

  it("linha do tempo mistura mensagens e eventos em ordem cronológica", () => {
    const tl = montarTimeline(
      [
        msg({ id: "m1", recebida_em: "2026-09-05T16:00:00.000Z" }),
        msg({ id: "m2", recebida_em: "2026-09-05T18:00:00.000Z" }),
      ],
      [{ id: "e1", created_at: "2026-09-05T17:00:00.000Z" }],
    );
    expect(tl.map((i) => (i.kind === "msg" ? i.msg.id : i.ev.id))).toEqual(["m1", "e1", "m2"]);
  });

  it("códigos curtos ajudam o cabeçalho da auditoria", () => {
    expect(curto("2c9f1d3e-aaaa-bbbb-cccc-ddddeeeeffff")).toBe("2C9F1D3E");
    expect(curto(null)).toBeNull();
  });
});
