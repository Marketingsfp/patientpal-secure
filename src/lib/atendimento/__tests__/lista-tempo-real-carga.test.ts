import { describe, expect, it } from "bun:test";
import { classificarEvento } from "../realtime-roteador";
import { patchListaPorLeitura } from "../patch-inbox";
import { carregarLotesAtivas, TAMANHO_LOTE_ATIVAS } from "../paginacao-inbox";

// Desempenho para ~1.500 conversas/dia e 15+ atendentes (16/10/2026).
const CLINICA = "11111111-1111-4111-8111-111111111111";
const ctx = { clinicaId: CLINICA, conversaAberta: "aberta" };

describe("tempo real: atualização de mensagem não recarrega a lista", () => {
  it("status, estado da Nina ou transcrição: só a conversa aberta é atualizada", () => {
    const mensagem = (conversa_id: string) => ({
      table: "whatsapp_mensagens",
      eventType: "UPDATE",
      new: { clinica_id: CLINICA, conversa_id, status: "read" },
    });
    expect(classificarEvento(mensagem("outra"), ctx)).toEqual([]);
    expect(classificarEvento(mensagem("aberta"), ctx)).toEqual(["conversa"]);
  });
  it("mensagem nova continua indo para a lista", () => {
    expect(
      classificarEvento(
        {
          table: "whatsapp_mensagens",
          eventType: "INSERT",
          new: { clinica_id: CLINICA, conversa_id: "outra", direction: "in" },
        },
        ctx,
      ),
    ).toEqual(["lista"]);
  });
});

describe("leitura da equipe só mexe no card", () => {
  const lista = [
    { id: "a", ultima_msg_em: "2026-10-16T10:00:00Z", nao_lidas: 3 },
    { id: "b", ultima_msg_em: "2026-10-16T10:05:00Z", nao_lidas: 0 },
  ];
  it("conversa fora da lista: nada a fazer", () => {
    const r = patchListaPorLeitura(lista, {
      conversa_id: "fora",
      ultima_msg_lida_em: "2026-10-16T11:00:00Z",
    });
    expect(r).toEqual({ lista, aplicado: true, reconciliar: false });
  });
  it("leitura até a última mensagem zera o contador só daquele card", () => {
    const r = patchListaPorLeitura(lista, {
      conversa_id: "a",
      ultima_msg_lida_em: "2026-10-16T10:00:00Z",
    });
    expect(r.aplicado).toBe(true);
    expect(r.lista.map((c) => c.nao_lidas)).toEqual([0, 0]);
    expect(r.lista[1]).toBe(lista[1]);
  });
  it("leitura parcial pede conferência no servidor", () => {
    const r = patchListaPorLeitura(lista, {
      conversa_id: "a",
      ultima_msg_lida_em: "2026-10-16T09:00:00Z",
    });
    expect(r).toMatchObject({ aplicado: false, reconciliar: true });
  });
});

describe("recarga da lista numa chamada só", () => {
  const linhas = (n: number, de = 0) =>
    Array.from({ length: n }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(de + i).padStart(12, "0")}`,
      inbox_entrada_em: new Date(Date.UTC(2026, 9, 16, 10, 0, de + i)).toISOString(),
    }));
  it("200 cards já rolados voltam numa chamada (eram 10 lotes de 20 em série)", async () => {
    const pedidos: number[] = [];
    const r = await carregarLotesAtivas({
      buscar: async (_cursor, tamanho) => {
        pedidos.push(tamanho);
        return linhas(200);
      },
      quantidade: 200,
      tamanhoLote: 200,
      vigente: () => true,
    });
    expect(pedidos).toEqual([200]);
    expect(r?.linhas).toHaveLength(200);
    expect(r?.temMais).toBe(true);
  });
  it("carregar mais continua em lotes de 20", async () => {
    const pedidos: number[] = [];
    await carregarLotesAtivas({
      buscar: async (_cursor, tamanho) => {
        pedidos.push(tamanho);
        return linhas(5);
      },
      vigente: () => true,
    });
    expect(pedidos).toEqual([TAMANHO_LOTE_ATIVAS]);
  });
});
