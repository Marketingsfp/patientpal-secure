// PostgreSQL descartável, sem rede, mensagens ou dados operacionais.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const antiga = await readFile(new URL("../supabase/migrations/20260920220000_nina_consolidacao_instrucoes.sql", import.meta.url), "utf8");
const payload = JSON.parse(antiga.split("$nina_dados$")[1]);
const migration = await readFile(new URL("../supabase/migrations/20260921150000_nina_duas_perguntas_esclarecimento.sql", import.meta.url), "utf8");
const alteracoes = JSON.parse(migration.split("$alteracoes$")[1]);
const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const snapshot = () => rows("SELECT * FROM nina_instrucoes_versoes ORDER BY id");
try {
  await db.exec(`CREATE TABLE nina_instrucoes_versoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid, escopo text NOT NULL,
    versao integer NOT NULL, conteudo text NOT NULL, status text NOT NULL, comentario text,
    versao_anterior_id uuid REFERENCES nina_instrucoes_versoes(id), publicado_em timestamptz,
    criado_por uuid, publicado_por uuid, created_at timestamptz DEFAULT now());`);
  await db.exec(migration);
  assert.equal((await snapshot()).length, 0);
  for (const p of payload) await db.query("INSERT INTO nina_instrucoes_versoes(escopo,versao,conteudo,status) VALUES($1,$2,$3,'publicada')", [p.escopo, p.escopo === "whatsapp" ? 41 : 4, p.conteudo]);
  await db.query("INSERT INTO nina_instrucoes_versoes(clinica_id,escopo,versao,conteudo,status) VALUES('11111111-1111-1111-1111-111111111111','whatsapp',10,$1,'publicada')", [payload[0].conteudo]);
  await db.exec("INSERT INTO nina_instrucoes_versoes(escopo,versao,conteudo,status) VALUES('whatsapp',42,'Rascunho de outro colaborador','rascunho')");
  const antes = await snapshot();
  await db.exec(migration);
  const depois = await snapshot();
  for (const versao of antes) assert.deepEqual(depois.find(v => v.id === versao.id), {
    ...versao, status: versao.escopo === 'whatsapp' && versao.status === 'publicada' ? 'arquivada' : versao.status,
  });
  for (const nova of depois.filter(v => !antes.some(a => a.id === v.id))) {
    let esperado = payload[0].conteudo;
    for (const [de, para] of alteracoes) esperado = esperado.replace(de, para);
    assert.equal(nova.conteudo, esperado);
    assert.equal(nova.versao, nova.clinica_id ? 11 : 43);
    assert.ok(antes.some(v => v.id === nova.versao_anterior_id));
  }
  await db.exec(migration);
  assert.deepEqual(await snapshot(), depois);
  await db.exec("UPDATE nina_instrucoes_versoes SET status='arquivada' WHERE escopo='whatsapp' AND clinica_id IS NULL AND status='publicada'; INSERT INTO nina_instrucoes_versoes(escopo,versao,conteudo,status) VALUES('whatsapp',44,'Publicação posterior','publicada')");
  const posterior = await snapshot();
  await db.exec(migration);
  assert.deepEqual(await snapshot(), posterior);
  await db.exec("TRUNCATE nina_instrucoes_versoes CASCADE; INSERT INTO nina_instrucoes_versoes(escopo,versao,conteudo,status) VALUES('whatsapp',41,'Texto concorrente diferente','publicada')");
  const concorrente = await snapshot();
  await assert.rejects(() => db.exec(migration), /divergiram/);
  assert.deepEqual(await snapshot(), concorrente);
  console.log("PASS: duas perguntas, histórico e rascunhos preservados, escopos isolados, idempotência e proteção de versões posteriores/concorrentes.");
} finally { await db.close(); }
