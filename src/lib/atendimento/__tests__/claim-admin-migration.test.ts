/**
 * Supervisão (30/09/2026) — admin assume conversa sem responsável só por clique.
 * PostgreSQL temporário em memória (PGlite) com a migration real. Nunca aponta para produção.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const clinica = "11111111-1111-4111-8111-111111111111";
const admin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const gestor = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let db: PGlite;
const q = async <T = Record<string, any>>(sql: string, p: unknown[] = []) =>
  (await db.query<T>(sql, p)).rows;
const como = (uid: string | null) => q("SELECT set_config('test.uid', $1, false)", [uid ?? ""]);
const nova = async (owner: string, atrib: string | null = null) => {
  const id = crypto.randomUUID();
  await q(
    "INSERT INTO atend_conversas(id, clinica_id, owner_type, atribuida_user_id, status) VALUES ($1,$2,$3,$4,'waiting')",
    [id, clinica, owner, atrib],
  );
  return id;
};
const claim = async (conv: string, user: string) =>
  (
    await q<{ r: boolean }>("SELECT public.atend_claim_conversa($1,$2,$3) AS r", [
      conv,
      clinica,
      user,
    ])
  )[0]!.r;
const dono = async (conv: string) =>
  (
    await q("SELECT atribuida_user_id, owner_type, status FROM atend_conversas WHERE id=$1", [conv])
  )[0]!;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE FUNCTION public.is_member(uuid, uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.atend_usuario_e_admin(u uuid, c uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT u = '${admin}'::uuid $$;
    CREATE TABLE public.atend_conversas(id uuid PRIMARY KEY, clinica_id uuid, owner_type text, atribuida_user_id uuid,
      ai_enabled boolean DEFAULT true, status text, assigned_at timestamptz, updated_at timestamptz);
  `);
  await db.exec(
    await readFile(
      new URL(
        "../../../../supabase/migrations/20260930160000_atend_claim_admin_por_clique.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("assumir conversa — admin por clique", () => {
  test("admin assume a conversa sem responsável quando ele mesmo pede", async () => {
    await como(admin);
    const c = await nova("NONE");
    expect(await claim(c, admin)).toBe(true);
    expect(await dono(c)).toMatchObject({
      atribuida_user_id: admin,
      owner_type: "HUMAN",
      status: "active",
    });
  });

  test("nenhuma rotina automática atribui conversa ao admin (sem usuário logado ou outro usuário)", async () => {
    const c = await nova("NONE");
    await como(null);
    await expect(claim(c, admin)).rejects.toThrow("por ação própria");
    await como(gestor);
    await expect(claim(c, admin)).rejects.toThrow("por ação própria");
    expect((await dono(c)).atribuida_user_id).toBeNull();
  });

  test("o admin nunca assume conversa da Nina", async () => {
    await como(admin);
    const c = await nova("AI");
    expect(await claim(c, admin)).toBe(false);
    expect(await dono(c)).toMatchObject({ atribuida_user_id: null, owner_type: "AI" });
  });

  test("conversa que já tem responsável não muda", async () => {
    await como(admin);
    const c = await nova("HUMAN", gestor);
    expect(await claim(c, admin)).toBe(false);
    expect((await dono(c)).atribuida_user_id).toBe(gestor);
  });

  test("gestor continua assumindo como antes (inclusive a da Nina, que passa a humana)", async () => {
    await como(gestor);
    const livre = await nova("NONE");
    const daNina = await nova("AI");
    expect(await claim(livre, gestor)).toBe(true);
    expect(await claim(daNina, gestor)).toBe(true);
    expect(await dono(daNina)).toMatchObject({ atribuida_user_id: gestor, owner_type: "HUMAN" });
  });
});
