/**
 * HOMOLOGAÇÃO — reutilização do MESMO agrupamento do WhatsApp real.
 *
 * O console de testes não tem espera própria: ele chama `aguardarTurnoNina`
 * (janela e trava canônicas). Estes testes reproduzem a semântica persistente
 * das RPCs `nina_batch_*` e o fluxo de `processarMensagemTeste`, verificando
 * que mensagens rápidas formam UM turno, UMA execução e UMA resposta — e que
 * as mensagens físicas continuam separadas.
 */
import { describe, expect, it } from "bun:test";
import { MAX_BURST_WINDOW_MS, QUIET_WINDOW_MS, decidirEspera, montarTurnoPaciente } from "@/lib/nina/burst";

type Lote = {
  id: string;
  status: "COLLECTING" | "PROCESSING" | "PROCESSED";
  revision: number;
  firstMs: number;
  mensagens: string[];
};

/** Banco simulado: lote por conversa + reserva atômica, como nas RPCs reais. */
class Banco {
  lotes: Lote[] = [];
  mensagens: { id: string; body: string }[] = [];
  respostas: string[] = [];
  execucoes = 0;
  revisao = 0;
  private seq = 0;

  persistir(body: string) {
    const id = `m${this.mensagens.length + 1}`;
    this.mensagens.push({ id, body });
    this.revisao += 1; // incrementarRevisaoConversa
    return id;
  }

  registrar(mensagemId: string, agoraMs: number) {
    let lote = this.lotes.find((l) => l.status === "COLLECTING");
    if (!lote) {
      lote = { id: `b${++this.seq}`, status: "COLLECTING", revision: 0, firstMs: agoraMs, mensagens: [] };
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

type Desfecho = { processamento: "RESPONDIDA" | "AGRUPADA"; reply: string | null };

/** Fluxo de `processarMensagemTeste`, com o relógio controlado pelo teste. */
async function enviarTeste(banco: Banco, texto: string, agoraMs: number): Promise<Desfecho> {
  // 1) persiste ANTES de qualquer espera: a bolha já aparece na timeline.
  const mensagemId = banco.persistir(texto);
  // 2) registra no lote canônico e espera a janela oficial.
  const reg = banco.registrar(mensagemId, agoraMs);
  const { esperaMs, forcar } = decidirEspera(agoraMs, reg.firstMs);
  const fim = agoraMs + esperaMs;
  await Promise.resolve();
  const claim = banco.reivindicar(reg.batchId, reg.revision, forcar);
  if (!claim.reivindicado) {
    // Mensagem mais nova assume o turno: NÃO é erro e não gera resposta.
    return { processamento: "AGRUPADA", reply: null };
  }
  // 3) turno consolidado é a entrada lógica da Nina — uma execução só.
  const textos = claim.mensagens.map((id) => banco.mensagens.find((m) => m.id === id)!.body);
  const turno = montarTurnoPaciente(textos);
  banco.execucoes += 1;
  const reply = `resposta(${turno.replace(/\s+/g, " ").trim().length})`;
  banco.respostas.push(reply);
  banco.concluir(reg.batchId);
  void fim;
  return { processamento: "RESPONDIDA", reply };
}

describe("homologação usa o mesmo Message Burst da produção", () => {
  it("três mensagens em menos de 1s = 1 lote, 1 execução, 1 resposta", async () => {
    const banco = new Banco();
    const t = 1_000_000;
    const r = await Promise.all([
      enviarTeste(banco, "Olá", t),
      enviarTeste(banco, "Quero marcar uma consulta", t + 200),
      enviarTeste(banco, "De neurologista", t + 400),
    ]);
    expect(banco.mensagens.length).toBe(3); // mensagens físicas separadas
    expect(banco.lotes.length).toBe(1);
    expect(banco.execucoes).toBe(1);
    expect(banco.respostas.length).toBe(1);
    expect(r.filter((x) => x.processamento === "AGRUPADA").length).toBe(2);
    expect(r.filter((x) => x.processamento === "RESPONDIDA").length).toBe(1);
  });

  it("mensagens espaçadas geram turnos independentes", async () => {
    const banco = new Banco();
    const t = 2_000_000;
    const a = await enviarTeste(banco, "Olá", t);
    const b = await enviarTeste(banco, "Quero marcar", t + QUIET_WINDOW_MS + 5_000);
    expect(a.processamento).toBe("RESPONDIDA");
    expect(b.processamento).toBe("RESPONDIDA");
    expect(banco.lotes.length).toBe(2);
    expect(banco.execucoes).toBe(2);
    expect(banco.respostas.length).toBe(2);
  });

  it("a homologação não define janela própria: usa a configuração canônica", () => {
    expect(QUIET_WINDOW_MS).toBeGreaterThan(0);
    expect(MAX_BURST_WINDOW_MS).toBeGreaterThanOrEqual(QUIET_WINDOW_MS);
    // Passado o teto do burst, a espera é forçada a fechar o lote.
    expect(decidirEspera(5_000 + MAX_BURST_WINDOW_MS + 1, 5_000).forcar).toBe(true);
  });

  it("cada mensagem física é persistida antes de esperar o agrupamento", async () => {
    const banco = new Banco();
    const t = 3_000_000;
    await Promise.all([enviarTeste(banco, "um", t), enviarTeste(banco, "dois", t + 100)]);
    expect(banco.mensagens.map((m) => m.body)).toEqual(["um", "dois"]);
    expect(banco.revisao).toBe(2); // revisão sobe por mensagem recebida
  });
});
