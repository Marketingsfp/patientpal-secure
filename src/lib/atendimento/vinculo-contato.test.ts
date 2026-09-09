import { describe, expect, it } from "bun:test";
import { normalizarTelefone } from "./telefone";
import { resolverContatoConversa, vincularPacienteConversa } from "./vinculo-contato.server";

type Chamada = { tabela: string; tipo: "select" | "update" | "insert" };

function clienteFake(opts: { pacientes?: Array<{ id: string; nome?: string }> } = {}) {
  const chamadas: Chamada[] = [];
  const cliente = {
    from(tabela: string) {
      const q: any = {
        select() {
          chamadas.push({ tabela, tipo: "select" });
          return q;
        },
        update() {
          chamadas.push({ tabela, tipo: "update" });
          return q;
        },
        insert: async () => {
          chamadas.push({ tabela, tipo: "insert" });
          return { error: null };
        },
        eq: (col: string, _v: string) => {
          // só a primeira coluna de telefone devolve resultado
          if (col === "telefone2_norm") q.__vazio = true;
          return q;
        },
        is: () => q,
        or: () => q,
        limit: async () => ({ data: q.__vazio ? [] : (opts.pacientes ?? []), error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        then: (r: any) => Promise.resolve({ error: null }).then(r),
      };
      return q;
    },
  };
  return { cliente, chamadas };
}

describe("FASE 3 — telefone gera candidatos, não identidade", () => {
  it("normaliza o telefone com a regra única (sem DDI, últimos 11 dígitos)", () => {
    expect(normalizarTelefone("+55 (21) 97495-6960")).toBe("21974956960");
    expect(normalizarTelefone("5521974956960")).toBe("21974956960");
    expect(normalizarTelefone("")).toBeNull();
  });

  it("CENÁRIO A — um único cadastro: UNIQUE_CANDIDATE e nenhuma gravação", async () => {
    const { cliente, chamadas } = clienteFake({ pacientes: [{ id: "pac-tuane", nome: "TUANE" }] });
    const r = await resolverContatoConversa(cliente, {
      clinicaId: "c1",
      conversaId: "cv1",
      contatoPacienteId: null,
      contatoTelefone: "5521971589468",
    });
    expect(r.status).toBe("UNIQUE_CANDIDATE");
    expect(r.pacienteId).toBeNull();
    expect(r.candidatos.map((c) => c.id)).toEqual(["pac-tuane"]);
    expect(chamadas.some((c) => c.tipo === "update")).toBe(false);
  });

  it("CENÁRIO B — dois pacientes com o mesmo telefone: AMBIGUOUS, sem vínculo", async () => {
    const { cliente, chamadas } = clienteFake({
      pacientes: [
        { id: "pac-aparecida", nome: "APARECIDA" },
        { id: "pac-tuane", nome: "TUANE" },
      ],
    });
    const r = await resolverContatoConversa(cliente, {
      clinicaId: "c1",
      conversaId: "cv1",
      contatoPacienteId: null,
      contatoTelefone: "5521971589468",
    });
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.pacienteId).toBeNull();
    expect(r.candidatos).toHaveLength(2);
    expect(chamadas.some((c) => c.tipo === "update")).toBe(false);
  });

  it("CENÁRIO C — vínculo explícito: EXPLICIT_LINK e sem lookup por telefone", async () => {
    const { cliente, chamadas } = clienteFake({ pacientes: [{ id: "outro" }] });
    const r = await resolverContatoConversa(cliente, {
      clinicaId: "c1",
      conversaId: "cv1",
      contatoPacienteId: "pac-9",
      contatoTelefone: "5521974956960",
    });
    expect(r.status).toBe("EXPLICIT_LINK");
    expect(r.pacienteId).toBe("pac-9");
    expect(r.viaVinculo).toBe(true);
    expect(chamadas.some((c) => c.tabela === "pacientes")).toBe(false);
  });

  it("CENÁRIO D — nenhum cadastro: NO_MATCH", async () => {
    const { cliente } = clienteFake({ pacientes: [] });
    const r = await resolverContatoConversa(cliente, {
      clinicaId: "c1",
      conversaId: "cv1",
      contatoPacienteId: null,
      contatoTelefone: "5521999999999",
    });
    expect(r.status).toBe("NO_MATCH");
    expect(r.candidatos).toEqual([]);
  });

  it("sem telefone e sem vínculo não consulta pacientes", async () => {
    const { cliente, chamadas } = clienteFake();
    const r = await resolverContatoConversa(cliente, {
      clinicaId: "c1",
      conversaId: "cv1",
      contatoTelefone: null,
    });
    expect(r.status).toBe("NO_MATCH");
    expect(chamadas.length).toBe(0);
  });

  it("vínculo explícito (evento de identificação) grava e registra auditoria", async () => {
    const { cliente, chamadas } = clienteFake();
    const ok = await vincularPacienteConversa(cliente, {
      clinicaId: "c1",
      conversaId: "cv1",
      pacienteId: "pac-2",
      origem: "atendente",
      responsavelUserId: "u1",
    });
    expect(ok).toBe(true);
    expect(chamadas).toEqual([
      { tabela: "atend_conversas", tipo: "update" },
      { tabela: "atend_conversa_eventos", tipo: "insert" },
    ]);
  });
});
