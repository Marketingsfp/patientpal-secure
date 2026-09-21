// Valida a migration em PostgreSQL descartável; sem rede e sem dados de pacientes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const migration = await readFile(new URL("../supabase/migrations/20260920220000_nina_consolidacao_instrucoes.sql", import.meta.url), "utf8");
const fixture = JSON.parse(await readFile(new URL("../src/lib/nina/__tests__/fixtures/instrucoes-antes-consolidacao.json", import.meta.url), "utf8"));
const novos = JSON.parse(migration.split("$nina_dados$")[1]);
const db = new PGlite();
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const snapshot = () => query("SELECT * FROM nina_instrucoes_versoes ORDER BY id");
try {
  await db.exec(`CREATE TABLE nina_instrucoes_versoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid, escopo text NOT NULL,
    versao integer NOT NULL, conteudo text NOT NULL, status text NOT NULL, comentario text,
    versao_anterior_id uuid REFERENCES nina_instrucoes_versoes(id), publicado_em timestamptz,
    criado_por uuid, publicado_por uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX publicada_unica ON nina_instrucoes_versoes(escopo) WHERE status='publicada' AND clinica_id IS NULL;
    CREATE UNIQUE INDEX versao_unica ON nina_instrucoes_versoes(escopo,versao) WHERE clinica_id IS NULL;`);
  await db.exec(migration);
  assert.equal((await snapshot()).length, 0);
  for (const antigo of Object.values(fixture)) await query(
    "INSERT INTO nina_instrucoes_versoes(id,escopo,versao,conteudo,status,publicado_em) VALUES($1,$2,$3,$4,'publicada',$5)",
    [antigo.id, antigo.escopo, Number(antigo.versao), antigo.conteudo, antigo.publicado_em]);
  await db.exec("INSERT INTO nina_instrucoes_versoes(escopo,versao,conteudo,status) VALUES('whatsapp',42,'RASCUNHO DE OUTRO COLABORADOR','rascunho')");
  const antes = await snapshot();
  await db.exec(migration);
  const depois = await snapshot();
  for (const antigo of antes) {
    const preservado = depois.find(r => r.id === antigo.id);
    assert.deepEqual(preservado, { ...antigo, status: antigo.status === 'publicada' ? 'arquivada' : antigo.status });
  }
  for (const esperado of novos) {
    const atual = depois.find(r => r.escopo === esperado.escopo && r.status === 'publicada');
    assert.equal(atual.conteudo, esperado.conteudo);
    assert.equal(atual.versao_anterior_id, esperado.anterior_id);
    assert.equal(atual.versao, esperado.escopo === 'whatsapp' ? 43 : 4);
  }
  await db.exec(migration);
  assert.deepEqual(await snapshot(), depois);
  await db.exec("UPDATE nina_instrucoes_versoes SET status='arquivada' WHERE escopo='whatsapp' AND status='publicada'; INSERT INTO nina_instrucoes_versoes(escopo,versao,conteudo,status) VALUES('whatsapp',44,'PUBLICACAO POSTERIOR','publicada')");
  const posterior = await snapshot();
  await db.exec(migration);
  assert.deepEqual(await snapshot(), posterior);

  // Uma edição concorrente do painel precisa desfazer também a inserção anterior do WhatsApp.
  await db.exec("TRUNCATE nina_instrucoes_versoes CASCADE");
  for (const antigo of Object.values(fixture)) await query(
    "INSERT INTO nina_instrucoes_versoes(id,escopo,versao,conteudo,status) VALUES($1,$2,$3,$4,'publicada')",
    [antigo.id, antigo.escopo, Number(antigo.versao), antigo.conteudo]);
  await db.exec("UPDATE nina_instrucoes_versoes SET conteudo='OUTRA VERSAO' WHERE escopo='painel_interno'");
  const concorrente = await snapshot();
  await assert.rejects(() => db.exec(migration), /mudou desde a auditoria/);
  assert.deepEqual(await snapshot(), concorrente);
  console.log("PASS: publicação fiel, histórico e rascunho preservados, idempotência, versão posterior preservada e rollback integral em edição concorrente.");
} finally { await db.close(); }
