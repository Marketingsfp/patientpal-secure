import { describe, expect, it } from "bun:test";
import {
  compararCursor,
  manterNaJanelaRecente,
  montarPaginaHistorico,
  type CursorHistorico,
} from "../historico-paginado";
import { carregarPaginaHistorico } from "../historico-paginado.server";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = { clinica_id: uuid(1), conversa_id: uuid(2) };
const args = { clinicaId: base.clinica_id, conversaId: base.conversa_id };
const em = (i: number) => new Date(Date.UTC(2026, 8, 20, 10, 0, i)).toISOString();
const mensagem = (i: number, t = i) => ({
  ...base,
  id: uuid(100 + i),
  recebida_em: em(t),
  body: `Mensagem ${i}`,
  direction: i % 2 ? "in" : "out",
  enviada_por: ["sistema", "nina", "atendente"][i % 3],
});
const evento = (i: number, t = i) => ({
  ...base,
  id: uuid(200 + i),
  created_at: em(t),
  evento: "FINALIZADA",
  user_id: uuid(3),
  motivo: null,
  detalhes: null,
});

/** Interpreta operadores PostgREST para exercitar as consultas reais, sem rede. */
function expressao(texto: string, row: any): boolean {
  const partes: string[] = [];
  let nivel = 0,
    inicio = 0;
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === "(") nivel++;
    if (texto[i] === ")") nivel--;
    if (texto[i] === "," && nivel === 0) {
      partes.push(texto.slice(inicio, i));
      inicio = i + 1;
    }
  }
  partes.push(texto.slice(inicio));
  return partes.some((p) => {
    if (p.startsWith("and("))
      return p
        .slice(4, -1)
        .split(",")
        .every((q) => expressao(q, row));
    const [campo, op, ...resto] = p.split(".");
    const valor = resto.join(".");
    const a = row[campo];
    return op === "eq"
      ? a === valor
      : op === "lt"
        ? a < valor
        : op === "lte"
          ? a <= valor
          : op === "gt"
            ? a > valor
            : a >= valor;
  });
}

function banco(ms: any[], es: any[]) {
  const leituras: { tabela: string; limite: number; linhas: number }[] = [];
  let membro = true,
    gestor = true,
    falha: string | null = null;
  const client = {
    rpc: async (nome: string) => ({ data: nome === "is_member" ? membro : gestor, error: null }),
    from(tabela: string) {
      const filtros: ((r: any) => boolean)[] = [];
      const ordens: { campo: string; ascending: boolean }[] = [];
      let limite = Infinity;
      const q: any = {
        select: () => q,
        eq: (campo: string, valor: any) => {
          filtros.push((r) => r[campo] === valor);
          return q;
        },
        in: (campo: string, valores: any[]) => {
          filtros.push((r) => valores.includes(r[campo]));
          return q;
        },
        or: (valor: string) => {
          filtros.push((r) => expressao(valor, r));
          return q;
        },
        order: (campo: string, options: any) => {
          ordens.push({ campo, ...options });
          return q;
        },
        limit: (n: number) => {
          limite = n;
          return q;
        },
        maybeSingle: async () => ({
          data: {
            id: base.conversa_id,
            owner_type: "HUMAN",
            atribuida_user_id: uuid(4),
            status: "open",
          },
          error: null,
        }),
        then(resolve: any) {
          const todas =
            tabela === "whatsapp_mensagens"
              ? ms
              : tabela === "atend_conversa_eventos"
                ? es
                : [{ id: uuid(3), nome: "Ana" }];
          const rows = todas
            .filter((r) => filtros.every((f) => f(r)))
            .sort((a, b) => {
              for (const o of ordens) {
                const cmp = String(a[o.campo]).localeCompare(String(b[o.campo]));
                if (cmp) return o.ascending ? cmp : -cmp;
              }
              return 0;
            })
            .slice(0, limite);
          leituras.push({ tabela, limite, linhas: rows.length });
          return Promise.resolve(
            resolve({ data: rows, error: falha === tabela ? { message: "indisponível" } : null }),
          );
        },
      };
      return q;
    },
  };
  return {
    leituras,
    negarClinica: () => {
      membro = false;
    },
    negarConversa: () => {
      gestor = false;
    },
    falhar: (tabela: string) => {
      falha = tabela;
    },
    pagina: (cursor?: { antes?: CursorHistorico; depois?: CursorHistorico }) =>
      carregarPaginaHistorico(client as never, uuid(3), { ...args, ...cursor }),
  };
}
const ids = (p: ReturnType<typeof montarPaginaHistorico>) => [
  ...p.mensagens.map((m) => `m${m.id}`),
  ...p.eventos.map((e) => `e${e.id}`),
];

describe("histórico conjunto paginado", () => {
  it("reabrir revalida só a janela recente e conserva mensagens recebidas durante a busca", () => {
    const pagina = montarPaginaHistorico(
      Array.from({ length: 15 }, (_, i) => mensagem(i + 10)),
      [],
    );
    const cacheComRealtime = Array.from({ length: 27 }, (_, i) => mensagem(i));
    const visiveis = cacheComRealtime.filter((m) =>
      manterNaJanelaRecente({ em: m.recebida_em, id: m.id, tipo: "mensagem" }, pagina),
    );
    expect(visiveis.map((m) => m.id)).toEqual(cacheComRealtime.slice(10).map((m) => m.id));
  });
  it("abre com quinze registros no total, misturando autores e avisos", async () => {
    const db = banco(
      Array.from({ length: 30 }, (_, i) => mensagem(i * 2)),
      Array.from({ length: 30 }, (_, i) => evento(i * 2 + 1)),
    );
    const p = await db.pagina();
    expect(p.mensagens).toHaveLength(7);
    expect(p.eventos).toHaveLength(8);
    expect(p.eventos[0].user_nome).toBe("Ana");
    expect(p.temMais).toBe(true);
    expect(p.anterior?.em).toBe(em(45));
    expect(p.posterior?.em).toBe(em(59));
    expect(db.leituras.filter((l) => l.tabela !== "profiles").every((l) => l.limite === 16)).toBe(
      true,
    );
  });

  it("limita as consultas de um histórico de dez mil registros antes de devolver a primeira página", async () => {
    const db = banco(
      Array.from({ length: 5000 }, (_, i) => mensagem(i * 2)),
      Array.from({ length: 5000 }, (_, i) => evento(i * 2 + 1)),
    );
    const primeira = await db.pagina();
    expect(ids(primeira)).toHaveLength(15);
    expect(primeira.anterior?.em).toBe(em(9985));
    expect(primeira.posterior?.em).toBe(em(9999));
    expect(primeira.temMais).toBe(true);
    // O banco entrega somente candidatos limitados por fonte, nunca o histórico
    // completo para ser cortado no navegador. Não busca páginas antigas sozinho.
    expect(db.leituras.filter((l) => l.tabela !== "profiles")).toEqual([
      { tabela: "whatsapp_mensagens", limite: 16, linhas: 16 },
      { tabela: "atend_conversa_eventos", limite: 16, linhas: 16 },
    ]);

    const anterior = await db.pagina({ antes: primeira.anterior! });
    expect(ids(anterior)).toHaveLength(15);
    expect(anterior.anterior?.em).toBe(em(9970));
    expect(anterior.posterior?.em).toBe(em(9984));
    expect(new Set([...ids(primeira), ...ids(anterior)]).size).toBe(30);
  });

  it("percorre todos os empates entre tabelas sem lacunas nem repetição", async () => {
    const db = banco(
      Array.from({ length: 27 }, (_, i) => mensagem(i, 0)),
      Array.from({ length: 16 }, (_, i) => evento(i, 0)),
    );
    let p = await db.pagina();
    const encontrados = ids(p);
    while (p.temMais) {
      p = await db.pagina({ antes: p.anterior! });
      encontrados.push(...ids(p));
    }
    expect(encontrados).toHaveLength(43);
    expect(new Set(encontrados).size).toBe(43);
    expect(p.eventos).toHaveLength(13);
  });

  it("recupera rajada de 35 novidades em páginas crescentes após reconexão", async () => {
    const ms = [mensagem(0)];
    const db = banco(ms, []);
    const inicio = await db.pagina();
    ms.push(...Array.from({ length: 35 }, (_, i) => mensagem(i + 1)));
    let cursor = inicio.posterior!,
      temMais = true;
    const encontrados: string[] = [];
    while (temMais) {
      const p = await db.pagina({ depois: cursor });
      encontrados.push(...p.mensagens.map((m) => m.id));
      cursor = p.posterior!;
      temMais = p.temMais;
    }
    expect(encontrados).toEqual(ms.slice(1).map((m) => m.id));
  });

  it("exatamente quinze registros não exige uma consulta vazia para achar o fim", async () => {
    const p = await banco(
      Array.from({ length: 9 }, (_, i) => mensagem(i)),
      Array.from({ length: 6 }, (_, i) => evento(i)),
    ).pagina();
    expect(ids(p)).toHaveLength(15);
    expect(p.temMais).toBe(false);
  });

  it("histórico composto só por avisos também pagina", async () => {
    const p = await banco(
      [],
      Array.from({ length: 30 }, (_, i) => evento(i)),
    ).pagina();
    expect(p.mensagens).toHaveLength(0);
    expect(p.eventos).toHaveLength(15);
    expect(p.temMais).toBe(true);
  });

  it("filtra clínica e conversa antes de paginar", async () => {
    const p = await banco(
      [
        mensagem(1),
        { ...mensagem(2), clinica_id: uuid(9) },
        { ...mensagem(3), conversa_id: uuid(9) },
      ],
      [],
    ).pagina();
    expect(p.mensagens.map((m) => m.id)).toEqual([uuid(101)]);
  });

  it("não lê mensagens nem eventos de quem não tem acesso", async () => {
    for (const negar of ["negarClinica", "negarConversa"] as const) {
      const db = banco([mensagem(1)], [evento(1)]);
      db[negar]();
      await expect(db.pagina()).rejects.toThrow();
      expect(db.leituras).toHaveLength(0);
    }
  });

  it("erro em uma fonte não vira página parcial nem falso fim do histórico", async () => {
    const db = banco([mensagem(1)], [evento(1)]);
    db.falhar("atend_conversa_eventos");
    await expect(db.pagina()).rejects.toThrow("indisponível");
  });

  it("preserva microssegundos e reconhece fusos equivalentes", () => {
    const a: CursorHistorico = {
      em: "2026-09-20T10:00:00.000001Z",
      id: uuid(999),
      tipo: "mensagem",
    };
    const b: CursorHistorico = { ...a, em: "2026-09-20T10:00:00.000002Z", id: uuid(1) };
    expect(compararCursor(a, b)).toBeLessThan(0);
    expect(compararCursor(a, { ...a, em: "2026-09-20T07:00:00.000001-03:00" })).toBe(0);
  });
});
