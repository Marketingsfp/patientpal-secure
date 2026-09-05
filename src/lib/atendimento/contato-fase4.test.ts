import { describe, expect, it } from "vitest";
import { CacheContatos, chaveContato, planoAberturaContato } from "./contato-cache";
import { metricasContato, resolverContatoConversa } from "./vinculo-contato.server";

const PAC = "11111111-1111-1111-1111-111111111111";
const CONV = "22222222-2222-2222-2222-222222222222";
const CLI = "33333333-3333-3333-3333-333333333333";

function clienteFake(opts: { encontra?: string | null } = {}) {
  const buscasTelefone: string[] = [];
  const updates: any[] = [];
  const cliente = {
    from(tabela: string) {
      if (tabela === "pacientes") {
        const q: any = {
          select: () => q,
          eq: (col: string, val: string) => {
            if (col.startsWith("telefone")) buscasTelefone.push(`${col}=${val}`);
            return q;
          },
          limit: () => q,
          maybeSingle: async () => ({
            data: opts.encontra ? { id: opts.encontra } : null,
          }),
        };
        return q;
      }
      const u: any = {
        update: (v: any) => {
          updates.push(v);
          return u;
        },
        eq: () => u,
        is: () => u,
        then: (res: any) => res({ error: null }),
      };
      return u;
    },
  };
  return { cliente, buscasTelefone, updates };
}

describe("FASE 4 — abertura do lead pelo vínculo direto", () => {
  it("conversa vinculada busca direto pelo ID, sem lookup por telefone", async () => {
    const { cliente, buscasTelefone } = clienteFake();
    const antes = metricasContato.lookupsTelefone;
    const r = await resolverContatoConversa(cliente as any, {
      clinicaId: CLI,
      conversaId: CONV,
      contatoPacienteId: PAC,
      contatoTelefone: "5521999998888",
    });
    expect(r.pacienteId).toBe(PAC);
    expect(r.viaVinculo).toBe(true);
    expect(buscasTelefone).toEqual([]);
    expect(metricasContato.lookupsTelefone).toBe(antes);
  });

  it("conversa sem vínculo usa o fallback por telefone e grava o vínculo", async () => {
    const { cliente, buscasTelefone, updates } = clienteFake({ encontra: PAC });
    const r = await resolverContatoConversa(cliente as any, {
      clinicaId: CLI,
      conversaId: CONV,
      contatoPacienteId: null,
      contatoTelefone: "5521999998888",
    });
    expect(r.pacienteId).toBe(PAC);
    expect(r.viaVinculo).toBe(false);
    expect(buscasTelefone.length).toBeGreaterThan(0);
    expect(updates[0]).toEqual({ contato_paciente_id: PAC });
  });

  it("segunda abertura já usa o ID (fallback acontece uma única vez)", async () => {
    const primeiro = clienteFake({ encontra: PAC });
    await resolverContatoConversa(primeiro.cliente as any, {
      clinicaId: CLI,
      conversaId: CONV,
      contatoPacienteId: null,
      contatoTelefone: "5521999998888",
    });
    const segundo = clienteFake({ encontra: PAC });
    await resolverContatoConversa(segundo.cliente as any, {
      clinicaId: CLI,
      conversaId: CONV,
      contatoPacienteId: PAC,
      contatoTelefone: "5521999998888",
    });
    expect(segundo.buscasTelefone).toEqual([]);
  });

  it("sem telefone e sem vínculo não faz busca alguma", async () => {
    const { cliente, buscasTelefone } = clienteFake();
    const r = await resolverContatoConversa(cliente as any, {
      clinicaId: CLI,
      conversaId: CONV,
      contatoPacienteId: null,
      contatoTelefone: null,
    });
    expect(r.pacienteId).toBeNull();
    expect(buscasTelefone).toEqual([]);
  });
});

describe("FASE 4 — cache por contato", () => {
  it("usa a chave canônica ['contact', contactId]", () => {
    expect(chaveContato(PAC)).toEqual(["contact", PAC]);
  });

  it("guarda e devolve o contato pelo ID", () => {
    const c = new CacheContatos<{ nome: string }>();
    c.guardar(PAC, { nome: "Maria" });
    expect(c.obter(PAC)?.nome).toBe("Maria");
    expect(c.obter("outro")).toBeUndefined();
  });

  it("não guarda nada quando a conversa não tem vínculo", () => {
    const c = new CacheContatos();
    c.guardar(null, { a: 1 });
    expect(c.tamanho).toBe(0);
  });

  it("expira pelo TTL e pode ser invalidado", () => {
    const c = new CacheContatos<number>(5, 1000);
    c.guardar(PAC, 1);
    expect(c.obter(PAC, Date.now() + 2000)).toBeUndefined();
    c.guardar(PAC, 2);
    c.invalidar(PAC);
    expect(c.obter(PAC)).toBeUndefined();
  });

  it("plano de abertura prioriza o ID sobre o telefone", () => {
    expect(planoAberturaContato({ contactId: PAC, telefone: "21999998888" })).toEqual({
      via: "id",
      contactId: PAC,
    });
    expect(planoAberturaContato({ contactId: null, telefone: "21999998888" }).via).toBe("telefone");
    expect(planoAberturaContato({}).via).toBe("sem_contato");
  });
});
