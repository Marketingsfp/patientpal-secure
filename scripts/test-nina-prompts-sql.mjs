// Banco descartável, sem rede, IA ou dados da clínica.
// node scripts/test-nina-prompts-sql.mjs <caminho-do-pglite/dist/index.js>
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const a = randomUUID(), b = randomUUID(), c1 = randomUUID(), c2 = randomUUID(), c3 = randomUUID();
const pedido = "Quero uma simulação com mamografia e ortopedista.\nPerguntar valores e primeira data.";
const migration = await readFile(new URL("../supabase/migrations/20260919180000_nina_prompts_simulacao.sql", import.meta.url), "utf8");
const salvar = (uid, cid, texto, usado = "2026-09-19T15:00:00Z") => query(`
  INSERT INTO nina_carga_prompts(clinica_id,user_id,pedido,ultimo_usado_em) VALUES($1,$2,$3,$4)
  ON CONFLICT(clinica_id,user_id,pedido_hash) DO UPDATE
  SET clinica_id=excluded.clinica_id,user_id=excluded.user_id,pedido=excluded.pedido,ultimo_usado_em=excluded.ultimo_usado_em
  RETURNING *`, [cid, uid, texto, usado]);
const entrar = async (uid) => { await db.exec("RESET ROLE"); await query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid]); await db.exec("SET ROLE authenticated"); };
try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.clinicas(id uuid PRIMARY KEY);
    CREATE TABLE public.vinculos(user_id uuid,clinica_id uuid,ativo boolean DEFAULT true);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION public.is_member(uid uuid,cid uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS(SELECT 1 FROM vinculos WHERE user_id=uid AND clinica_id=cid AND ativo) $$;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  `);
  await query("INSERT INTO auth.users VALUES($1),($2)", [a,b]);
  await query("INSERT INTO clinicas VALUES($1),($2),($3)", [c1,c2,c3]);
  await query("INSERT INTO vinculos(user_id,clinica_id) VALUES($1,$2),($1,$3),($4,$2)", [a,c1,c2,b]);
  await db.exec(migration);
  await db.exec(migration);
  await entrar(a);
  const [primeiro] = await salvar(a,c1,pedido);
  const [repetido] = await salvar(a,c1,pedido,"2026-09-19T16:00:00Z");
  assert.equal(primeiro.id,repetido.id);
  assert.deepEqual(primeiro.created_at,repetido.created_at);
  assert.equal(repetido.pedido,pedido);
  assert.equal((await query("SELECT * FROM nina_carga_prompts")).length,1);
  await salvar(a,c1,"Outra simulação");
  assert.equal((await query("SELECT pedido FROM nina_carga_prompts ORDER BY ultimo_usado_em DESC,id LIMIT 1"))[0].pedido,pedido);
  assert.equal((await query("SELECT pedido FROM nina_carga_prompts WHERE pedido ILIKE '%mamografia%'"))[0].pedido,pedido);
  const [outraClinica] = await salvar(a,c2,pedido);
  assert.notEqual(outraClinica.id,primeiro.id);
  assert.equal((await query("SELECT * FROM nina_carga_prompts WHERE clinica_id=$1",[c2])).length,1);
  await salvar(a,c1,"á".repeat(6000)); // Não indexa o texto integral (limite do B-tree).
  await assert.rejects(()=>salvar(a,c1,"x".repeat(6001)));
  await assert.rejects(()=>salvar(a,c1,"   "));
  await assert.rejects(()=>salvar(a,c3,pedido));
  await assert.rejects(()=>query("UPDATE nina_carga_prompts SET created_at=now() WHERE id=$1",[primeiro.id]));
  await entrar(b);
  assert.equal((await query("SELECT * FROM nina_carga_prompts")).length,0);
  await assert.rejects(()=>salvar(a,c1,"Tentar escrever como outro usuário"));
  const [proprioB] = await salvar(b,c1,pedido);
  assert.notEqual(proprioB.id,primeiro.id);
  assert.equal((await query("SELECT * FROM nina_carga_prompts")).length,1);
  assert.equal((await query("UPDATE nina_carga_prompts SET pedido='Tentativa' WHERE id=$1 RETURNING id",[primeiro.id])).length,0);
  await assert.rejects(()=>query("UPDATE nina_carga_prompts SET user_id=$1 WHERE id=$2",[a,proprioB.id]));
  await db.exec("RESET ROLE");
  await query("UPDATE vinculos SET ativo=false WHERE user_id=$1",[b]);
  await entrar(b);
  assert.equal((await query("SELECT * FROM nina_carga_prompts")).length,0);
  await assert.rejects(()=>salvar(b,c1,"Sem vínculo ativo"));
  await db.exec("RESET ROLE; SET ROLE anon");
  await assert.rejects(()=>query("SELECT * FROM nina_carga_prompts"));
  await db.exec("RESET ROLE");
  const antes = await query("SELECT * FROM nina_carga_prompts ORDER BY id");
  await db.exec(migration);
  assert.deepEqual(await query("SELECT * FROM nina_carga_prompts ORDER BY id"),antes);
  console.log("PASS: persistência, deduplicação, texto integral até 6000 caracteres, ordenação, busca, idempotência e RLS por usuário/clínica; acesso anônimo e vínculo revogado bloqueados.");
} finally { await db.close(); }
