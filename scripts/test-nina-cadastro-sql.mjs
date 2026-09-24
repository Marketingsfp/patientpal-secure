// Banco PostgreSQL temporário em memória. Uso: node este-arquivo <caminho-do-pglite>
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE FUNCTION strip_accents(text) RETURNS text LANGUAGE sql IMMUTABLE AS
    $$ SELECT translate($1, 'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC') $$;
  CREATE FUNCTION normalizar_telefone(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN length(d)>11 AND left(d,2)='55' THEN right(substr(d,3),11) ELSE right(d,11) END
    FROM (SELECT regexp_replace(coalesce($1,''),'\\D','','g') d) s $$;
  CREATE TABLE pacientes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid NOT NULL,
    nome text NOT NULL, data_nascimento date, telefone text, telefone2 text, cpf text,
    cpf_digits text GENERATED ALWAYS AS (regexp_replace(coalesce(cpf,''),'\\D','','g')) STORED,
    sexo text, ativo boolean DEFAULT true, is_mock_data boolean DEFAULT false, teste boolean DEFAULT false,
    codigo_prontuario text DEFAULT 'AUTO', codigo_prontuario_anterior text, numero_pasta text);
  CREATE TABLE atend_conversas(id uuid PRIMARY KEY, clinica_id uuid NOT NULL, is_teste boolean DEFAULT false,
    identidade_confirmada boolean DEFAULT false, contato_paciente_id uuid);
  CREATE TABLE audit_log(clinica_id uuid, table_name text, record_id uuid, action text, dados_depois jsonb);
`);
await db.exec(
  await readFile(
    new URL("../supabase/migrations/20260916190000_nina_cadastro_minimo.sql", import.meta.url),
    "utf8",
  ),
);
await db.exec(await readFile(new URL("../supabase/migrations/20260924233000_nina_cadastro_identidade_tripla.sql", import.meta.url), "utf8"));
const clinica = randomUUID();
const sql = "select nina_resolver_cadastro($1,$2,$3,$4,$5,$6) r";
async function conversa(extra = {}) {
  const id = randomUUID();
  await db.query(
    "insert into atend_conversas(id,clinica_id,is_teste,identidade_confirmada,contato_paciente_id) values($1,$2,$3,$4,$5)",
    [
      id,
      extra.clinica ?? clinica,
      extra.teste ?? false,
      Boolean(extra.paciente),
      extra.paciente ?? null,
    ],
  );
  return id;
}
async function resolver(
  conv,
  nome = "Ana da Silva",
  nascimento = "1990-01-02",
  telefone = "5521999990000",
  cpf = null,
) {
  return (await db.query(sql, [clinica, conv, nome, nascimento, telefone, cpf])).rows[0].r;
}
async function paciente(nome, nascimento, telefone, extra = {}) {
  const id = randomUUID();
  await db.query(
    "insert into pacientes(id,clinica_id,nome,data_nascimento,telefone,ativo,is_mock_data,teste,codigo_prontuario,numero_pasta) values($1,$2,$3,$4,$5,$6,$7,$7,'LEGADO-123','PASTA-42')",
    [
      id,
      extra.clinica ?? clinica,
      nome,
      nascimento,
      telefone,
      extra.ativo ?? true,
      extra.teste ?? false,
    ],
  );
  return id;
}
let testes = 0;
async function caso(nome, fn) {
  await fn();
  testes++;
  console.log(`PASS ${nome}`);
}
await caso("cria cadastro mínimo sem CPF e vincula à conversa", async () => {
  const conv = await conversa();
  const r = await resolver(conv);
  assert.equal(r.ok, true);
  assert.equal(r.criado, true);
  const p = (await db.query("select * from pacientes where id=$1", [r.paciente_id])).rows[0];
  assert.equal(p.cpf, null);
  assert.equal(p.telefone, "21999990000");
  assert.equal(
    (await db.query("select contato_paciente_id from atend_conversas where id=$1", [conv])).rows[0]
      .contato_paciente_id,
    p.id,
  );
});
await caso("repetição e outra conversa reutilizam cadastro", async () => {
  const conv = await conversa();
  const a = await resolver(conv);
  const b = await resolver(conv);
  assert.equal(a.criado, false);
  assert.equal(a.paciente_id, b.paciente_id);
  assert.equal((await db.query("select count(*)::int n from pacientes")).rows[0].n, 1);
});
await caso("nome com acento e espaços é reconciliado", async () => {
  const id = await paciente("JOSÉ DA SILVA", "1980-01-01", "21988880000");
  const r = await resolver(await conversa(), "José  da Silva", "1980-01-01", "5521988880000");
  assert.equal(r.paciente_id, id);
  assert.equal(r.criado, false);
});
await caso("pessoas com mesmo telefone não são confundidas", async () => {
  const r = await resolver(await conversa(), "Maria da Silva", "2010-01-01");
  assert.equal(r.ok, true);
  assert.equal(r.criado, true);
});
await caso("homônimos com mesmo nascimento são distinguidos pelo telefone", async () => {
  const id = await paciente("JOAO SOUZA", "1985-05-10", "21977770000");
  await paciente("JOAO SOUZA", "1985-05-10", "21966660000");
  const r = await resolver(await conversa(), "Joao Souza", "1985-05-10", "21977770000");
  assert.equal(r.paciente_id, id);
  assert.equal(r.criado, false);
});
await caso("telefone divergente não vincula nem cria duplicata", async () => {
  const antes = (await db.query("select count(*)::int n from pacientes")).rows[0].n;
  const r = await resolver(await conversa(), "Ana da Silva", "1990-01-02", "21955550000");
  assert.equal(r.erro, "PATIENT_DATA_MISMATCH");
  assert.equal((await db.query("select count(*)::int n from pacientes")).rows[0].n, antes);
});
await caso("cadastro confirmado recebe somente campos vazios; prontuário permanece", async () => {
  const id = await paciente("PEDRO SILVA", null, null);
  const r = await resolver(await conversa({ paciente: id }), "Pedro Silva", "1970-01-01");
  assert.equal(r.paciente_id, id);
  assert.deepEqual(r.campos_completados, ["data_nascimento", "telefone"]);
  const p = (await db.query("select * from pacientes where id=$1", [id])).rows[0];
  assert.equal(p.codigo_prontuario, "LEGADO-123");
  assert.equal(p.numero_pasta, "PASTA-42");
});
await caso("nascimento divergente de vínculo confirmado não é sobrescrito", async () => {
  const id = await paciente("PAULO SILVA", "1980-01-01", "21944440000");
  const r = await resolver(await conversa({ paciente: id }), "Paulo Silva", "1981-01-01");
  assert.equal(r.erro, "PATIENT_DATA_MISMATCH");
});
await caso("conversa de outra clínica não grava cadastro", async () => {
  assert.equal(
    (await resolver(await conversa({ clinica: randomUUID() }))).erro,
    "PERMISSION_DENIED",
  );

});
await caso("cadastro inativo e vínculo com outra clínica não são reutilizados", async () => {
  const id = await paciente("CARLOS SILVA", "1980-01-01", "21933330000", { ativo: false });
  assert.equal(
    (await resolver(await conversa({ paciente: id }), "Carlos Silva", "1980-01-01")).erro,
    "PATIENT_DATA_MISMATCH",
  );
  const fora = await paciente("CARLOS SILVA", "1980-01-01", "21933330000", {
    clinica: randomUUID(),
  });
  assert.equal(
    (await resolver(await conversa({ paciente: fora }), "Carlos Silva", "1980-01-01")).erro,
    "PATIENT_DATA_MISMATCH",
  );
});
await caso("telefone obrigatório e data futura são recusados", async () => {
  assert.equal(
    (await resolver(await conversa(), "Ana Silva", "1990-01-01", "123")).erro,
    "VALIDATION_ERROR",
  );
  assert.equal(
    (await resolver(await conversa(), "Ana Silva", "2990-01-01")).erro,
    "VALIDATION_ERROR",
  );
});
await caso("três dados iguais continuam ambíguos; nenhum paciente é escolhido", async () => {
  await paciente("LUIZA LIMA", "1986-01-01", "21944445555");
  await paciente("LUIZA LIMA", "1986-01-01", "21944445555");
  const conv = await conversa();
  const n = (await db.query("select count(*)::int n from pacientes")).rows[0].n;
  assert.equal((await resolver(conv, "Luiza Lima", "1986-01-01", "5521944445555")).erro, "PATIENT_AMBIGUOUS");
  assert.equal((await db.query("select contato_paciente_id from atend_conversas where id=$1", [conv])).rows[0].contato_paciente_id, null);
  assert.equal((await db.query("select count(*)::int n from pacientes")).rows[0].n, n);
});
await caso("telefone secundário distingue homônimos sem alterar o cadastro", async () => {
  const id = await paciente("LUCIA REIS", "1980-04-03", "21911112222");
  await paciente("LUCIA REIS", "1980-04-03", "21933334444");
  await db.query("update pacientes set telefone2=$1 where id=$2", ["(21) 95555-6666", id]);
  const r = await resolver(await conversa(), "Lucia Reis", "1980-04-03", "5521955556666");
  assert.equal(r.paciente_id, id);
  const p = (await db.query("select * from pacientes where id=$1", [id])).rows[0];
  assert.equal(p.telefone, "21911112222");
  assert.equal(p.codigo_prontuario, "LEGADO-123");
});
await caso("mesmo nome e telefone com nascimentos diferentes não confundem pacientes", async () => {
  await paciente("MARIO REIS", "1980-04-03", "21911112222");
  const id = await paciente("MARIO REIS", "1981-04-03", "21911112222");
  assert.equal((await resolver(await conversa(), "Mario Reis", "1981-04-03", "21911112222")).paciente_id, id);
});
await caso("cadastro incompleto único com nome e telefone recebe nascimento", async () => {
  const id = await paciente("ROSA REIS", null, "21911112222");
  const r = await resolver(await conversa(), "Rosa Reis", "1980-04-03", "21911112222");
  assert.equal(r.paciente_id, id);
  assert.deepEqual(r.campos_completados, ["data_nascimento"]);
});
await caso("homologação cria no cadastro do Clínica OS com dados informados e telefone virtual", async () => {
  const conv = await conversa({ teste: true });
  const r = await resolver(conv, "Paciente Teste Completo", "1997-03-12", "55000100391");
  assert.equal(r.ok, true);
  assert.equal(r.criado, true);
  const p = (await db.query("select * from pacientes where id=$1", [r.paciente_id])).rows[0];
  assert.equal(p.nome, "PACIENTE TESTE COMPLETO");
  assert.equal(p.data_nascimento.toISOString().slice(0,10), "1997-03-12");
  assert.equal(p.telefone, "55000100391");
  assert.equal(p.is_mock_data, true);
  assert.equal(p.teste, true);
  assert.equal((await resolver(conv, "Paciente Teste Completo", "1997-03-12", "55000100391")).paciente_id, p.id);
  const outra = await resolver(await conversa({ teste: true }), "Paciente Teste Completo", "1997-03-12", "55000100391");
  assert.equal(outra.paciente_id, p.id);
  assert.equal(outra.criado, false);
});
await caso("produção e homologação não compartilham pacientes mesmo com os três dados iguais", async () => {
  const prod = await resolver(await conversa(), "Escopo Teste Silva", "1995-01-01");
  const teste = await resolver(await conversa({ teste: true }), "Escopo Teste Silva", "1995-01-01");
  assert.equal(prod.ok, true);
  assert.equal(teste.ok, true);
  assert.notEqual(prod.paciente_id, teste.paciente_id);
  assert.equal((await resolver(await conversa(), "Escopo Teste Silva", "1995-01-01")).paciente_id, prod.paciente_id);
  assert.equal((await resolver(await conversa({ teste: true, paciente: prod.paciente_id }), "Escopo Teste Silva", "1995-01-01")).erro, "PATIENT_DATA_MISMATCH");
  assert.equal((await resolver(await conversa({ paciente: teste.paciente_id }), "Escopo Teste Silva", "1995-01-01")).erro, "PATIENT_DATA_MISMATCH");
});
await caso("homologação também distingue homônimos pelo telefone", async () => {
  await paciente("HOMONIMO TESTE", "1990-01-01", "55000100001", { teste: true });
  const id = await paciente("HOMONIMO TESTE", "1990-01-01", "55000100002", { teste: true });
  const r = await resolver(await conversa({ teste: true }), "Homonimo Teste", "1990-01-01", "55000100002");
  assert.equal(r.paciente_id, id);
  assert.equal(r.criado, false);
});
await caso("função é restrita ao servidor e mantém auditoria", async () => {
  const permissoes = (
    await db.query(
      "select has_function_privilege('anon','nina_resolver_cadastro(uuid,uuid,text,date,text,text)','EXECUTE') anon, has_function_privilege('authenticated','nina_resolver_cadastro(uuid,uuid,text,date,text,text)','EXECUTE') autenticado, has_function_privilege('service_role','nina_resolver_cadastro(uuid,uuid,text,date,text,text)','EXECUTE') servidor",
    )
  ).rows[0];
  assert.deepEqual(permissoes, { anon: false, autenticado: false, servidor: true });
  assert.ok((await db.query("select count(*)::int n from audit_log")).rows[0].n > 0);
});
console.log(`${testes} testes SQL passaram, sem banco externo.`);
await db.close();
