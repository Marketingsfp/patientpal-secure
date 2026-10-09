import { describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { carregarAberturasInbox, registrarAberturaInbox } from "../conversa-nova.server";
import {
  conversaNovaParaAtendente,
  entradaAtendimento,
  EVENTO_INBOX_ABERTA,
} from "../conversa-nova";

const c = {
  id: "c1",
  clinica_id: "clinica",
  status: "active",
  owner_type: "HUMAN",
  atribuida_user_id: "ana",
  inbox_entrada_em: "2026-10-03T10:00:00.123456Z",
};
type Row = Record<string, unknown>;
/** Serviços simulados: persistência e filtro em memória, sem conexão à clínica. */
function banco() {
  const tabelas: Record<string, Row[]> = {
    atend_conversas: [{ ...c }],
    atend_conversa_eventos: [],
    atend_leitura_operacional: [],
    atend_leituras: [],
  };
  let operacional = true;
  let erroTabela = "";
  const client = {
    rpc: async () => ({ data: operacional, error: null }),
    from(tabela: string) {
      const filtros: ((r: Row) => boolean)[] = [];
      let single = false,
        de = 0,
        ate = Infinity,
        limite = Infinity;
      let inserir: Row | undefined;
      const query = {
        select() {
          return query;
        },
        eq(k: string, v: unknown) {
          filtros.push((r) => r[k] === v);
          return query;
        },
        in(k: string, vals: unknown[]) {
          filtros.push((r) =>
            vals.includes(
              k.includes("->>")
                ? (r[k.split("->>")[0]!] as Row | undefined)?.[k.split("->>")[1]!]
                : r[k],
            ),
          );
          return query;
        },
        gte(k: string, v: string) {
          filtros.push((r) => String(r[k]) >= v);
          return query;
        },
        contains(k: string, v: Row) {
          filtros.push((r) =>
            Object.entries(v).every(([p, x]) => (r[k] as Row | undefined)?.[p] === x),
          );
          return query;
        },
        order() {
          return query;
        },
        range(a: number, b: number) {
          de = a;
          ate = b;
          return query;
        },
        limit(n: number) {
          limite = n;
          return query;
        },
        maybeSingle() {
          single = true;
          return query;
        },
        insert(r: Row) {
          inserir = r;
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          if (erroTabela === tabela)
            return Promise.resolve(resolve({ data: null, error: { message: "Falha simulada" } }));
          if (inserir)
            tabelas[tabela]!.push({
              ...inserir,
              id: `ev-${tabelas[tabela]!.length}`,
              created_at: "2026-10-03T12:00:00.000000Z",
            });
          const rows = tabelas[tabela]!.filter((r) => filtros.every((f) => f(r))).slice(
            de,
            Math.min(ate + 1, limite),
          );
          return Promise.resolve(
            resolve({ data: inserir ? null : single ? (rows[0] ?? null) : rows, error: null }),
          );
        },
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  return {
    client,
    tabelas,
    perfil: (v: boolean) => {
      operacional = v;
    },
    falhar: (t: string) => {
      erroTabela = t;
    },
  };
}

describe("persistência do selo Novo", () => {
  it("primeira abertura é registrada e continua reconhecida após F5, sem alterar a conversa", async () => {
    const b = banco();
    const antes = structuredClone(b.tabelas.atend_conversas);
    expect(
      conversaNovaParaAtendente((await carregarAberturasInbox(b.client, "clinica", [c]))[0]!),
    ).toBe(true);
    const entrada = entradaAtendimento(c)!;
    expect((await registrarAberturaInbox(b.client, "clinica", "ana", "c1", entrada)).marcada).toBe(
      true,
    );
    const recarregada = await carregarAberturasInbox(b.client, "clinica", [c]);
    expect(conversaNovaParaAtendente(recarregada[0]!)).toBe(false);
    expect(b.tabelas.atend_conversas).toEqual(antes);
    expect(b.tabelas.atend_leitura_operacional).toEqual([]);
    expect(b.tabelas.atend_conversa_eventos![0]!.user_id).toBe("ana");
    await registrarAberturaInbox(b.client, "clinica", "ana", "c1", entrada);
    expect(b.tabelas.atend_conversa_eventos).toHaveLength(1);
  });
  it("supervisor, outra atendente, outra clínica e uma abertura do ciclo anterior não registram", async () => {
    const b = banco();
    const entrada = entradaAtendimento(c)!;
    b.perfil(false);
    expect((await registrarAberturaInbox(b.client, "clinica", "ana", "c1", entrada)).marcada).toBe(
      false,
    );
    b.perfil(true);
    for (const [clinica, user, ciclo] of [
      ["clinica", "bia", entrada],
      ["outra", "ana", entrada],
      ["clinica", "ana", "2026-10-02T10:00:00.000000Z"],
    ])
      expect((await registrarAberturaInbox(b.client, clinica!, user!, "c1", ciclo!)).marcada).toBe(
        false,
      );
    expect(b.tabelas.atend_conversa_eventos).toHaveLength(0);
  });
  it("não registra conversas fechadas, sem atribuição, da Nina ou de homologação", async () => {
    for (const patch of [
      { status: "closed" },
      { owner_type: "AI" },
      { atribuida_user_id: null },
      { is_teste: true },
    ]) {
      const b = banco();
      Object.assign(b.tabelas.atend_conversas![0]!, patch);
      expect(
        (await registrarAberturaInbox(b.client, "clinica", "ana", "c1", entradaAtendimento(c)!))
          .marcada,
      ).toBe(false);
      expect(b.tabelas.atend_conversa_eventos).toHaveLength(0);
    }
  });
  it("reabertura e retorno à mesma atendente exigem uma nova primeira abertura", async () => {
    const b = banco();
    await registrarAberturaInbox(b.client, "clinica", "ana", "c1", entradaAtendimento(c)!);
    const nova = { ...c, inbox_entrada_em: "2026-10-03T11:00:00Z" };
    b.tabelas.atend_conversas![0] = nova;
    expect(
      conversaNovaParaAtendente((await carregarAberturasInbox(b.client, "clinica", [nova]))[0]!),
    ).toBe(true);
    await registrarAberturaInbox(b.client, "clinica", "ana", "c1", entradaAtendimento(nova)!);
    expect(
      conversaNovaParaAtendente((await carregarAberturasInbox(b.client, "clinica", [nova]))[0]!),
    ).toBe(false);
    expect(b.tabelas.atend_conversa_eventos).toHaveLength(2);
  });
  it("leituras existentes do responsável neste ciclo reconhecem atendimentos já iniciados", async () => {
    const b = banco();
    b.tabelas.atend_leitura_operacional!.push({
      conversa_id: "c1",
      clinica_id: "clinica",
      user_id: "ana",
      read_at: "2026-10-03T10:30:00Z",
    });
    expect(
      conversaNovaParaAtendente((await carregarAberturasInbox(b.client, "clinica", [c]))[0]!),
    ).toBe(false);
    b.tabelas.atend_leitura_operacional![0]!.user_id = "bia";
    expect(
      conversaNovaParaAtendente((await carregarAberturasInbox(b.client, "clinica", [c]))[0]!),
    ).toBe(true);
    b.tabelas.atend_leitura_operacional![0]!.user_id = "ana";
    b.tabelas.atend_leitura_operacional![0]!.read_at = "2026-10-03T10:00:00.123455Z";
    expect(
      conversaNovaParaAtendente((await carregarAberturasInbox(b.client, "clinica", [c]))[0]!),
    ).toBe(true);
  });
  it("abertura de outra pessoa ou clínica não tira Novo", async () => {
    const b = banco();
    b.tabelas.atend_conversa_eventos!.push(
      {
        evento: EVENTO_INBOX_ABERTA,
        conversa_id: "c1",
        user_id: "bia",
        clinica_id: "clinica",
        detalhes: { entrada_em: entradaAtendimento(c) },
        created_at: "2026-10-03T12:00:00Z",
      },
      {
        evento: EVENTO_INBOX_ABERTA,
        conversa_id: "c1",
        user_id: "ana",
        clinica_id: "outra",
        detalhes: { entrada_em: entradaAtendimento(c) },
        created_at: "2026-10-03T12:00:00Z",
      },
    );
    expect(
      conversaNovaParaAtendente((await carregarAberturasInbox(b.client, "clinica", [c]))[0]!),
    ).toBe(true);
  });
  it("a leitura individual reconhece a responsável mesmo quando o cursor da equipe ficou com outra pessoa", async () => {
    const b = banco();
    b.tabelas.atend_leitura_operacional!.push({
      conversa_id: "c1",
      clinica_id: "clinica",
      user_id: "bia",
      read_at: "2026-10-03T10:30:00Z",
    });
    b.tabelas.atend_leituras!.push({
      conversa_id: "c1",
      clinica_id: "clinica",
      user_id: "ana",
      read_at: "2026-10-03T10:31:00Z",
    });
    expect(
      conversaNovaParaAtendente(
        (await carregarAberturasInbox(b.client, "clinica", [c], "ana"))[0]!,
      ),
    ).toBe(false);
    b.tabelas.atend_leituras![0]!.read_at = "2026-10-03T09:00:00Z";
    expect(
      conversaNovaParaAtendente(
        (await carregarAberturasInbox(b.client, "clinica", [c], "ana"))[0]!,
      ),
    ).toBe(true);
  });
  it("mais de mil registros não escondem uma abertura atual válida", async () => {
    const b = banco();
    for (let i = 0; i < 1005; i++)
      b.tabelas.atend_conversa_eventos!.push({
        id: `${i}`,
        evento: EVENTO_INBOX_ABERTA,
        conversa_id: "c1",
        user_id: i === 1004 ? "ana" : "bia",
        clinica_id: "clinica",
        detalhes: { entrada_em: entradaAtendimento(c) },
        created_at: "2026-10-03T12:00:00Z",
      });
    const outra = { ...c, id: "c2", atribuida_user_id: "bia" };
    expect(
      conversaNovaParaAtendente(
        (await carregarAberturasInbox(b.client, "clinica", [c, outra]))[0]!,
      ),
    ).toBe(false);
  });
  it("uma falha de gravação mantém Novo; erro na consulta não inventa abertura", async () => {
    const b = banco();
    b.falhar("atend_conversa_eventos");
    await expect(
      registrarAberturaInbox(b.client, "clinica", "ana", "c1", entradaAtendimento(c)!),
    ).rejects.toThrow("Falha simulada");
    await expect(carregarAberturasInbox(b.client, "clinica", [c])).rejects.toThrow(
      "Falha simulada",
    );
    expect(b.tabelas.atend_conversa_eventos).toHaveLength(0);
  });
});
