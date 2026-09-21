/** Publicação em banco descartável, sem conexão com a clínica. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PROMPT_NINA_WHATSAPP_V4 } from "../src/lib/nina/prompt/behavior-v4";
import { CONTINUIDADE_RESPOSTAS_ANTERIOR, CONTINUIDADE_RESPOSTAS_CONTEXTUAIS } from "../src/lib/nina/prompt/respostas-contextuais";
import { validarTemplateInstrucoes } from "../src/lib/nina/instrucoes-template";
import { MIGRATION_RESPOSTAS_CONTEXTUAIS, gerarMigrationRespostasContextuais } from "./nina/gerar-respostas-contextuais";
const migration = readFileSync(MIGRATION_RESPOSTAS_CONTEXTUAIS, "utf8");
assert.equal(migration, gerarMigrationRespostasContextuais());
const identidade = "[IDENTIDADE DO ATENDIMENTO]\nNome da atendente virtual: Nina\nNome do estabelecimento: Menino Jesus\nTipo do estabelecimento: Policlínica\n[/IDENTIDADE DO ATENDIMENTO]\n\n";
const anterior = identidade + PROMPT_NINA_WHATSAPP_V4.replace(CONTINUIDADE_RESPOSTAS_CONTEXTUAIS, CONTINUIDADE_RESPOSTAS_ANTERIOR);
const db = new PGlite();
try {
  await db.exec(`CREATE TABLE nina_instrucoes_versoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinica_id uuid,
    escopo text,versao integer,conteudo text,status text,comentario text,versao_anterior_id uuid,
    publicado_em timestamptz,created_at timestamptz DEFAULT now());`);
  await db.query("INSERT INTO nina_instrucoes_versoes(escopo,versao,conteudo,status) VALUES ('whatsapp',46,$1,'publicada'),('painel_interno',4,'Painel intacto','publicada')", [anterior]);
  const antes = (await db.query("SELECT * FROM nina_instrucoes_versoes ORDER BY escopo")).rows;
  await db.exec(migration);
  const depois = (await db.query("SELECT * FROM nina_instrucoes_versoes ORDER BY escopo,versao")).rows;
  assert.equal(depois.length, 3);
  for (const a of antes) assert.deepEqual(depois.find(d => d.id === a.id), {
    ...a, status: a.escopo === "whatsapp" ? "arquivada" : a.status,
  });
  const nova = depois.find(d => d.versao === 47)!;
  assert.equal(nova.conteudo, identidade + PROMPT_NINA_WHATSAPP_V4);
  assert.equal(nova.versao_anterior_id, antes.find(a => a.escopo === "whatsapp")!.id);
  assert.ok(validarTemplateInstrucoes("whatsapp", String(nova.conteudo)).ok);
  await db.exec(migration);
  assert.deepEqual((await db.query("SELECT * FROM nina_instrucoes_versoes ORDER BY escopo,versao")).rows, depois);
  await db.exec("TRUNCATE nina_instrucoes_versoes");
  await db.query("INSERT INTO nina_instrucoes_versoes(escopo,versao,conteudo,status) VALUES ('whatsapp',46,$1,'publicada')", ["Regra editada pela clínica"]);
  await assert.rejects(db.exec(migration), /Instrução mudou/);
  await db.exec("ROLLBACK");
  assert.equal((await db.query("SELECT count(*)::int n FROM nina_instrucoes_versoes WHERE status='publicada'")).rows[0]!.n, 1);
  console.log("PASS: continuidade informal publicada; identidade e histórico preservados; idempotência e proteção de conflito verificadas.");
} finally { await db.close(); }
