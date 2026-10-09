import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// PostgreSQL descartável: executa a RPC real sem acessar pacientes da clínica.
const db = new PGlite();
const clinica = "00000000-0000-4000-8000-000000000001";
const conversa = "00000000-0000-4000-8000-000000000002";
const outra = "00000000-0000-4000-8000-000000000003";
const telefone = "21999990000";
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION strip_accents(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT translate($1, 'áéíóúãõâêôçÁÉÍÓÚÃÕÂÊÔÇ', 'aeiouaoaeocAEIOUAOAEOC') $$;
    CREATE FUNCTION normalizar_telefone(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(right(regexp_replace($1, '\\D', '', 'g'),11),'') $$;
    CREATE TABLE atend_conversas(id uuid PRIMARY KEY, clinica_id uuid, identidade_confirmada boolean DEFAULT false,
      contato_paciente_id uuid, is_teste boolean DEFAULT false, contato_telefone text);
    CREATE TABLE pacientes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid, nome text, data_nascimento date,
      telefone text, telefone2 text, cpf text, cpf_digits text, sexo text, ativo boolean DEFAULT true,
      is_mock_data boolean DEFAULT false, teste boolean DEFAULT false);
    CREATE TABLE audit_log(clinica_id uuid, table_name text, record_id uuid, action text, dados_antes jsonb, dados_depois jsonb);
  `);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261005190000_nina_cadastro_dependente_whatsapp.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync("supabase/migrations/20261005210000_nina_alterar_telefone_paciente.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("TRUNCATE atend_conversas, pacientes, audit_log");
  await db.query("INSERT INTO atend_conversas(id,clinica_id,contato_telefone) VALUES ($1,$2,$3)", [
    conversa,
    clinica,
    `55${telefone}`,
  ]);
});
async function resolver(
  nome = "Sofia Lima Rocha",
  nascimento = "2023-02-14",
  tel = telefone,
  cid = clinica,
) {
  const { rows } = await db.query<{
    resultado: {
      ok: boolean;
      criado?: boolean;
      paciente_id?: string;
      erro?: string;
      teste?: boolean;
    };
  }>("SELECT nina_resolver_cadastro($1,$2,$3,$4::date,$5) resultado", [
    cid,
    conversa,
    nome,
    nascimento,
    tel,
  ]);
  return rows[0]!.resultado;
}
async function pacientes() {
  return (await db.query<Record<string, unknown>>("SELECT * FROM pacientes ORDER BY nome")).rows;
}

async function trocar(id: string, tel = "21988887777", anterior = telefone, cid = clinica) {
  return (
    await db.query<{ r: { ok: boolean; erro?: string } }>(
      "SELECT nina_alterar_telefone_paciente($1,$2,$3,'SOFIA LIMA ROCHA','2023-02-14',$4,$5,'troque o telefone para 21988887777') r",
      [cid, conversa, id, anterior, tel],
    )
  ).rows[0]!.r;
}
test.each([false, true])(
  "correção atômica só do contato com auditoria e repetição segura (teste=%s)",
  async (teste) => {
    await db.query("UPDATE atend_conversas SET is_teste=$1", [teste]);
    const r = await resolver();
    const id = r.paciente_id!;
    await db.exec("UPDATE pacientes SET telefone2='2133334444'");
    const antes = (await pacientes())[0]!;
    expect(await trocar(id)).toMatchObject({ ok: true });
    expect((await pacientes())[0]).toEqual({ ...antes, telefone: "21988887777" });
    expect(
      (await db.query<{ contato_telefone: string }>("SELECT contato_telefone FROM atend_conversas"))
        .rows[0]!.contato_telefone,
    ).toBe(`55${telefone}`);
    expect(await trocar(id)).toMatchObject({ ok: true });
    const logs = (
      await db.query<{ dados_antes: unknown; dados_depois: Record<string, unknown> }>(
        "SELECT dados_antes,dados_depois FROM audit_log WHERE action='NINA_TELEFONE_ALTERADO'",
      )
    ).rows;
    expect(logs).toHaveLength(1);
    expect(logs[0]!.dados_antes).toEqual({ telefone });
    expect(logs[0]!.dados_depois).toMatchObject({
      telefone: "21988887777",
      origem: teste ? "nina_homologacao" : "nina_whatsapp",
    });
  },
);
test("alteração concorrente, clínica errada e paciente não vinculado não são sobrescritos", async () => {
  const r = await resolver();
  const id = r.paciente_id!;
  expect((await trocar(id, "21988887777", "11900000000")).ok).toBe(false);
  expect((await trocar(id, "21988887777", telefone, outra)).ok).toBe(false);
  expect((await trocar(outra)).ok).toBe(false);
  expect((await pacientes())[0]!.telefone).toBe(telefone);
  await db.exec("UPDATE atend_conversas SET identidade_confirmada=false");
  expect((await trocar(id)).ok).toBe(false);
});
test("homologação nunca altera telefone de paciente real vinculado por engano", async () => {
  const r = await resolver();
  await db.exec("UPDATE atend_conversas SET is_teste=true");
  expect((await trocar(r.paciente_id!)).ok).toBe(false);
  expect((await pacientes())[0]!.telefone).toBe(telefone);
});
test("falha da auditoria reverte a mudança do telefone", async () => {
  const r = await resolver();
  await db.exec(
    "ALTER TABLE audit_log ADD CONSTRAINT bloquear_teste CHECK (action <> 'NINA_TELEFONE_ALTERADO')",
  );
  try {
    await expect(trocar(r.paciente_id!)).rejects.toThrow();
  } finally {
    await db.exec("ALTER TABLE audit_log DROP CONSTRAINT bloquear_teste");
  }
  expect((await pacientes())[0]!.telefone).toBe(telefone);
});

test.each([false, true])(
  "filha usa WhatsApp do responsável, cria uma vez e reutiliza (homologação=%s)",
  async (teste) => {
    await db.query("UPDATE atend_conversas SET is_teste=$1", [teste]);
    const criada = await resolver(undefined, undefined, "11988887777");
    expect(criada).toMatchObject({ ok: true, criado: true, teste });
    expect((await pacientes())[0]).toMatchObject({
      nome: "SOFIA LIMA ROCHA",
      telefone,
      is_mock_data: teste,
      teste,
    });
    const repetida = await resolver();
    expect(repetida).toMatchObject({ ok: true, criado: false, paciente_id: criada.paciente_id });
    expect(await pacientes()).toHaveLength(1);
    const auditoria = (await db.query("SELECT dados_depois FROM audit_log")).rows;
    expect(JSON.stringify(auditoria)).not.toContain("SOFIA");
    expect(JSON.stringify(auditoria)).not.toContain("2023-02-14");
  },
);

test("troca cadastro vinculado do responsável pela filha sem alterar o responsável", async () => {
  const pai = await resolver("Ricardo Alves Pereira", "1975-03-12");
  const original = (await pacientes())[0];
  const filha = await resolver();
  expect(filha).toMatchObject({ ok: true, criado: true });
  expect(filha.paciente_id).not.toBe(pai.paciente_id);
  expect((await pacientes()).find((p) => p.id === pai.paciente_id)).toEqual(original);
  expect(
    (
      await db.query<{ contato_paciente_id: string }>(
        "SELECT contato_paciente_id FROM atend_conversas",
      )
    ).rows[0]?.contato_paciente_id,
  ).toBe(filha.paciente_id!);
  const outroFilho = await resolver("Pedro Lima Rocha", "2020-04-12");
  expect(outroFilho).toMatchObject({ ok: true, criado: true });
  expect(await pacientes()).toHaveLength(3);
  expect((await resolver()).paciente_id).toBe(filha.paciente_id);
});

test("mesmo telefone não mistura clínica nem homologação com pacientes reais", async () => {
  const real = await resolver();
  await db.exec("UPDATE atend_conversas SET is_teste=true");
  const simulado = await resolver();
  expect(simulado).toMatchObject({ ok: true, criado: true, teste: true });
  expect(simulado.paciente_id).not.toBe(real.paciente_id);
  expect(await resolver(undefined, undefined, undefined, outra)).toMatchObject({
    ok: false,
    erro: "PERMISSION_DENIED",
  });
  await db.query("UPDATE atend_conversas SET clinica_id=$1", [outra]);
  const outraClinica = await resolver(undefined, undefined, undefined, outra);
  expect(outraClinica).toMatchObject({ ok: true, criado: true });
  expect(await pacientes()).toHaveLength(3);
});

test("homônimos ambíguos não são escolhidos; telefone divergente não sobrescreve nem duplica", async () => {
  await resolver();
  await db.exec("UPDATE atend_conversas SET identidade_confirmada=false, contato_paciente_id=null");
  await db.exec(
    "INSERT INTO pacientes(clinica_id,nome,data_nascimento,telefone) SELECT clinica_id,nome,data_nascimento,telefone FROM pacientes",
  );
  expect(await resolver()).toMatchObject({ ok: false, erro: "PATIENT_AMBIGUOUS" });
  const anteriores = await pacientes();
  await db.query("UPDATE atend_conversas SET contato_telefone=$1", ["11988887777"]);
  expect(await resolver()).toMatchObject({ ok: false, erro: "PATIENT_DATA_MISMATCH" });
  expect(await pacientes()).toEqual(anteriores);
});

test("contato ausente na conversa não pode ser substituído pelo argumento do modelo", async () => {
  await db.exec("UPDATE atend_conversas SET contato_telefone=null");
  expect(await resolver()).toMatchObject({ ok: false, erro: "VALIDATION_ERROR" });
  expect(await pacientes()).toHaveLength(0);
});
