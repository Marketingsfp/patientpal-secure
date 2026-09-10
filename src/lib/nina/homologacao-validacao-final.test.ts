/**
 * HOMOLOGAÇÃO MANUAL — validação final (auditoria dos cenários 1..12).
 *
 * Reutiliza os mecanismos já existentes (janela canônica do Message Burst,
 * reconciliação otimista/Realtime e isolamento por ambiente). Nenhuma
 * arquitetura nova: os cenários apenas exercitam o que já está implementado.
 */
import { describe, expect, it } from "bun:test";
import {
  MAX_BURST_WINDOW_MS,
  QUIET_WINDOW_MS,
  decidirEspera,
  montarTurnoPaciente,
} from "@/lib/nina/burst";
import {
  CANAL_HOMOLOGACAO,
  aceitaMensagemRealtime,
  mesclarMensagemTimeline,
  paraMensagemTimeline,
  reconciliarHistorico,
  waIdDoEnvio,
  type MensagemTimeline,
} from "@/lib/nina/homologacao-realtime";

/** Espelha as RPCs `nina_batch_*`: lote persistente com reserva atômica. */
class Banco {
  mensagens: { id: string; body: string }[] = [];
  lotes: {
    id: string;
    status: "COLLECTING" | "PROCESSING" | "PROCESSED";
    revision: number;
    firstMs: number;
    mensagens: string[];
  }[] = [];
  execucoes = 0;
  respostas: string[] = [];
  revisaoConversa = 0;
  private seq = 0;

  persistir(body: string) {
    const id = `m${this.mensagens.length + 1}`;
    this.mensagens.push({ id, body });
    this.revisaoConversa += 1;
    return id;
  }

  registrar(mensagemId: string, agoraMs: number) {
    let lote = this.lotes.find((l) => l.status === "COLLECTING");
    if (!lote) {
      lote = {
        id: `b${++this.seq}`,
        status: "COLLECTING",
        revision: 0,
        firstMs: agoraMs,
        mensagens: [],
      };
      this.lotes.push(lote);
    }
    lote.revision += 1;
    lote.mensagens.push(mensagemId);
    return { batchId: lote.id, revision: lote.revision, firstMs: lote.firstMs };
  }

  reivindicar(batchId: string, revision: number, forcar: boolean) {
    const lote = this.lotes.find((l) => l.id === batchId);
    if (!lote || lote.status !== "COLLECTING" || (!forcar && lote.revision !== revision)) {
      return { reivindicado: false, mensagens: [] as string[] };
    }
    lote.status = "PROCESSING";
    return { reivindicado: true, mensagens: [...lote.mensagens] };
  }

  concluir(batchId: string) {
    const lote = this.lotes.find((l) => l.id === batchId);
    if (lote) lote.status = "PROCESSED";
  }
}

/** Mesma sequência de `processarMensagemTeste`, com relógio controlado. */
async function enviar(banco: Banco, texto: string, agoraMs: number) {
  const mensagemId = banco.persistir(texto);
  const reg = banco.registrar(mensagemId, agoraMs);
  const { esperaMs, forcar } = decidirEspera(agoraMs, reg.firstMs);
  await Promise.resolve();
  const claim = banco.reivindicar(reg.batchId, reg.revision, forcar);
  if (!claim.reivindicado) {
    return { processamento: "AGRUPADA" as const, reply: null, mensagemPersistida: true, esperaMs };
  }
  banco.execucoes += 1;
  const turno = montarTurnoPaciente(
    claim.mensagens.map((id) => banco.mensagens.find((m) => m.id === id)!.body),
  );
  const reply = `resposta<${turno}>`;
  banco.respostas.push(reply);
  banco.concluir(reg.batchId);
  return { processamento: "RESPONDIDA" as const, reply, mensagemPersistida: true, esperaMs };
}

/** Rajada: todas as chamadas partem antes de qualquer reserva ser feita. */
async function rajada(banco: Banco, textos: { texto: string; ms: number }[]) {
  return await Promise.all(textos.map((t) => enviar(banco, t.texto, t.ms)));
}

describe("cenário 1 — burst básico (3 mensagens)", () => {
  it("gera 3 mensagens físicas, 1 lote, 1 execução e 1 resposta", async () => {
    const banco = new Banco();
    const r = await rajada(banco, [
      { texto: "Olá", ms: 0 },
      { texto: "Quero marcar uma consulta", ms: 300 },
      { texto: "De neurologista", ms: 600 },
    ]);

    expect(banco.mensagens.length).toBe(3);
    expect(banco.lotes.length).toBe(1);
    expect(banco.execucoes).toBe(1);
    expect(banco.respostas.length).toBe(1);
    // A resposta considera o conjunto, não só o último fragmento.
    expect(banco.respostas[0]).toContain("Olá");
    expect(banco.respostas[0]).toContain("De neurologista");
    // Agrupamento não é erro: as absorvidas retornam AGRUPADA e persistidas.
    expect(r.filter((x) => x.processamento === "AGRUPADA").length).toBe(2);
    expect(r.every((x) => x.mensagemPersistida)).toBe(true);
  });
});

describe("cenário 2 — cinco fragmentos na mesma rajada", () => {
  it("mantém 5 mensagens físicas com 1 execução e 1 resposta", async () => {
    const banco = new Banco();
    await rajada(banco, [
      { texto: "Oi", ms: 0 },
      { texto: "quero", ms: 200 },
      { texto: "marcar", ms: 400 },
      { texto: "uma consulta", ms: 700 },
      { texto: "de neuro", ms: 900 },
    ]);
    expect(banco.mensagens.length).toBe(5);
    expect(banco.execucoes).toBe(1);
    expect(banco.respostas.length).toBe(1);
  });

  it("respeita o teto oficial da janela sem duplicar constantes", () => {
    expect(QUIET_WINDOW_MS).toBe(1000);
    expect(MAX_BURST_WINDOW_MS).toBe(2500);
    // Depois do teto, a espera é forçada a fechar o turno.
    expect(decidirEspera(MAX_BURST_WINDOW_MS + 10, 0).forcar).toBe(true);
  });
});

describe("cenário 3 — mensagens espaçadas", () => {
  it("gera turnos e respostas independentes", async () => {
    const banco = new Banco();
    await enviar(banco, "Bom dia", 0);
    await enviar(banco, "Ainda está aí?", 60_000);
    expect(banco.mensagens.length).toBe(2);
    expect(banco.lotes.length).toBe(2);
    expect(banco.execucoes).toBe(2);
    expect(banco.respostas.length).toBe(2);
  });
});

describe("cenário 6 e 7 — optimistic UI, reconciliação e Realtime atrasado", () => {
  const otimista = (chave: string, body: string): MensagemTimeline => ({
    id: `otimista:${chave}`,
    conversa_id: "conv-1",
    direction: "in",
    body,
    enviada_por: "paciente",
    created_at: new Date(1_700_000_000_000).toISOString(),
    wa_message_id: waIdDoEnvio("lead-1", chave),
    estado: "pending",
  });

  it("mescla o registro oficial na bolha otimista sem duplicar", () => {
    const bolha = otimista("k1", "Olá");
    const oficial = paraMensagemTimeline({
      id: "msg-oficial",
      conversa_id: "conv-1",
      direction: "in",
      body: "Olá",
      enviada_por: "paciente",
      created_at: new Date(1_700_000_000_500).toISOString(),
      wa_message_id: waIdDoEnvio("lead-1", "k1"),
      is_teste: true,
      canal: CANAL_HOMOLOGACAO,
    });
    const lista = mesclarMensagemTimeline([bolha], oficial);
    expect(lista.length).toBe(1);
    expect(lista[0]!.id).toBe("msg-oficial");
    expect(lista[0]!.estado).not.toBe("pending");
  });

  it("mantém a bolha na tela enquanto o Realtime não chega (atraso)", () => {
    const bolha = otimista("k2", "Consulta");
    // Histórico ainda sem a mensagem oficial: a bolha não pode sumir.
    const lista = reconciliarHistorico([], [bolha]);
    expect(lista.length).toBe(1);
    expect(lista[0]!.id).toBe("otimista:k2");
  });

  it("não duplica quando histórico e Realtime trazem a mesma mensagem", () => {
    const oficial: MensagemTimeline = {
      id: "msg-1",
      conversa_id: "conv-1",
      direction: "in",
      body: "Olá",
      enviada_por: "paciente",
      created_at: new Date(1_700_000_000_500).toISOString(),
      wa_message_id: waIdDoEnvio("lead-1", "k3"),
    };
    const lista = reconciliarHistorico([oficial], [otimista("k3", "Olá")]);
    expect(lista.length).toBe(1);
    expect(lista[0]!.id).toBe("msg-1");
  });
});

describe("cenário 12 — isolamento produção x homologação", () => {
  const base = {
    id: "x",
    conversa_id: "conv-1",
    direction: "in" as const,
    body: "oi",
    created_at: new Date().toISOString(),
  };

  it("homologação só aceita mensagem de teste do canal e da conversa aberta", () => {
    expect(
      aceitaMensagemRealtime(
        { ...base, is_teste: true, canal: CANAL_HOMOLOGACAO },
        { ambiente: "homologacao", conversaId: "conv-1" },
      ),
    ).toBe(true);
    // Mensagem real nunca entra na Homologação.
    expect(
      aceitaMensagemRealtime(
        { ...base, is_teste: false, canal: "whatsapp" },
        { ambiente: "homologacao", conversaId: "conv-1" },
      ),
    ).toBe(false);
    // Outra conversa também não.
    expect(
      aceitaMensagemRealtime(
        { ...base, is_teste: true, canal: CANAL_HOMOLOGACAO },
        { ambiente: "homologacao", conversaId: "conv-2" },
      ),
    ).toBe(false);
  });

  it("produção nunca recebe mensagem de teste", () => {
    expect(
      aceitaMensagemRealtime({ ...base, is_teste: true, canal: CANAL_HOMOLOGACAO }, { ambiente: "producao" }),
    ).toBe(false);
    expect(
      aceitaMensagemRealtime({ ...base, is_teste: false, canal: "whatsapp" }, { ambiente: "producao" }),
    ).toBe(true);
  });
});
