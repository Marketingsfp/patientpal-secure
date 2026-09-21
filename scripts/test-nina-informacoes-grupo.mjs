import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const ler = (arquivo) => readFile(new URL(`../supabase/migrations/${arquivo}`, import.meta.url), "utf8");
const original = JSON.parse((await ler("20260920220000_nina_consolidacao_instrucoes.sql")).split("$nina_dados$")[1])[0].conteudo;
let vigente = original;
for (const [antes, depois] of JSON.parse((await ler("20260921150000_nina_duas_perguntas_esclarecimento.sql")).split("$alteracoes$")[1])) vigente = vigente.replace(antes, depois);
const migration = await ler("20260921180000_nina_informacoes_publicas_grupo.sql");
const regra = migration.split("$regra$")[1];
const db = new PGlite();
const snapshot = async () => (await db.query("SELECT * FROM nina_instrucoes_versoes ORDER BY id")).rows;
try {
  await db.exec(`CREATE TABLE nina_instrucoes_versoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid, escopo text NOT NULL,
    versao integer NOT NULL, conteudo text NOT NULL, status text NOT NULL, comentario text,
    versao_anterior_id uuid, publicado_em timestamptz, criado_por uuid, publicado_por uuid, created_at timestamptz DEFAULT now());`);
  await db.exec(migration);
  await db.query("INSERT INTO nina_instrucoes_versoes(escopo,versao,conteudo,status) VALUES ('whatsapp',42,$1,'publicada'),('painel_interno',4,'Painel intacto','publicada'),('whatsapp',43,'Rascunho preservado','rascunho')", [vigente]);
  const antes = await snapshot();
  await db.exec(migration);
  const depois = await snapshot();
  for (const linha of antes) assert.deepEqual(depois.find(v => v.id === linha.id), { ...linha, status: linha.escopo === 'whatsapp' && linha.status === 'publicada' ? 'arquivada' : linha.status });
  const nova = depois.find(v => !antes.some(a => a.id === v.id));
  assert.equal(nova.versao, 44);
  assert.equal(nova.conteudo, vigente + '\n\n' + regra);
  assert.ok(nova.conteudo.length < 60000);
  assert.ok(nova.conteudo.includes('ATÉ DUAS VEZES por solicitação'));
  await db.exec(migration);
  assert.deepEqual(await snapshot(), depois);
  await db.exec("UPDATE nina_instrucoes_versoes SET status='arquivada' WHERE escopo='whatsapp' AND status='publicada'; INSERT INTO nina_instrucoes_versoes(escopo,versao,conteudo,status) VALUES('whatsapp',45,'Versão posterior preservada','publicada')");
  const posterior = await snapshot();
  await db.exec(migration);
  assert.deepEqual(await snapshot(), posterior);
  console.log('PASS: regra do grupo acrescentada sem reescrever instruções anteriores; histórico, painel, rascunhos e publicação posterior preservados; idempotência.');
} finally { await db.close(); }
