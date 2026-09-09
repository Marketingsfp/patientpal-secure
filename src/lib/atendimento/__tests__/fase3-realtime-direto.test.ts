/**
 * FASE 3 — a mensagem entregue pelo tempo real vira bolha sem nova consulta.
 *
 * Cenários exigidos: render direto sem buscar de novo, evento duplicado,
 * resposta do envio antes do tempo real, tempo real antes da resposta,
 * mensagem da própria sessão (otimista) e fallback quando o payload não serve.
 */
import { describe, expect, it } from "bun:test";
import { normalizarMensagemRealtime } from "../mensagem-realtime";
import { mesclarNovas } from "../atualizacao-incremental";
import { criarMensagemOtimista, ehOtimista, inserirOtimista } from "../envio-otimista";

const CTX = { clinicaId: "cl-1", conversaAberta: "c1" };

function evento(extra: Record<string, any> = {}, tipo = "INSERT") {
  return {
    table: "whatsapp_mensagens",
    eventType: tipo,
    new: {
      id: "db-1",
      clinica_id: "cl-1",
      conversa_id: "c1",
      direction: "in",
      body: "oi",
      tipo: "text",
      recebida_em: "2026-09-09T19:00:00.000Z",
      ...extra,
    },
  } as any;
}

describe("payload usado diretamente", () => {
  it("normaliza a linha recebida, sem depender de listarMensagens", () => {
    const r = normalizarMensagemRealtime(evento(), CTX);
    expect(r.usar).toBe(true);
    if (!r.usar) return;
    expect(r.conversaId).toBe("c1");
    expect(r.mensagem.id).toBe("db-1");
    expect(r.mensagem.body).toBe("oi");
    expect(r.mensagem.optimistic).toBe(false);
    // Render imediato: a bolha existe só com o que o evento trouxe.
    expect(mesclarNovas([], [r.mensagem])).toHaveLength(1);
  });

  it("o mesmo evento duas vezes continua sendo uma mensagem", () => {
    const r1 = normalizarMensagemRealtime(evento(), CTX);
    const r2 = normalizarMensagemRealtime(evento(), CTX);
    if (!r1.usar || !r2.usar) throw new Error("payload deveria servir");
    let msgs = mesclarNovas([], [r1.mensagem]);
    msgs = mesclarNovas(msgs, [r2.mensagem]);
    expect(msgs).toHaveLength(1);
  });
});

describe("mensagem da própria sessão", () => {
  const otimista = criarMensagemOtimista({
    conversaId: "c1",
    texto: "bom dia",
    clientMessageId: "u1",
  });
  const linhaOficial = {
    id: "db-9",
    client_message_id: "u1",
    direction: "out",
    body: "bom dia",
    enviada_por: "humano",
    recebida_em: otimista.recebida_em,
  };

  it("tempo real reconcilia a bolha otimista em vez de criar outra", () => {
    const r = normalizarMensagemRealtime(evento(linhaOficial), CTX);
    if (!r.usar) throw new Error("payload deveria servir");
    const msgs = mesclarNovas(inserirOtimista([], otimista), [r.mensagem]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe("db-9");
    expect(ehOtimista(msgs[0])).toBe(false);
  });

  it("resposta do envio antes do tempo real: uma mensagem", () => {
    let msgs = inserirOtimista([], otimista);
    msgs = mesclarNovas(msgs, [linhaOficial]); // resposta HTTP
    const r = normalizarMensagemRealtime(evento(linhaOficial), CTX);
    if (!r.usar) throw new Error("payload deveria servir");
    msgs = mesclarNovas(msgs, [r.mensagem]); // tempo real depois
    expect(msgs).toHaveLength(1);
  });

  it("tempo real antes da resposta do envio: uma mensagem", () => {
    let msgs = inserirOtimista([], otimista);
    const r = normalizarMensagemRealtime(evento(linhaOficial), CTX);
    if (!r.usar) throw new Error("payload deveria servir");
    msgs = mesclarNovas(msgs, [r.mensagem]); // tempo real primeiro
    msgs = mesclarNovas(msgs, [linhaOficial]); // resposta HTTP depois
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe("db-9");
  });
});

describe("fallback preservado", () => {
  const casos: Array<[string, any, string]> = [
    ["outra conversa", evento({ conversa_id: "c2" }), "conversa_nao_aberta"],
    ["outra clínica", evento({ clinica_id: "cl-2" }), "outra_clinica"],
    ["sem clínica na linha", evento({ clinica_id: null }), "clinica_ausente"],
    ["sem data", evento({ recebida_em: null }), "sem_data"],
    ["sem conteúdo", evento({ body: "" }), "sem_conteudo"],
    ["direção inválida", evento({ direction: "x" }), "direcao_invalida"],
    ["console de homologação", evento({ is_teste: true }), "homologacao"],
    ["exclusão", { table: "whatsapp_mensagens", eventType: "DELETE", new: null }, "evento_nao_suportado"],
    ["outra tabela", { table: "atend_conversas", eventType: "INSERT", new: {} }, "tabela"],
  ];

  for (const [nome, ev, motivo] of casos) {
    it(`não usa o payload: ${nome}`, () => {
      const r = normalizarMensagemRealtime(ev, CTX);
      expect(r.usar).toBe(false);
      if (!r.usar) expect(r.motivo).toBe(motivo);
    });
  }

  it("com nenhuma conversa aberta, o histórico não é tocado", () => {
    const r = normalizarMensagemRealtime(evento(), { clinicaId: "cl-1", conversaAberta: null });
    expect(r.usar).toBe(false);
  });
});
