// PostgreSQL descartável em memória; não conecta ao banco da clínica.
// Uso: node scripts/test-atend-inbox-ordem.mjs <caminho-do-pglite/dist/index.js>
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = await readFile(new URL("../supabase/migrations/20260919170000_atend_inbox_ordem_estavel.sql", import.meta.url), "utf8");
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const linha = async (id) => (await query("SELECT * FROM atend_conversas WHERE id=$1", [id]))[0];
const atualizar = async (id, sql) => {
  await query(`UPDATE atend_conversas SET ${sql} WHERE id=$1`, [id]);
  return linha(id);
};
const ordem = async () => (await query("SELECT id FROM atend_conversas WHERE is_teste=false AND status NOT IN ('closed','finished') ORDER BY inbox_entrada_em DESC,id ASC")).map(c => c.id);
try {
  await db.exec(`
    CREATE TABLE atend_conversas (
      id text PRIMARY KEY, clinica_id text DEFAULT 'clinica', created_at timestamptz NOT NULL DEFAULT now(),
      assigned_at timestamptz, handoff_em timestamptz, owner_type text DEFAULT 'AI',
      atribuida_user_id text, status text DEFAULT 'bot_attending', is_teste boolean DEFAULT false,
      ultima_msg_em timestamptz, ultima_msg_preview text, unread_count int DEFAULT 0,
      fila_pendente boolean DEFAULT false, resolved_at timestamptz
    );
    CREATE TABLE atend_conversa_eventos (conversa_id text, clinica_id text, created_at timestamptz, evento text);
    INSERT INTO atend_conversas(id,created_at,assigned_at,owner_type,atribuida_user_id,status,ultima_msg_em) VALUES
      ('a','2026-01-01 10:00Z','2026-01-01 11:00Z','HUMAN','ana','active','2026-01-01 19:00Z'),
      ('b','2026-01-01 10:00Z','2026-01-01 12:00Z','HUMAN','ana','waiting','2026-01-01 12:00Z'),
      ('reaberta','2026-01-01 10:00Z',null,'AI',null,'bot_attending','2026-01-01 14:00Z');
    INSERT INTO atend_conversa_eventos VALUES
      ('reaberta','clinica','2026-01-01 13:00Z','REABERTA'),
      ('reaberta','outra-clinica','2027-01-01 13:00Z','REABERTA');
  `);
  const originais = await query("SELECT * FROM atend_conversas ORDER BY id");
  await db.exec(migration);
  assert.deepEqual(await ordem(), ['reaberta', 'b', 'a']);
  const preenchidas = await query("SELECT * FROM atend_conversas ORDER BY id");
  assert.deepEqual(preenchidas.map(({inbox_entrada_em, ...c})=>c), originais, "backfill preserva os dados preexistentes");
  await db.exec(migration);
  assert.deepEqual(await query("SELECT * FROM atend_conversas ORDER BY id"), preenchidas, "reexecução não muda posições");

  for (const sql of [
    "ultima_msg_em=now(), ultima_msg_preview='Outra dúvida', unread_count=unread_count+1",
    "ultima_msg_em=now(), ultima_msg_preview='Resposta humana', unread_count=0",
    "assigned_at=now()",
    "inbox_entrada_em=now()",
  ]) {
    const antes = await linha('a');
    const depois = await atualizar('a', sql);
    assert.deepEqual(depois.inbox_entrada_em, antes.inbox_entrada_em, sql);
    assert.deepEqual(await ordem(), ['reaberta','b','a']);
  }
  const reservada = await atualizar('b', "fila_pendente=true");
  const ativa = await atualizar('b', "fila_pendente=false,status='active'");
  assert.deepEqual(ativa.inbox_entrada_em, reservada.inbox_entrada_em, "primeira resposta não altera posição");

  await db.exec("INSERT INTO atend_conversas(id) VALUES('nova')");
  assert.equal((await ordem())[0], 'nova');
  await atualizar('reaberta', "owner_type='NONE',status='waiting'");
  assert.equal((await ordem())[0], 'reaberta', "handoff para fila global entra no topo");
  await atualizar('a', "atribuida_user_id='bia'");
  assert.equal((await ordem())[0], 'a', "nova atribuição no topo");
  await atualizar('reaberta', "owner_type='HUMAN',atribuida_user_id='ana',fila_pendente=true");
  assert.equal((await ordem())[0], 'reaberta', "atribuição pela Nina no topo");
  const antesAviso = await linha('reaberta');
  const aviso = await atualizar('reaberta', "handoff_em=now(),ultima_msg_em=now(),ultima_msg_preview='Encaminhada'");
  assert.deepEqual(aviso.inbox_entrada_em, antesAviso.inbox_entrada_em, "aviso interno/paciente não move");

  for (const encerrado of ['closed','finished']) {
    const antes = await linha('b');
    const fechado = await atualizar('b', `status='${encerrado}',owner_type='AI',atribuida_user_id=null,resolved_at=now()`);
    assert.deepEqual(fechado.inbox_entrada_em, antes.inbox_entrada_em, "encerramento mantém referência");
    await atualizar('b', "status='bot_attending',assigned_at=null,handoff_em=null,resolved_at=null");
    assert.equal((await ordem())[0], 'b', "paciente reabre como novo atendimento");
    const aberto = await linha('b');
    const msg = await atualizar('b', "ultima_msg_em=now(),ultima_msg_preview='segunda mensagem'");
    assert.deepEqual(msg.inbox_entrada_em, aberto.inbox_entrada_em, "só a reabertura move");
  }
  await db.exec("INSERT INTO atend_conversas(id,is_teste,inbox_entrada_em) VALUES('teste',true,'2026-01-01')");
  const teste = await linha('teste');
  const testeDepois = await atualizar('teste', "owner_type='HUMAN',atribuida_user_id='ana',status='active'");
  assert.deepEqual(testeDepois.inbox_entrada_em, teste.inbox_entrada_em, "homologação fora da regra");
  assert.equal((await ordem()).includes('teste'), false);
  console.log('PASS: migration idempotente; histórico, escopo e homologação preservados; mensagens/respostas fixas; novas atribuições e reaberturas no topo.');
} finally { await db.close(); }
