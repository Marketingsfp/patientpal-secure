/** PostgreSQL descartável; não conecta ao banco da clínica.
 * bun install
 * bun scripts/test-nina-catalogo-estrutura.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(`
    CREATE TABLE audit_log(id bigserial, table_name text, record_id uuid, antes jsonb, depois jsonb);
    CREATE FUNCTION fn_audit_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO audit_log(table_name,record_id,antes,depois) VALUES(TG_TABLE_NAME,NEW.id,to_jsonb(OLD),to_jsonb(NEW)); RETURN NEW; END $$;
    CREATE TABLE nina_cat_servicos(id uuid PRIMARY KEY, clinica_id uuid, nome text, status text, valor numeric,
      valor_observacao text, descricao_publica text, preparo text, restricoes text, executantes jsonb,
      formas_pagamento jsonb, rascunho jsonb, nota_interna text, created_at timestamptz default now());
    CREATE TABLE nina_cat_profissionais(id uuid PRIMARY KEY, clinica_id uuid, nome text, status text,
      especialidades jsonb, horarios jsonb, tipo_atendimento text, observacao_publica text, aviso_dia text,
      formas_pagamento jsonb, convenios jsonb, rascunho jsonb, nota_interna text, created_at timestamptz default now());
    INSERT INTO nina_cat_servicos(id,nome,status,valor,descricao_publica,executantes,formas_pagamento,nota_interna)
      VALUES('11111111-1111-4111-8111-111111111111','ANESTESIA','PUBLICADO',1100,
      'ANESTESIA | Especialidade: GINECOLOGIA | Profissional: SPF | Dinheiro: R$ 1.100,00 | Pix/cartão: R$ 1.210,00',
      '[{"nome":"SPF","horarios":"SPF"}]','[{"forma":"Dinheiro","valor":1100},{"forma":"Pix/cartão","valor":1210}]','Interna preservada');
    INSERT INTO nina_cat_servicos(id,nome,status,descricao_publica,executantes)
      VALUES('22222222-2222-4222-8222-222222222222','Histórico','ARQUIVADO','SPF | anterior','[]'),
      ('33333333-3333-4333-8333-333333333333','Sem dados','RASCUNHO',null,'null');
    INSERT INTO nina_cat_profissionais(id,nome,status,especialidades,horarios,tipo_atendimento,observacao_publica,convenios,formas_pagamento)
      VALUES('44444444-4444-4444-8444-444444444444','Diogo','PUBLICADO','[]','[]','Consulta',
      'Consulta | Especialidade: Gastro | Idade/critério informado: 40 kg | Dias e horários: Manhã e tarde','[]','[]');
  `);
  const antes = (await db.query("SELECT row_to_json(s) v FROM nina_cat_servicos s ORDER BY id"))
    .rows;
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260920170000_nina_catalogo_estrutura_editorial.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(migration);
  const depois = (await db.query("SELECT row_to_json(s) v FROM nina_cat_servicos s ORDER BY id"))
    .rows;
  assert.equal(depois[0].v.valor, antes[0].v.valor);
  assert.deepEqual(depois[0].v.formas_pagamento, antes[0].v.formas_pagamento);
  assert.equal(depois[0].v.created_at, antes[0].v.created_at);
  assert.equal(depois[0].v.nota_interna, antes[0].v.nota_interna);
  assert.equal(depois[0].v.executantes[0].nome, "SFP");
  assert.equal(depois[0].v.estrutura.encaminhamento_humano, true);
  assert.equal(
    depois[0].v.descricao_publica,
    antes[0].v.descricao_publica.replaceAll("SPF", "SFP").replaceAll(" | ", "\n"),
  );
  assert.equal(depois[1].v.descricao_publica, antes[1].v.descricao_publica);
  assert.equal(depois[1].v.estrutura, null);
  assert.equal(depois[2].v.estrutura.preparo_status, "nao_informado");
  const p = (await db.query("SELECT * FROM nina_cat_profissionais")).rows[0];
  assert.equal(p.tipo_atendimento, "Consulta");
  assert.match(p.observacao_publica, /40 kg/);
  assert.match(p.observacao_publica, /Manhã e tarde/);
  const logs = (await db.query("SELECT count(*)::int n FROM audit_log")).rows[0].n;
  assert.equal(logs, 3);
  await db.exec(migration);
  assert.equal((await db.query("SELECT count(*)::int n FROM audit_log")).rows[0].n, logs);
  console.log(
    "PASS: migration PostgreSQL, SFP, preservação de preços/critério/IDs/histórico, auditoria e idempotência.",
  );
} finally {
  await db.close();
}
