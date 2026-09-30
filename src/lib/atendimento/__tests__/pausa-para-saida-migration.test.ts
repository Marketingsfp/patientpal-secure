/**
 * Etapa 1 (30/09/2026) — "Em pausa para saída" e recebimento só para quem está Online.
 * PostgreSQL temporário em memória (PGlite) com as migrations reais de distribuição
 * (20260914211605, 20260917144041) e a nova (20260930130000). Nunca aponta para produção.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = [
  "20260914211605_zap_distribuicao_capacidade_presenca_atomica.sql",
  "20260917144041_b618961f-ac79-4d95-977a-1eac1d3541fa.sql",
  "20260930130000_atend_pausa_para_saida.sql",
];
const clinica = "11111111-1111-4111-8111-111111111111";
const ana = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bia = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const motivo = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let db: PGlite;
const q = async <T = Record<string, any>>(sql: string, p: unknown[] = []) =>
  (await db.query<T>(sql, p)).rows;
const como = (user: string) => q("SELECT set_config('test.uid', $1, false)", [user]);
const definir = async (user: string, estado: string, reason: string | null = null) => {
  await como(user);
  const [r] = await q<{ r: any }>(
    "SELECT public.atend_definir_presenca_manual($1, $2, NULL, $3) AS r",
    [clinica, estado, reason],
  );
  return r!.r;
};
const estadoDe = async (user: string) =>
  (
    await q(
      "SELECT estado_manual, status::text AS status, aceita_novas FROM atend_agente_presenca WHERE user_id=$1",
      [user],
    )
  )[0];
const novaConversaNaFila = async () => {
  const id = crypto.randomUUID();
  await q(
    `INSERT INTO atend_conversas(id, clinica_id, status, owner_type, ai_enabled, is_teste)
     VALUES ($1, $2, 'waiting', 'NONE', false, false)`,
    [id, clinica],
  );
  return id;
};
const donoDe = async (id: string) =>
  (await q("SELECT atribuida_user_id, status, fila_pendente FROM atend_conversas WHERE id=$1", [id]))[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.clinicas(id uuid PRIMARY KEY);
    CREATE FUNCTION public.is_member(uuid, uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.can_manage_clinica(uuid, uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION public.atend_usuario_e_admin(uuid, uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE public.clinica_memberships(user_id uuid, clinica_id uuid, ativo boolean DEFAULT true, role text);
    CREATE TABLE public.atend_departamento_membros(clinica_id uuid, user_id uuid, departamento_id uuid,
      queue_locked boolean DEFAULT false, max_simultaneas integer NOT NULL DEFAULT 5);
    CREATE TABLE public.atend_pause_reasons(id uuid PRIMARY KEY, clinica_id uuid NOT NULL);
    CREATE TABLE public.atend_pausas_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid NOT NULL,
      user_id uuid NOT NULL, reason_id uuid, iniciada_em timestamptz NOT NULL DEFAULT clock_timestamp(),
      finalizada_em timestamptz);
    CREATE TABLE public.atend_agente_presenca(clinica_id uuid NOT NULL, user_id uuid NOT NULL,
      status text, aceita_novas boolean, visto_em timestamptz, estado_manual text, estado_manual_em timestamptz,
      estado_manual_por uuid, estado_manual_versao integer NOT NULL DEFAULT 0, PRIMARY KEY (clinica_id, user_id));
    ALTER TABLE public.atend_agente_presenca ADD CONSTRAINT atend_agente_presenca_estado_manual_chk
      CHECK (estado_manual IS NULL OR estado_manual IN ('ONLINE','OFFLINE','PAUSA'));
    CREATE TABLE public.atend_presenca_manual_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      clinica_id uuid NOT NULL, user_id uuid NOT NULL,
      estado text NOT NULL CHECK (estado IN ('ONLINE','OFFLINE','PAUSA')),
      versao integer NOT NULL DEFAULT 0, definido_por uuid NOT NULL, origem text NOT NULL DEFAULT 'controle_presenca',
      created_at timestamptz NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE public.atend_conversas(id uuid PRIMARY KEY, clinica_id uuid NOT NULL, atribuida_user_id uuid,
      is_teste boolean DEFAULT false, status text, owner_type text, ai_enabled boolean DEFAULT false,
      departamento_id uuid, prioridade integer DEFAULT 0, aguardando_desde timestamptz, handoff_em timestamptz,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(), assigned_at timestamptz,
      atribuicao_origem text, updated_at timestamptz);
    CREATE TABLE public.atend_conversa_eventos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid,
      conversa_id uuid, evento text, user_id uuid, departamento_id uuid, motivo text, detalhes jsonb,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE public.whatsapp_mensagens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid,
      conversa_id uuid, direction text, enviada_por text, status text, recebida_em timestamptz);
  `);
  for (const nome of MIGRATIONS)
    await db.exec(
      await readFile(new URL(`../../../../supabase/migrations/${nome}`, import.meta.url), "utf8"),
    );
  await db.exec(`
    INSERT INTO clinicas VALUES ('${clinica}');
    INSERT INTO auth.users VALUES ('${ana}'), ('${bia}');
    INSERT INTO clinica_memberships(user_id, clinica_id, role) VALUES ('${ana}','${clinica}','telefonia'), ('${bia}','${clinica}','telefonia');
    INSERT INTO atend_pause_reasons VALUES ('${motivo}', '${clinica}');
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("Etapa 1 — pausa para saída (migration)", () => {
  test("aceita o novo estado e o grava como ocupado, sem receber conversas", async () => {
    const r = await definir(ana, "PAUSA_SAIDA");
    expect(r.ok).toBe(true);
    expect(r.estado).toBe("PAUSA_SAIDA");
    expect(await estadoDe(ana)).toEqual({ estado_manual: "PAUSA_SAIDA", status: "BUSY", aceita_novas: false });
  });

  test("estado inválido continua recusado", async () => {
    await como(ana);
    await expect(
      q("SELECT public.atend_definir_presenca_manual($1, 'QUALQUER', NULL, NULL)", [clinica]),
    ).rejects.toThrow();
  });

  test("Pausa e Pausa para saída não recebem conversa, com ou sem outros Online", async () => {
    await definir(ana, "PAUSA");
    await definir(bia, "PAUSA_SAIDA");
    const conv = await novaConversaNaFila();
    await q("SELECT public.atend_distribuir_fila_seguro($1, 200, 'teste', NULL)", [clinica]);
    expect((await donoDe(conv))!.atribuida_user_id).toBeNull();
    const pool = await q(
      "SELECT user_id, elegivel, motivo_exclusao, em_pausa FROM public.atend_pool_canonico($1, NULL) ORDER BY user_id",
      [clinica],
    );
    expect(pool.map((p) => [p.elegivel, p.motivo_exclusao, p.em_pausa])).toEqual([
      [false, "escolha_manual_pausa", true],
      [false, "escolha_manual_pausa_saida", true],
    ]);
  });

  test("ao ficar Online, a pessoa recebe as conversas paradas — direto em Ativas e sem limite de 10", async () => {
    await q("DELETE FROM atend_conversas");
    const ids: string[] = [];
    for (let i = 0; i < 15; i++) ids.push(await novaConversaNaFila());
    await definir(ana, "ONLINE");
    for (const id of ids) {
      const c = await donoDe(id);
      expect(c!.atribuida_user_id).toBe(ana);
      expect(c!.status).toBe("active");
      expect(c!.fila_pendente).toBe(false);
    }
  });

  test("quem já tem conversa a mantém ao entrar em pausa; Bia em pausa não recebe as novas", async () => {
    await definir(ana, "PAUSA_SAIDA");
    const antes = await q("SELECT count(*)::int AS n FROM atend_conversas WHERE atribuida_user_id=$1", [ana]);
    expect(antes[0]!.n).toBe(15);
    const nova = await novaConversaNaFila();
    await q("SELECT public.atend_distribuir_fila_seguro($1, 200, 'teste', NULL)", [clinica]);
    expect((await donoDe(nova))!.atribuida_user_id).toBeNull();
  });

  test("Online distribui pela menor carga (Bia, sem conversas, recebe a pendente)", async () => {
    await q("DELETE FROM atend_conversas WHERE atribuida_user_id IS NULL");
    await definir(ana, "ONLINE");
    await definir(bia, "ONLINE");
    const nova = await novaConversaNaFila();
    await q("SELECT public.atend_distribuir_fila_seguro($1, 200, 'teste', NULL)", [clinica]);
    expect((await donoDe(nova))!.atribuida_user_id).toBe(bia);
  });

  test("qualquer mudança de estado fecha a pausa aberta (o cronômetro zera)", async () => {
    await q("DELETE FROM atend_pausas_log");
    await definir(ana, "PAUSA", motivo);
    expect(await q("SELECT 1 FROM atend_pausas_log WHERE finalizada_em IS NULL")).toHaveLength(1);
    await definir(ana, "PAUSA_SAIDA");
    expect(await q("SELECT 1 FROM atend_pausas_log WHERE finalizada_em IS NULL")).toHaveLength(0);
    const log = await q("SELECT estado FROM atend_presenca_manual_log WHERE user_id=$1 ORDER BY created_at DESC LIMIT 2", [ana]);
    expect(log.map((l) => l.estado)).toEqual(["PAUSA_SAIDA", "PAUSA"]);
  });

  test("Pausa para saída não aceita motivo de pausa", async () => {
    await como(ana);
    await expect(
      q("SELECT public.atend_definir_presenca_manual($1, 'PAUSA_SAIDA', NULL, $2)", [clinica, motivo]),
    ).rejects.toThrow();
  });
});
