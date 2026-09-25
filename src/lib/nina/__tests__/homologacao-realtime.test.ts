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
  criarControleHistorico,
  revisaoHistoricoLead,
  reconciliarCargaHistorico,
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

describe("chat aberto acompanha o card sem trocar de lead", () => {
  const lead = {
    conversaId: "conv", cicloId: "ciclo", sessao: 38, mensagens: 1,
    ultimaMensagemId: "m1", ultimaMensagemTexto: "oi",
  };

  it("atualizações do paciente e da Nina invalidam o histórico do mesmo lead", () => {
    const r1 = revisaoHistoricoLead(lead);
    const paciente = { ...lead, mensagens: 2, ultimaMensagemId: "m2", ultimaMensagemTexto: "Quero marcar" };
    const nina = { ...paciente, mensagens: 3, ultimaMensagemId: "m3", ultimaMensagemTexto: "Qual consulta?" };
    expect(revisaoHistoricoLead(paciente)).not.toBe(r1);
    expect(revisaoHistoricoLead(nina)).not.toBe(revisaoHistoricoLead(paciente));
  });

  it("recupera conversa criada após reset mesmo sem evento Realtime aceito", () => {
    const reiniciado = { ...lead, conversaId: null, mensagens: 0, ultimaMensagemId: null };
    const novaConversa = { ...reiniciado, conversaId: "nova", mensagens: 1 };
    expect(aceitaMensagemRealtime(linha({ conversa_id: "nova" }), { ...alvo, conversaId: null })).toBe(false);
    expect(revisaoHistoricoLead(novaConversa)).not.toBe(revisaoHistoricoLead(reiniciado));
  });

  it("leitura do card não dispara um ciclo infinito de recargas", () => {
    expect(revisaoHistoricoLead({ ...lead, ...{ naoLidas: 0 } }))
      .toBe(revisaoHistoricoLead({ ...lead, ...{ naoLidas: 2 } }));
  });

  it("edição de texto, sessão e ciclo também atualizam a revisão", () => {
    for (const alteracao of [{ ultimaMensagemTexto: "corrigido" }, { sessao: 39 }, { cicloId: "novo" }]) {
      expect(revisaoHistoricoLead({ ...lead, ...alteracao })).not.toBe(revisaoHistoricoLead(lead));
    }
  });
});

describe("respostas de histórico fora de ordem", () => {
  it("carga antiga não sobrescreve a carga mais recente", () => {
    const controle = criarControleHistorico();
    controle.selecionar("cli:lead:0");
    const antiga = controle.iniciar();
    const nova = controle.iniciar();
    expect(controle.aceita(nova)).toBe(true);
    expect(controle.aceita(antiga)).toBe(false);
    controle.selecionar("cli:lead:0");
    expect(controle.aceita(nova)).toBe(true);
  });

  it("trocar A → B → A não permite resposta da primeira visita", () => {
    const controle = criarControleHistorico();
    controle.selecionar("cli:A:0");
    const antiga = controle.iniciar();
    controle.selecionar("cli:B:0");
    controle.selecionar("cli:A:0");
    expect(controle.aceita(antiga)).toBe(false);
  });

  it("reiniciar ou trocar de clínica invalida requisição em voo", () => {
    for (const novo of ["cli:A:1", "outra:A:0"]) {
      const controle = criarControleHistorico();
      controle.selecionar("cli:A:0");
      const antiga = controle.iniciar();
      controle.selecionar(novo);
      expect(controle.aceita(antiga)).toBe(false);
    }
  });

  it("histórico iniciado antes da resposta não apaga a nova bolha da Nina", () => {
    const paciente = paraMensagemTimeline(linha());
    const nina = paraMensagemTimeline(linha({ id: "nina", wa_message_id: "reply", direction: "out" }));
    const resultado = reconciliarCargaHistorico([paciente], [], [paciente], [paciente, nina]);
    expect(resultado.map((m) => m.id)).toEqual(["m1", "nina"]);
  });

  it("UPDATE recebido em voo prevalece sobre o snapshot antigo", () => {
    const antiga = paraMensagemTimeline(linha());
    const atualizada = paraMensagemTimeline(linha({ body: "texto atualizado" }));
    const resultado = reconciliarCargaHistorico([antiga], [], [antiga], [atualizada]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].body).toBe("texto atualizado");
  });

  it("mantém os envios pendentes e não duplica quando histórico e Realtime chegam juntos", () => {
    const pendente = otimista("k1", "Olá");
    const oficial = paraMensagemTimeline(linha());
    expect(reconciliarCargaHistorico([], [pendente], [], [pendente])[0].estado).toBe("pending");
    const resultado = reconciliarCargaHistorico([oficial], [pendente], [pendente], [oficial]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("m1");
  });
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
