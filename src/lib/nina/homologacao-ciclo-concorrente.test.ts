/**
 * HOMOLOGAÇÃO — criação concorrente do ciclo/conversa de teste.
 *
 * Depois que o composer passou a aceitar vários envios seguidos, o primeiro
 * burst de um lead recém-resetado pode chegar com 3 a 5 requisições lendo
 * `conversa_id = null` e `ciclo_id = null` ao mesmo tempo.
 *
 * `garantirCiclo` delega a criação para a RPC `nina_teste_garantir_ciclo`
 * (advisory lock por lead + índice único parcial
 * `nina_teste_ciclos_um_ativo_por_lead`). Aqui o banco é simulado com essa
 * mesma semântica: chamadas serializadas por lead, um único ciclo ativo e
 * reuso do vencedor da corrida.
 */
import { describe, expect, it } from "bun:test";
import { garantirCiclo, type LeadRow } from "@/lib/nina/teste-console.server";

const CLINICA = "c1";

function lead(): LeadRow {
  return {
    id: "lead-1",
    indice: 1,
    nome: "Lead Teste 01",
    telefone_base: "5500100000",
    telefone_sessao: "5500100001",
    sessao_seq: 1,
    conversa_id: null,
    ciclo_id: null,
    ciclo_iniciado_em: null,
    resolvido_em: null,
    status: "ativa",
  };
}

/** Banco simulado com a serialização da RPC (advisory lock por lead). */
class Banco {
  ciclos: { id: string; lead_id: string; status: string; conversa_id: string | null }[] = [];
  conversas: string[] = [];
  chamadas = 0;
  private fila: Promise<unknown> = Promise.resolve();
  private seq = 0;

  /** Simula `nina_teste_garantir_ciclo`: serializado e idempotente por lead. */
  rpc = (_nome: string, args: any) =>
    (this.fila = this.fila.then(async () => {
      this.chamadas += 1;
      await new Promise((r) => setTimeout(r, 1));
      let ativo = this.ciclos.find((c) => c.lead_id === args.p_lead_id && c.status === "ativo");
      let criado = false;
      if (!ativo) {
        ativo = { id: `ciclo-${++this.seq}`, lead_id: args.p_lead_id, status: "ativo", conversa_id: null };
        this.ciclos.push(ativo);
        criado = true;
      }
      if (!ativo.conversa_id) {
        const conversaId = `conv-${this.conversas.length + 1}`;
        this.conversas.push(conversaId);
        ativo.conversa_id = conversaId;
      }
      return { data: [{ ciclo_id: ativo.id, conversa_id: ativo.conversa_id, criado }], error: null };
    })) as any;

  from() {
    const self = this;
    const filtro: any = { lead_id: "", status: "" };
    const api: any = {
      select: () => api,
      eq: (col: string, val: string) => {
        filtro[col] = val;
        return api;
      },
      maybeSingle: async () => {
        const c = self.ciclos.find((x) => x.lead_id === filtro.lead_id && x.status === "ativo");
        return { data: c ? { id: c.id, conversa_id: c.conversa_id } : null, error: null };
      },
      insert: () => api,
      update: () => api,
    };
    return api;
  }
}

async function correr(n: number) {
  const banco = new Banco();
  const base = lead();
  const resultados = await Promise.all(
    Array.from({ length: n }, () => garantirCiclo(banco as any, CLINICA, { ...base }, null)),
  );
  return { banco, resultados };
}

describe("garantirCiclo sob concorrência", () => {
  it("3 requisições simultâneas: 1 ciclo ativo e 1 conversa", async () => {
    const { banco, resultados } = await correr(3);
    expect(banco.ciclos.filter((c) => c.status === "ativo").length).toBe(1);
    expect(banco.conversas.length).toBe(1);
    expect(new Set(resultados.map((r) => r.cicloId)).size).toBe(1);
    expect(new Set(resultados.map((r) => r.conversaId)).size).toBe(1);
    expect(banco.chamadas).toBe(3);
  });

  it("5 requisições simultâneas: mesmo ciclo e mesma conversa", async () => {
    const { banco, resultados } = await correr(5);
    expect(banco.ciclos.filter((c) => c.status === "ativo").length).toBe(1);
    expect(banco.conversas.length).toBe(1);
    expect(new Set(resultados.map((r) => r.cicloId)).size).toBe(1);
    expect(new Set(resultados.map((r) => r.conversaId)).size).toBe(1);
  });

  it("reutiliza sem chamar o banco quando o lead já tem ciclo e conversa", async () => {
    const banco = new Banco();
    const r = await garantirCiclo(
      banco as any,
      CLINICA,
      { ...lead(), conversa_id: "conv-x", ciclo_id: "ciclo-x" },
      null,
    );
    expect(r).toEqual({ conversaId: "conv-x", cicloId: "ciclo-x" });
    expect(banco.chamadas).toBe(0);
  });

  it("unique violation não falha o envio: reutiliza o ciclo vencedor", async () => {
    const banco = new Banco();
    banco.ciclos.push({ id: "ciclo-v", lead_id: "lead-1", status: "ativo", conversa_id: "conv-v" });
    banco.rpc = (async () => ({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "nina_teste_ciclos_um_ativo_por_lead"' },
    })) as any;

    const r = await garantirCiclo(banco as any, CLINICA, lead(), null);
    expect(r).toEqual({ conversaId: "conv-v", cicloId: "ciclo-v" });
  });
});
