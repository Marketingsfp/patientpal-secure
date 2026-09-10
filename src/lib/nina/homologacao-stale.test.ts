/**
 * HOMOLOGAÇÃO — descarte de respostas obsoletas da Nina.
 *
 * Reproduz a semântica persistente já usada na produção (revisão da conversa,
 * lote e trava por conversa) e o encadeamento de `processarMensagemTeste`:
 * a revisão é congelada no início do turno e reconferida ANTES de gravar a
 * resposta. Se chegou mensagem nova, a execução vira SUPERSEDED, nada é
 * gravado, nenhuma ação crítica roda e a trava é sempre liberada.
 */
import { describe, expect, it } from "bun:test";

type StatusLote = "COLLECTING" | "PROCESSING" | "PROCESSED" | "SUPERSEDED";

class Conversa {
  revisao = 0;
  entrada: string[] = [];
  saida: string[] = [];
  lotes: { id: string; status: StatusLote }[] = [];
  lockOcupado = false;
  acoesCriticas: string[] = [];
  private seq = 0;

  /** Espelha `incrementarRevisaoConversa`: cada mensagem sobe a revisão. */
  receber(texto: string) {
    this.entrada.push(texto);
    this.revisao += 1;
    return this.revisao;
  }

  abrirLote() {
    const lote = { id: `b${++this.seq}`, status: "PROCESSING" as StatusLote };
    this.lotes.push(lote);
    this.lockOcupado = true;
    return lote;
  }

  concluirLote(id: string, status: "PROCESSED" | "SUPERSEDED") {
    const lote = this.lotes.find((l) => l.id === id);
    if (lote) lote.status = status;
    this.lockOcupado = false;
  }

  /** Espelha `respostaObsoleta`. */
  obsoleta(revisaoProcessada: number) {
    return this.revisao > revisaoProcessada;
  }
}

type Resultado = {
  reply: string | null;
  erro: string | null;
  processamento: "RESPONDIDA" | "OBSOLETA" | "ERRO";
};

/**
 * Um turno da Nina na Homologação: congela a revisão, gera, revalida e só
 * então grava. Sempre encerra o lote/lock no `finally`.
 */
async function turnoNina(
  conversa: Conversa,
  gerar: () => Promise<{ texto: string; acaoCritica?: string }>,
): Promise<Resultado> {
  const revisaoCongelada = conversa.revisao; // congelada no início do turno
  const lote = conversa.abrirLote();
  let status: "PROCESSED" | "SUPERSEDED" = "PROCESSED";
  try {
    const gerada = await gerar();
    // Stale guard ANTES de qualquer gravação ou efeito colateral.
    if (conversa.obsoleta(revisaoCongelada)) {
      status = "SUPERSEDED";
      // Nem resposta, nem ação crítica, nem erro para o testador.
      return { reply: null, erro: null, processamento: "OBSOLETA" };
    }
    if (gerada.acaoCritica) conversa.acoesCriticas.push(gerada.acaoCritica);
    conversa.saida.push(gerada.texto);
    return { reply: gerada.texto, erro: null, processamento: "RESPONDIDA" };
  } catch (e) {
    return { reply: null, erro: String((e as Error).message), processamento: "ERRO" };
  } finally {
    conversa.concluirLote(lote.id, status);
  }
}

describe("homologação descarta respostas obsoletas", () => {
  it('"quero amanhã" → "na verdade só sábado": resposta antiga não aparece', async () => {
    const conversa = new Conversa();
    conversa.receber("Quero amanhã");

    let chegouASegunda = false;
    const antigo = turnoNina(conversa, async () => {
      // Enquanto a Nina "pensa", o paciente manda a correção.
      conversa.receber("Na verdade só posso sábado");
      chegouASegunda = true;
      return { texto: "Confirmo para amanhã às 10h", acaoCritica: "agendar:amanha" };
    });
    const r1 = await antigo;

    expect(chegouASegunda).toBe(true);
    expect(conversa.revisao).toBe(2); // a segunda mensagem subiu a revisão
    expect(r1.processamento).toBe("OBSOLETA");
    expect(r1.reply).toBeNull();
    expect(r1.erro).toBeNull(); // obsoleta NÃO é erro de envio
    expect(conversa.saida).toEqual([]); // nada gravado
    expect(conversa.acoesCriticas).toEqual([]); // agendamento antigo impedido
    expect(conversa.lotes[0]!.status).toBe("SUPERSEDED");
    expect(conversa.lockOcupado).toBe(false); // trava liberada

    // Novo turno já enxerga a informação atual.
    const r2 = await turnoNina(conversa, async () => ({
      texto: "Fechado para sábado às 10h",
      acaoCritica: "agendar:sabado",
    }));
    expect(r2.processamento).toBe("RESPONDIDA");
    expect(conversa.saida).toEqual(["Fechado para sábado às 10h"]);
    expect(conversa.acoesCriticas).toEqual(["agendar:sabado"]);
    expect(conversa.lotes[1]!.status).toBe("PROCESSED");
  });

  it("A, B, C durante execuções: só a resposta atual é gravada, sem fora de ordem", async () => {
    const conversa = new Conversa();
    conversa.receber("A");
    const t1 = turnoNina(conversa, async () => {
      conversa.receber("B");
      conversa.receber("C");
      return { texto: "resposta de A" };
    });
    expect((await t1).processamento).toBe("OBSOLETA");

    const t2 = await turnoNina(conversa, async () => ({ texto: "resposta de A+B+C" }));
    expect(t2.processamento).toBe("RESPONDIDA");
    expect(conversa.saida).toEqual(["resposta de A+B+C"]);
    expect(conversa.lotes.map((l) => l.status)).toEqual(["SUPERSEDED", "PROCESSED"]);
  });

  it("exceção do modelo também libera lote e trava", async () => {
    const conversa = new Conversa();
    conversa.receber("Olá");
    const r = await turnoNina(conversa, async () => {
      throw new Error("modelo indisponível");
    });
    expect(r.processamento).toBe("ERRO");
    expect(conversa.lockOcupado).toBe(false);
    expect(conversa.lotes[0]!.status).toBe("PROCESSED");
  });

  it("sem mensagem nova, a resposta é gravada normalmente", async () => {
    const conversa = new Conversa();
    conversa.receber("Bom dia");
    const r = await turnoNina(conversa, async () => ({ texto: "Bom dia! Como posso ajudar?" }));
    expect(r.processamento).toBe("RESPONDIDA");
    expect(conversa.saida.length).toBe(1);
    expect(conversa.lockOcupado).toBe(false);
  });
});
