/**
 * FASE 4 — Stale Response Guard.
 *
 * Simula a semântica das RPCs de revisão (contador monotônico por conversa)
 * para provar que resposta obsoleta nunca é enviada, que a mensagem nova
 * entra no próximo turno e que ação crítica não roda sobre estado velho.
 */
import { describe, expect, test } from "bun:test";
import { decidirEnvio, ehFerramentaCritica, estaObsoleta } from "@/lib/nina/revisao";

/** Contador por conversa, como no banco. */
class Revisoes {
  private mapa = new Map<string, number>();
  incrementar(chave: string): number {
    const v = (this.mapa.get(chave) ?? 0) + 1;
    this.mapa.set(chave, v);
    return v;
  }
  atual(chave: string): number {
    return this.mapa.get(chave) ?? 0;
  }
}

describe("FASE 4 — teste principal", () => {
  test('resposta gerada só com "quero neurologista" não é enviada após "somente sábado"', async () => {
    const rev = new Revisoes();
    const conversa = "clinica:5511999";
    const enviados: string[] = [];

    // T0 — paciente envia a primeira mensagem.
    rev.incrementar(conversa);
    // T1 — Nina começa a processar com a revisão congelada.
    const processada = rev.atual(conversa);
    const geracao = (async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "Temos neurologista na terça às 9h.";
    })();

    // T2 — chega mensagem nova ANTES do envio.
    rev.incrementar(conversa);

    const texto = await geracao;
    const decisao = decidirEnvio({ processada, atual: rev.atual(conversa) });
    if (decisao.enviar) enviados.push(texto);

    expect(decisao.enviar).toBe(false);
    expect(decisao.motivo).toBe("SUPERSEDED");
    expect(enviados).toHaveLength(0);

    // Reprocessamento: novo turno usa as DUAS mensagens e envia uma resposta.
    const processada2 = rev.atual(conversa);
    const texto2 = "Neurologista no sábado: tenho 10h e 11h.";
    const decisao2 = decidirEnvio({ processada: processada2, atual: rev.atual(conversa) });
    if (decisao2.enviar) enviados.push(texto2);
    expect(enviados).toEqual([texto2]);
  });
});

describe("FASE 4 — outros cenários", () => {
  test("mensagem nova 50ms antes do envio bloqueia a resposta antiga", async () => {
    const rev = new Revisoes();
    rev.incrementar("A");
    const processada = rev.atual("A");
    await new Promise((r) => setTimeout(r, 5));
    rev.incrementar("A");
    expect(decidirEnvio({ processada, atual: rev.atual("A") }).enviar).toBe(false);
  });

  test("mensagem nova depois do envio → turno normal, sem invalidar nada", () => {
    const rev = new Revisoes();
    rev.incrementar("A");
    const processada = rev.atual("A");
    expect(decidirEnvio({ processada, atual: rev.atual("A") }).enviar).toBe(true);
    // Só agora chega a próxima mensagem: ela é o próximo turno.
    const proxima = rev.incrementar("A");
    expect(proxima).toBe(processada + 1);
  });

  test("mensagem em OUTRA conversa não invalida a geração atual", () => {
    const rev = new Revisoes();
    rev.incrementar("A");
    const processadaA = rev.atual("A");
    rev.incrementar("B");
    expect(decidirEnvio({ processada: processadaA, atual: rev.atual("A") }).enviar).toBe(true);
  });

  test("revisão é monotônica por conversa", () => {
    const rev = new Revisoes();
    expect([rev.incrementar("A"), rev.incrementar("A"), rev.incrementar("A")]).toEqual([1, 2, 3]);
    expect(rev.atual("B")).toBe(0);
  });

  test("revisão desconhecida não descarta resposta", () => {
    expect(estaObsoleta(0, 5)).toBe(false);
    expect(estaObsoleta(null, null)).toBe(false);
  });
});

describe("FASE 4 — ferramentas críticas", () => {
  test("ações mutáveis são reconhecidas como críticas", () => {
    for (const nome of ["agendar", "cancelar_agendamento", "remarcar", "solicitar_atendente_humano"]) {
      expect(ehFerramentaCritica(nome)).toBe(true);
    }
  });

  test("consultas não são bloqueadas pela revisão", () => {
    for (const nome of ["consultar_disponibilidade", "buscar_medicos", "dados_da_clinica"]) {
      expect(ehFerramentaCritica(nome)).toBe(false);
    }
  });

  test("agendamento não é executado quando a conversa avançou", () => {
    const rev = new Revisoes();
    rev.incrementar("A");
    const processada = rev.atual("A");
    rev.incrementar("A"); // paciente mudou a informação durante a geração
    const executou = ehFerramentaCritica("agendar")
      ? !estaObsoleta(processada, rev.atual("A"))
      : true;
    expect(executou).toBe(false);
  });
});
