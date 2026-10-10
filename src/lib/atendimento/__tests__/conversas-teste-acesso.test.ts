import { describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { usuarioPodeSimularAtendimento } from "../conversas-teste-acesso.server";

describe("permissão de treinamento no servidor", () => {
  it("exige vínculo ativo da pessoa e da clínica solicitada", async () => {
    for (const role of ["admin", "supervisor", "telefonia", "medico", null]) {
      const filtros: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (campo: string, valor: unknown) => {
          filtros[campo] = valor;
          return query;
        },
        maybeSingle: async () => ({ data: role ? { role } : null, error: null }),
      };
      const db = {
        from: (tabela: string) => {
          expect(tabela).toBe("clinica_memberships");
          return query;
        },
      } as unknown as SupabaseClient<Database>;
      expect(await usuarioPodeSimularAtendimento(db, "pessoa", "clinica")).toBe(
        role !== null && role !== "medico",
      );
      expect(filtros).toEqual({ user_id: "pessoa", clinica_id: "clinica", ativo: true });
    }
  });
  it("falha de leitura não concede acesso mesmo com um perfil retornado", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: { role: "admin" }, error: { message: "erro" } }),
    };
    const db = { from: () => query } as unknown as SupabaseClient<Database>;
    expect(await usuarioPodeSimularAtendimento(db, "pessoa", "clinica")).toBe(false);
  });
});
