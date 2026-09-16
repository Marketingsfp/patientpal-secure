// Só banco temporário em memória. Uso: node este-arquivo <caminho-do-pglite>
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.is_member(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE whatsapp_mensagens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinica_id uuid NOT NULL,
      conversa_id uuid,wa_message_id text UNIQUE,direction text,from_number text,to_number text,body text,
      transcricao text,tipo text DEFAULT 'text',canal text,status text,enviada_por text,media_mime text,
      is_teste boolean DEFAULT false,tratada_internamente boolean DEFAULT false,execucao_id uuid,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE atend_conversas(id uuid PRIMARY KEY,clinica_id uuid,owner_type text DEFAULT 'AI',
      atribuida_user_id uuid,status text DEFAULT 'open',is_teste boolean DEFAULT true);
    CREATE TABLE sistema_job_tokens(nome text PRIMARY KEY,token text);
    CREATE TABLE nina_teste_carga(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  `);
  for (const nome of [
    "20260906202836_89716e54-33fc-4c84-8bc9-fb75627368cf.sql",
    "20260909211431_50fc301a-c11a-42ae-9600-6573162e1e59.sql",
    "20260909212614_8f29c356-d80d-4d4b-9176-1de9e0d2c5a9.sql",
    "20260909214029_9d465871-e4f1-43ed-a08f-b8b65e121f8e.sql",
    "20260914024011_nina_agrupamento_persistente_sem_fallback.sql",
    "20260915170000_nina_watchdog_processamento.sql",
  ])
    await db.exec(
      await readFile(new URL("../supabase/migrations/" + nome, import.meta.url), "utf8"),
    );
  await db.exec("UPDATE nina_watchdog_config SET homologacao_ativa=true");
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  async function entrada() {
    const clinica = randomUUID(),
      conversa = randomUUID(),
      telefone = "550000" + Date.now();
    await query("INSERT INTO atend_conversas(id,clinica_id) VALUES($1,$2)", [conversa, clinica]);
    const [msg] = await query(
      "INSERT INTO whatsapp_mensagens(clinica_id,conversa_id,wa_message_id,direction,from_number,body,canal,is_teste) VALUES($1,$2,$3,'in',$4,'Oi boa tarde','test-console',true) RETURNING id",
      [clinica, conversa, randomUUID(), telefone],
    );
    await query("SELECT nina_revisao_registrar_entrada($1,$2,$3)", [clinica, telefone, msg.id]);
    const [b] = await query("SELECT * FROM nina_batch_registrar($1,$2,$3,$4)", [
      clinica,
      telefone,
      conversa,
      msg.id,
    ]);
    const chave = `${clinica}:${telefone}`;
    const [{ token }] = await query("SELECT nina_lock_adquirir($1,$2,$3,$4,90) token", [
      chave,
      clinica,
      conversa,
      b.batch_id,
    ]);
    await query("SELECT nina_batch_reivindicar($1,$2,true)", [b.batch_id, b.revision]);
    await query("SELECT nina_batch_iniciar_processamento($1,$2,$3)", [b.batch_id, chave, token]);
    return { batch: b.batch_id, conversa, msg: msg.id, chave, token };
  }
  async function recuperar(e) {
    await query("SELECT nina_lock_liberar($1,$2)", [e.chave, e.token]);
    await query(
      "UPDATE nina_message_batches SET next_retry_at=now()-interval '1 second' WHERE id=$1",
      [e.batch],
    );
    return query("SELECT * FROM nina_watchdog_reivindicar(1)");
  }

  const e = await entrada();
  for (const tentativa of [1, 2]) {
    await query("SELECT nina_watchdog_checkpoint($1,$2,'preparing',NULL)", [e.batch, e.token]);
    await query(
      "SELECT nina_watchdog_finalizar($1,$2,'retry_pending','PREPARATION_FAILED: fetch failed')",
      [e.batch, e.token],
    );
    const [m] = await query("SELECT nina_status,nina_error FROM whatsapp_mensagens WHERE id=$1", [
      e.msg,
    ]);
    assert.equal(m.nina_status, "retry_pending");
    assert.match(m.nina_error, /fetch failed/);
    const [retomado] = await recuperar(e);
    assert.equal(retomado.id, e.batch);
    assert.equal(retomado.attempt_count, tentativa + 1);
    assert.equal(retomado.watchdog_state, "processing");
    e.token = retomado.watchdog_token;
  }
  await query("UPDATE atend_conversas SET owner_type='NONE' WHERE id=$1", [e.conversa]);
  await query("SELECT nina_watchdog_finalizar($1,$2,'handoff','PROCESSING_ERROR: fetch failed')", [
    e.batch,
    e.token,
  ]);
  assert.deepEqual(await recuperar(e), []);
  const [final] = await query("SELECT nina_status,nina_error FROM whatsapp_mensagens WHERE id=$1", [
    e.msg,
  ]);
  assert.equal(final.nina_status, "handoff");
  assert.match(final.nina_error, /fetch failed/);

  // Geração sem snapshot tem efeito incerto e mantém a proibição de repetição.
  const incerta = await entrada();
  await query("SELECT nina_watchdog_checkpoint($1,$2,'generating',NULL)", [
    incerta.batch,
    incerta.token,
  ]);
  assert.deepEqual(await recuperar(incerta), []);
  const [parada] = await query(
    "SELECT watchdog_state,erro_tecnico,attempt_count FROM nina_message_batches WHERE id=$1",
    [incerta.batch],
  );
  assert.deepEqual(parada, {
    watchdog_state: "failed",
    erro_tecnico: "GENERATION_OUTCOME_UNKNOWN",
    attempt_count: 1,
  });
  console.log(
    "WATCHDOG_SQL_OK: 2 retomadas seguras, limite de 3 tentativas, handoff comprovado e geração incerta sem replay.",
  );
} finally {
  await db.close();
}
