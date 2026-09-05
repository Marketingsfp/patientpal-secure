import { describe, expect, it } from "bun:test";
import { normalizarTelefone } from "./telefone";
import { resolverContatoConversa, vincularPacienteConversa } from "./vinculo-contato.server";

type Chamada = { tabela: string; tipo: "select" | "update" };

function clienteFake(opts: { paciente?: { id: string } | null } = {}) {
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
        eq: () => q,
        is: () => q,
        or: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: opts.paciente ?? null, error: null }),
        then: (r: any) => Promise.resolve({ error: null }).then(r),
      };
      return q;
    },
  };
  return { cliente, chamadas };
}

describe("Fase 2 — vínculo conversa ↔ contato", () => {
  it("normaliza o telefone com a regra única (sem DDI, últimos 11 dígitos)", () => {
    expect(normalizarTelefone("+55 (21) 97495-6960")).toBe("21974956960");
    expect(normalizarTelefone("5521974956960")).toBe("21974956960");
    expect(normalizarTelefone("")).toBeNull();
  });

  it("nova conversa com contato existente: encontra pelo telefone e grava o vínculo", async () => {
    const { cliente, chamadas } = clienteFake({ paciente: { id: "pac-1" } });
    const r = await resolverContatoConversa(cliente, {
      clinicaId: "c1",
      conversaId: "cv1",
      contatoPacienteId: null,
      contatoTelefone: "5521974956960",
    });
    expect(r.pacienteId).toBe("pac-1");
    expect(r.telefoneNorm).toBe("21974956960");
    expect(r.vinculado).toBe(true);
    expect(chamadas.some((c) => c.tabela === "atend_conversas" && c.tipo === "update")).toBe(true);
  });

  it("nova conversa sem contato: fica sem vínculo e não cria paciente", async () => {
    const { cliente, chamadas } = clienteFake({ paciente: null });
    const r = await resolverContatoConversa(cliente, {
      clinicaId: "c1",
      conversaId: "cv1",
      contatoPacienteId: null,
      contatoTelefone: "5521999999999",
    });
    expect(r.pacienteId).toBeNull();
    expect(r.telefoneNorm).toBe("21999999999");
    expect(chamadas.some((c) => c.tipo === "update")).toBe(false);
  });

  it("conversa já vinculada NÃO executa lookup por telefone", async () => {
    const { cliente, chamadas } = clienteFake({ paciente: { id: "outro" } });
    const r = await resolverContatoConversa(cliente, {
      clinicaId: "c1",
      conversaId: "cv1",
      contatoPacienteId: "pac-9",
      contatoTelefone: "5521974956960",
    });
    expect(r.pacienteId).toBe("pac-9");
    expect(r.viaVinculo).toBe(true);
    expect(chamadas.some((c) => c.tabela === "pacientes")).toBe(false);
  });

  it("sem telefone e sem vínculo não consulta pacientes", async () => {
    const { cliente, chamadas } = clienteFake();
    const r = await resolverContatoConversa(cliente, {
      clinicaId: "c1",
      conversaId: "cv1",
      contatoTelefone: null,
    });
    expect(r.pacienteId).toBeNull();
    expect(chamadas.length).toBe(0);
  });

  it("cadastro/vínculo posterior atualiza contact_id imediatamente", async () => {
    const { cliente, chamadas } = clienteFake();
    const ok = await vincularPacienteConversa(cliente, {
      clinicaId: "c1",
      conversaId: "cv1",
      pacienteId: "pac-2",
    });
    expect(ok).toBe(true);
    expect(chamadas).toEqual([{ tabela: "atend_conversas", tipo: "update" }]);
  });
});
