/**
 * Fim da base de conhecimento (01/10/2026): a migration só apaga quando a Nina já informa pelo
 * cadastro, guarda cópia do que é editorial e não deixa nada para trás.
 * PostgreSQL temporário em memória (PGlite). Nunca aponta para produção.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = new URL(
  "../../../../supabase/migrations/20261001100000_remove_base_conhecimento_nina.sql",
  import.meta.url,
);
const clinica = "11111111-1111-4111-8111-111111111111";
let db: PGlite;
const q = async <T = Record<string, any>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const existe = async (nome: string) => (await q<{ r: string | null }>("SELECT to_regclass($1)::text AS r", [nome]))[0]!.r !== null;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.clinica_feature_flags(clinica_id uuid, flag_key text, ativo boolean);
    CREATE TABLE public.nina_kb_bases(id uuid PRIMARY KEY, nome text);
    CREATE TABLE public.nina_kb_registros(id uuid PRIMARY KEY, base_id uuid REFERENCES public.nina_kb_bases(id), texto text);
    CREATE TABLE public.nina_kb_consultas(id uuid PRIMARY KEY, base_id uuid REFERENCES public.nina_kb_bases(id), pergunta text);
    CREATE TABLE public.nina_cat_servicos(id uuid PRIMARY KEY, nome text);
    CREATE TABLE public.nina_cat_profissionais(id uuid PRIMARY KEY, nome text);
    CREATE FUNCTION public.nina_kb_buscar_semantico(q text) RETURNS text LANGUAGE sql AS $$ SELECT q $$;
    INSERT INTO public.nina_kb_bases VALUES ('00000000-0000-4000-8000-000000000001', 'base');
    INSERT INTO public.nina_kb_registros VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'texto');
    INSERT INTO public.nina_kb_consultas VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'pergunta de paciente');
    INSERT INTO public.nina_cat_servicos VALUES ('00000000-0000-4000-8000-000000000004', 'Hemograma'), ('00000000-0000-4000-8000-000000000005', 'TSH');
    INSERT INTO public.nina_cat_profissionais VALUES ('00000000-0000-4000-8000-000000000006', 'Dra. Ana');
  `);
}, 60_000);

afterEach(async () => {
  await db?.close();
});

describe("remoção da base de conhecimento", () => {
  test("recusa quando a Nina ainda não informa pelo cadastro: nada é apagado", async () => {
    await expect(db.exec(await readFile(MIGRATION, "utf8"))).rejects.toThrow("Nada foi apagado");
    await db.exec("ROLLBACK"); // a falha deixa a transação aberta, como no executor de migrations
    expect(await existe("public.nina_cat_servicos")).toBe(true);
    expect(await existe("public.nina_kb_registros")).toBe(true);
    expect(await existe("arquivo_base_conhecimento.nina_cat_servicos")).toBe(false);
  });

  test("flag desligada também recusa", async () => {
    await q("INSERT INTO public.clinica_feature_flags VALUES ($1, 'nina_informa_cadastro', false)", [clinica]);
    await expect(db.exec(await readFile(MIGRATION, "utf8"))).rejects.toThrow("Nada foi apagado");
    await db.exec("ROLLBACK"); // a falha deixa a transação aberta, como no executor de migrations
    expect(await existe("public.nina_cat_profissionais")).toBe(true);
  });

  test("com a flag ligada: copia o editorial, apaga tudo e remove a função", async () => {
    await q("INSERT INTO public.clinica_feature_flags VALUES ($1, 'nina_informa_cadastro', true)", [clinica]);
    await db.exec(await readFile(MIGRATION, "utf8"));

    for (const t of ["nina_cat_servicos", "nina_cat_profissionais", "nina_kb_bases", "nina_kb_registros", "nina_kb_consultas"]) {
      expect(await existe(`public.${t}`)).toBe(false);
    }
    const funcoes = await q("SELECT 1 FROM pg_proc WHERE proname = 'nina_kb_buscar_semantico'");
    expect(funcoes).toHaveLength(0);

    // Cópia do que é editorial.
    expect((await q("SELECT nome FROM arquivo_base_conhecimento.nina_cat_servicos ORDER BY nome")).map((r) => r.nome)).toEqual(["Hemograma", "TSH"]);
    expect((await q("SELECT nome FROM arquivo_base_conhecimento.nina_cat_profissionais")).map((r) => r.nome)).toEqual(["Dra. Ana"]);
    expect(await q("SELECT texto FROM arquivo_base_conhecimento.nina_kb_registros")).toEqual([{ texto: "texto" }]);

    // O log de consultas traz perguntas de pacientes: não é copiado.
    expect(await existe("arquivo_base_conhecimento.nina_kb_consultas")).toBe(false);
  });

  test("o arquivo fica fechado para os usuários da aplicação", async () => {
    await q("INSERT INTO public.clinica_feature_flags VALUES ($1, 'nina_informa_cadastro', true)", [clinica]);
    await db.exec(await readFile(MIGRATION, "utf8"));
    const rls = await q<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE oid = 'arquivo_base_conhecimento.nina_cat_servicos'::regclass",
    );
    expect(rls[0]!.relrowsecurity).toBe(true);
    const acesso = await q<{ anon: boolean; auth: boolean }>(
      `SELECT has_table_privilege('anon', 'arquivo_base_conhecimento.nina_cat_servicos', 'SELECT') AS anon,
              has_table_privilege('authenticated', 'arquivo_base_conhecimento.nina_cat_servicos', 'SELECT') AS auth`,
    );
    expect(acesso[0]).toEqual({ anon: false, auth: false });
    const uso = await q<{ r: boolean }>("SELECT has_schema_privilege('authenticated', 'arquivo_base_conhecimento', 'USAGE') AS r");
    expect(uso[0]!.r).toBe(false);
  });

  test("rodar de novo não quebra nem apaga a cópia", async () => {
    await q("INSERT INTO public.clinica_feature_flags VALUES ($1, 'nina_informa_cadastro', true)", [clinica]);
    const sql = await readFile(MIGRATION, "utf8");
    await db.exec(sql);
    await db.exec(sql);
    expect(await q("SELECT count(*)::int AS n FROM arquivo_base_conhecimento.nina_cat_servicos")).toEqual([{ n: 2 }]);
  });
});
