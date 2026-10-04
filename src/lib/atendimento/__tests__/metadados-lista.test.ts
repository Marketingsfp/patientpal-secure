import { describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { carregarMetadadosLista } from "../metadados-lista.server";
import { incorporarEsperaDaLista } from "../inbox-merge";
import { conversaNovaParaAtendente, entradaAtendimento } from "../conversa-nova";

const conversa = {
  id: "c",
  status: "active",
  owner_type: "HUMAN",
  atribuida_user_id: "u",
  inbox_entrada_em: "2026-10-03T12:00:00Z",
};
type Resultado = { data: Record<string, unknown>[] | null; error: { message: string } | null };
function bancoLento() {
  const iniciadas: string[] = [];
  const liberar = new Map<string, (r: Resultado) => void>();
  const filtros: unknown[] = [];
  function esperar(nome: string) {
    iniciadas.push(nome);
    return new Promise<Resultado>((resolve) => liberar.set(nome, resolve));
  }
  const db = {
    rpc(nome: string, args: unknown) {
      filtros.push([nome, args]);
      return esperar(nome);
    },
    from(tabela: string) {
      const q = {
        select() {
          return q;
        },
        eq(k: string, v: unknown) {
          filtros.push([tabela, k, v]);
          return q;
        },
        in() {
          return q;
        },
        gte() {
          return q;
        },
        order() {
          return q;
        },
        range() {
          return q;
        },
        then(resolve: (r: Resultado) => unknown, reject?: (e: unknown) => unknown) {
          return esperar(tabela).then(resolve, reject);
        },
      };
      return q;
    },
  } as unknown as SupabaseClient<Database>;
  return { db, iniciadas, liberar, filtros };
}
describe("troca de abas: metadados em paralelo", () => {
  it("inicia as quatro leituras antes de qualquer resposta, preservando contagem e selo", async () => {
    const b = bancoLento();
    let terminou = false;
    const p = carregarMetadadosLista(b.db, "clinica", "u", [conversa]).then((r) => {
      terminou = true;
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(new Set(b.iniciadas)).toEqual(
      new Set([
        "atend_nao_lidas",
        "atend_leitura_operacional",
        "atend_leituras",
        "atend_conversa_eventos",
      ]),
    );
    expect(terminou).toBe(false);
    b.liberar.get("atend_conversa_eventos")!({
      data: [
        { conversa_id: "c", user_id: "u", detalhes: { entrada_em: entradaAtendimento(conversa) } },
      ],
      error: null,
    });
    b.liberar.get("atend_leituras")!({ data: [], error: null });
    b.liberar.get("atend_leitura_operacional")!({ data: [], error: null });
    b.liberar.get("atend_nao_lidas")!({ data: [{ conversa_id: "c", nao_lidas: 4 }], error: null });
    const r = await p;
    expect(r.naoLidas.get("c")).toBe(4);
    expect(conversaNovaParaAtendente(r.comAberturas[0])).toBe(false);
    expect(b.filtros).toContainEqual([
      "atend_nao_lidas",
      { _clinica_id: "clinica", _conversa_ids: ["c"] },
    ]);
    for (const tabela of ["atend_leitura_operacional", "atend_leituras", "atend_conversa_eventos"])
      expect(b.filtros).toContainEqual([tabela, "clinica_id", "clinica"]);
  });
  it("falha não vira contador zero ou abertura inventada", async () => {
    const b = bancoLento();
    const p = carregarMetadadosLista(b.db, "clinica", "u", [conversa]);
    const falhou = p.then(
      () => null,
      (erro: Error) => erro.message,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const [nome, resolver] of b.liberar)
      resolver({
        data: [],
        error: nome === "atend_nao_lidas" ? { message: "Falha leitura" } : null,
      });
    expect(await falhou).toBe("Falha leitura");
  });
  it("lista vazia não dispara consultas de metadados", async () => {
    const b = bancoLento();
    expect((await carregarMetadadosLista(b.db, "clinica", "u", [])).comAberturas).toEqual([]);
    expect(b.iniciadas).toEqual([]);
  });
  it("Pendentes usa a espera oficial da própria lista sem esperar a consulta auxiliar", () => {
    const anterior = { outra: "2026-10-03T09:00:00Z", removida: "2026-10-03T08:00:00Z" };
    const atual = incorporarEsperaDaLista(anterior, [
      { id: "c", aguardando_desde: "2026-10-03T11:00:00Z" },
      { id: "removida", aguardando_desde: null },
    ]);
    expect(atual).toEqual({ outra: anterior.outra, c: "2026-10-03T11:00:00Z" });
    expect(anterior).toHaveProperty("removida");
    expect(incorporarEsperaDaLista(atual, [{ id: "c", aguardando_desde: atual.c }])).toBe(atual);
  });
});
