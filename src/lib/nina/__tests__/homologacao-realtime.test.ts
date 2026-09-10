/**
 * Tempo real da Homologação: isolamento por ambiente e reconciliação das
 * bolhas otimistas — três mensagens continuam sendo três bolhas.
 */
import { describe, expect, it } from "bun:test";
import {
  aceitaMensagemRealtime,
  mesclarMensagemTimeline,
  paraMensagemTimeline,
  reconciliarHistorico,
  waIdDoEnvio,
  type MensagemTimeline,
} from "../homologacao-realtime";

const alvo = { ambiente: "homologacao" as const, clinicaId: "cli", conversaId: "conv" };

const linha = (extra: Record<string, unknown> = {}) => ({
  id: "m1",
  clinica_id: "cli",
  conversa_id: "conv",
  canal: "test-console",
  wa_message_id: waIdDoEnvio("lead", "k1"),
  direction: "in",
  body: "Olá",
  enviada_por: "paciente",
  created_at: "2026-09-10T03:00:01.000Z",
  is_teste: true,
  ...extra,
});

const otimista = (chave: string, texto: string): MensagemTimeline => ({
  id: `otimista:${chave}`,
  conversa_id: "conv",
  direction: "in",
  body: texto,
  enviada_por: "paciente",
  created_at: "2026-09-10T03:00:00.000Z",
  wa_message_id: waIdDoEnvio("lead", chave),
  estado: "pending",
});

describe("isolamento por ambiente", () => {
  it("homologação aceita apenas mensagem de teste da conversa aberta", () => {
    expect(aceitaMensagemRealtime(linha(), alvo)).toBe(true);
  });

  it("homologação recusa mensagem real do WhatsApp", () => {
    expect(aceitaMensagemRealtime(linha({ is_teste: false, canal: "whatsapp" }), alvo)).toBe(false);
    expect(aceitaMensagemRealtime(linha({ is_teste: null, canal: null }), alvo)).toBe(false);
  });

  it("produção recusa mensagem de teste e aceita a real", () => {
    const prod = { ambiente: "producao" as const, clinicaId: "cli", conversaId: "conv" };
    expect(aceitaMensagemRealtime(linha(), prod)).toBe(false);
    expect(aceitaMensagemRealtime(linha({ is_teste: false, canal: "whatsapp" }), prod)).toBe(true);
  });

  it("recusa outra clínica, outra conversa ou conversa fechada", () => {
    expect(aceitaMensagemRealtime(linha({ clinica_id: "outra" }), alvo)).toBe(false);
    expect(aceitaMensagemRealtime(linha({ conversa_id: "outra" }), alvo)).toBe(false);
    expect(aceitaMensagemRealtime(linha(), { ...alvo, conversaId: null })).toBe(false);
  });
});

describe("reconciliação sem duplicar", () => {
  it("a mensagem oficial mescla na bolha otimista, mantendo uma só", () => {
    const lista = mesclarMensagemTimeline([otimista("k1", "Olá")], paraMensagemTimeline(linha()));
    expect(lista).toHaveLength(1);
    expect(lista[0]!.id).toBe("m1");
    expect(lista[0]!.estado).toBe("confirmed");
  });

  it("não altera o horário já exibido (sem flicker)", () => {
    const lista = mesclarMensagemTimeline([otimista("k1", "Olá")], paraMensagemTimeline(linha()));
    expect(lista[0]!.created_at).toBe("2026-09-10T03:00:00.000Z");
  });

  it("mantém a posição da bolha na timeline", () => {
    const antes: MensagemTimeline[] = [
      { id: "x", direction: "out", body: "anterior", enviada_por: "nina", created_at: "2026-09-10T02:59:00.000Z" },
      otimista("k1", "Olá"),
      { id: "z", direction: "out", body: "depois", enviada_por: "nina", created_at: "2026-09-10T03:00:05.000Z" },
    ];
    const lista = mesclarMensagemTimeline(antes, paraMensagemTimeline(linha()));
    expect(lista.map((m) => m.id)).toEqual(["x", "m1", "z"]);
  });

  it("INSERT seguido de UPDATE atualiza a mesma bolha", () => {
    let lista = mesclarMensagemTimeline([otimista("k1", "Olá")], paraMensagemTimeline(linha()));
    lista = mesclarMensagemTimeline(lista, paraMensagemTimeline(linha({ body: "Olá (corrigido)" })));
    expect(lista).toHaveLength(1);
    expect(lista[0]!.body).toBe("Olá (corrigido)");
  });

  it("Realtime repetido não cria bolha nova", () => {
    let lista: MensagemTimeline[] = [];
    for (let i = 0; i < 3; i++) lista = mesclarMensagemTimeline(lista, paraMensagemTimeline(linha()));
    expect(lista).toHaveLength(1);
  });

  it("resposta da Nina entra na timeline sem esperar o histórico", () => {
    const lista = mesclarMensagemTimeline(
      [otimista("k1", "Olá")],
      paraMensagemTimeline(linha({ id: "m2", direction: "out", enviada_por: "nina", wa_message_id: "test-lead-k1-reply" })),
    );
    expect(lista).toHaveLength(2);
  });

  it("três mensagens rápidas continuam três bolhas depois da confirmação", () => {
    const textos = { a: "Olá", b: "Quero marcar", c: "Neurologista" } as const;
    let lista: MensagemTimeline[] = [otimista("a", textos.a), otimista("b", textos.b), otimista("c", textos.c)];
    expect(lista).toHaveLength(3);
    for (const [i, chave] of (["a", "b", "c"] as const).entries()) {
      lista = mesclarMensagemTimeline(
        lista,
        paraMensagemTimeline(
          linha({ id: `db-${i}`, body: textos[chave], wa_message_id: waIdDoEnvio("lead", chave) }),
        ),
      );
    }
    expect(lista).toHaveLength(3);
    expect(lista.map((m) => m.body)).toEqual(["Olá", "Quero marcar", "Neurologista"]);
  });
});

describe("carga do histórico (recuperação/refresh)", () => {
  it("preserva a bolha que o servidor ainda não tem", () => {
    const lista = reconciliarHistorico([], [otimista("k1", "Olá")]);
    expect(lista).toHaveLength(1);
  });

  it("não duplica quando o servidor já gravou a mensagem", () => {
    const lista = reconciliarHistorico([paraMensagemTimeline(linha())], [otimista("k1", "Olá")]);
    expect(lista).toHaveLength(1);
    expect(lista[0]!.id).toBe("m1");
  });

  it("Realtime atrasado depois da carga não duplica", () => {
    const base = reconciliarHistorico([paraMensagemTimeline(linha())], []);
    const lista = mesclarMensagemTimeline(base, paraMensagemTimeline(linha()));
    expect(lista).toHaveLength(1);
  });
});
