import { beforeAll, afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  caminhoClinicoValido,
  origemLink,
  podeLiberarPapel,
  visivelAnexo,
  visivelPedido,
} from "./regras-fase2";

const db = new PGlite();
const c1 = "10000000-0000-4000-8000-000000000001";
const c2 = "10000000-0000-4000-8000-000000000002";
const p1 = "20000000-0000-4000-8000-000000000001";
const p2 = "20000000-0000-4000-8000-000000000002";
const u = "30000000-0000-4000-8000-000000000001";
const path = `${c1}/${p1}/anexo/teste.pdf`;

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE clinicas(id uuid PRIMARY KEY);
    CREATE TABLE pacientes(id uuid PRIMARY KEY,clinica_id uuid);
    CREATE TABLE medicos(id uuid PRIMARY KEY,clinica_id uuid);
    CREATE TABLE agendamentos(id uuid PRIMARY KEY,clinica_id uuid,paciente_id uuid);
    CREATE TABLE fin_atendimentos(id uuid PRIMARY KEY,clinica_id uuid,paciente_id uuid);
    CREATE TABLE documentos_emitidos(id uuid PRIMARY KEY,clinica_id uuid,paciente_id uuid);
    CREATE TABLE procedimentos(id uuid PRIMARY KEY,clinica_id uuid);
    CREATE TABLE clinica_memberships(user_id uuid,clinica_id uuid,ativo boolean,role text);
    CREATE FUNCTION is_member(u uuid,c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM clinica_memberships WHERE user_id=u AND clinica_id=c AND ativo) $$;
    CREATE TABLE paciente_arquivos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinica_id uuid,paciente_id uuid,tipo text,caminho text,enviado_por uuid DEFAULT auth.uid(),created_at timestamptz DEFAULT now());
    ALTER TABLE paciente_arquivos ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT ON paciente_arquivos TO authenticated;
    CREATE POLICY arq_select ON paciente_arquivos FOR SELECT TO authenticated USING(is_member(auth.uid(),clinica_id));
    CREATE POLICY arq_insert ON paciente_arquivos FOR INSERT TO authenticated WITH CHECK(is_member(auth.uid(),clinica_id));
    CREATE TABLE portal_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE portal_paciente_config(clinica_id uuid,ativo boolean,auto_liberar jsonb DEFAULT '{}');
    CREATE TABLE audit_log(user_id uuid,clinica_id uuid,table_name text,record_id text,action text,dados_antes jsonb,dados_depois jsonb);
    CREATE TABLE portal_acessos(clinica_id uuid,paciente_id uuid,evento text,detalhe jsonb);
    CREATE FUNCTION portal_auto_liberar_documento() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE FUNCTION portal_auto_liberar_exame() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE FUNCTION portal_carimbar_liberacao() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    INSERT INTO clinicas VALUES('${c1}'),('${c2}');
    INSERT INTO pacientes VALUES('${p1}','${c1}'),('${p2}','${c2}');
    INSERT INTO clinica_memberships VALUES('${u}','${c1}',true,'admin');
    INSERT INTO portal_paciente_config VALUES('${c1}',true,'{}'),('${c2}',true,'{}');
  `);
  await db.exec(
    readFileSync("drizzle/migrations/0035_portal_anexos_clinicos_pedidos_exame.sql", "utf8"),
  );
}, 30000);
afterAll(() => db.close());

test("upload interno service_role sem auth.uid e caminho legado não é bloqueado, inclusive auditoria", async () => {
  await db.exec("SET ROLE service_role; SELECT set_config('test.uid','',false)");
  const r = await db.query<{ finalidade_portal: string; liberado_paciente_em: string | null }>(
    `INSERT INTO paciente_arquivos(clinica_id,paciente_id,tipo,caminho) VALUES('${c1}','${p1}','anexo','legado/documento.pdf') RETURNING finalidade_portal,liberado_paciente_em`,
  );
  await db.exec("RESET ROLE");
  expect(r.rows[0]).toEqual({ finalidade_portal: "interno", liberado_paciente_em: null });
  const a = await db.query<{ evento: string }>("SELECT evento FROM portal_acessos");
  expect(a.rows[0]?.evento).toBe("equipe_registrou");
});
test("classificar arquivo legado como clínico exige caminho isolado", async () => {
  await expect(
    db.exec(
      "UPDATE paciente_arquivos SET finalidade_portal='clinico' WHERE caminho='legado/documento.pdf'",
    ),
  ).rejects.toThrow("Caminho de arquivo inválido");
});
test("upload de paciente de outra clínica é recusado", async () => {
  await expect(
    db.exec(
      `INSERT INTO paciente_arquivos(clinica_id,paciente_id,tipo,caminho) VALUES('${c1}','${p2}','anexo','legado/x')`,
    ),
  ).rejects.toThrow("Vínculo de paciente inválido");
});
test("auto liberação começa desligada para anexo clínico", async () => {
  await db.exec(`SELECT set_config('test.uid','${u}',false)`);
  const r = await db.query<{ liberado_paciente_em: string | null }>(
    `INSERT INTO paciente_arquivos(clinica_id,paciente_id,tipo,caminho,finalidade_portal) VALUES('${c1}','${p1}','anexo','${path}','clinico') RETURNING liberado_paciente_em`,
  );
  expect(r.rows[0]?.liberado_paciente_em).toBeNull();
});
test("liberar e retornar a interno retira a liberação e preserva auditoria", async () => {
  await db.exec(`UPDATE paciente_arquivos SET liberado_paciente_em=now() WHERE caminho='${path}'`);
  const r = await db.query<{ liberado_paciente_por: string }>(
    `SELECT liberado_paciente_por FROM paciente_arquivos WHERE caminho='${path}'`,
  );
  expect(r.rows[0]?.liberado_paciente_por).toBe(u);
  const retirado = await db.query<{ liberado_paciente_em: string | null }>(
    `UPDATE paciente_arquivos SET finalidade_portal='interno' WHERE caminho='${path}' RETURNING liberado_paciente_em`,
  );
  expect(retirado.rows[0]?.liberado_paciente_em).toBeNull();
});
test("pedido emitido mantém itens imutáveis e cancelar retira liberação", async () => {
  const r = await db.query<{ id: string }>(
    `INSERT INTO pedidos_exame(clinica_id,paciente_id,itens,created_by,liberado_paciente_em,liberado_paciente_por) VALUES('${c1}','${p1}','[{"nome":"Exame fictício"}]','${u}',now(),'${u}') RETURNING id`,
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error("Pedido não criado");
  await expect(
    db.exec(`UPDATE pedidos_exame SET itens='[{"nome":"Outro"}]' WHERE id='${id}'`),
  ).rejects.toThrow("Pedido emitido é imutável");
  const cancelado = await db.query<{ status: string; liberado_paciente_em: string | null }>(
    `UPDATE pedidos_exame SET status='cancelado' WHERE id='${id}' RETURNING status,liberado_paciente_em`,
  );
  expect(cancelado.rows[0]).toEqual({ status: "cancelado", liberado_paciente_em: null });
  await expect(
    db.exec(`UPDATE pedidos_exame SET status='emitido' WHERE id='${id}'`),
  ).rejects.toThrow("Pedido cancelado não pode ser reaberto");
});
test("pedido rejeita vínculo de paciente de outra clínica", async () => {
  await expect(
    db.exec(
      `INSERT INTO pedidos_exame(clinica_id,paciente_id,itens,created_by) VALUES('${c1}','${p2}','[{"nome":"Teste"}]','${u}')`,
    ),
  ).rejects.toThrow("Vínculos do pedido inválidos");
});
test("RLS da equipe não permite ler pedidos de outra clínica", async () => {
  await db.exec("GRANT USAGE ON SCHEMA auth TO authenticated; SET ROLE authenticated");
  const r = await db.query("SELECT id FROM pedidos_exame");
  expect(r.rows.length).toBe(1);
  await expect(
    db.exec(
      `INSERT INTO pedidos_exame(clinica_id,paciente_id,itens,created_by) VALUES('${c2}','${p2}','[{"nome":"Teste"}]','${u}')`,
    ),
  ).rejects.toThrow();
  await db.exec("RESET ROLE");
});
test("seis papéis ativos podem liberar; demais e inativos não", () => {
  expect(
    ["admin", "gestor", "medico", "enfermeiro", "recepcao", "supervisor"].map((p) =>
      podeLiberarPapel(p, true),
    ),
  ).toEqual([true, true, true, true, true, true]);
  expect(podeLiberarPapel("financeiro", true)).toBe(false);
  expect(podeLiberarPapel("admin", false)).toBe(false);
});
test("interno e pedido cancelado nunca visíveis mesmo com carimbo", () => {
  expect(visivelAnexo({ finalidade_portal: "interno", liberado_paciente_em: "2026-10-17" })).toBe(
    false,
  );
  expect(visivelPedido({ status: "cancelado", liberado_paciente_em: "2026-10-17" })).toBe(false);
  expect(visivelPedido({ status: "emitido", liberado_paciente_em: "2026-10-17" })).toBe(true);
});
test("novas origens preservam o tipo antigo e identidade do link", () => {
  expect(origemLink("anexo")).toEqual({ tipo: "documento", origem_extensao: "anexo" });
  expect(origemLink("pedido_exame")).toEqual({
    tipo: "documento",
    origem_extensao: "pedido_exame",
  });
  expect(caminhoClinicoValido(path, c1, p1, "anexo")).toBe(true);
  expect(caminhoClinicoValido(path, c2, p1, "anexo")).toBe(false);
});

test("helper SQL autoriza os seis papéis ativos e recusa financeiro/inativo", async () => {
  for (const papel of ["admin", "gestor", "medico", "enfermeiro", "recepcao", "supervisor"]) {
    await db.exec(`UPDATE clinica_memberships SET role='${papel}',ativo=true WHERE user_id='${u}'`);
    const r = await db.query<{ pode: boolean }>(`SELECT portal_pode_liberar('${c1}') AS pode`);
    expect(r.rows[0]?.pode).toBe(true);
  }
  await db.exec(`UPDATE clinica_memberships SET role='financeiro' WHERE user_id='${u}'`);
  expect((await db.query<{ pode: boolean }>(`SELECT portal_pode_liberar('${c1}') AS pode`)).rows[0]?.pode).toBe(false);
  await db.exec(`UPDATE clinica_memberships SET role='admin',ativo=false WHERE user_id='${u}'`);
  expect((await db.query<{ pode: boolean }>(`SELECT portal_pode_liberar('${c1}') AS pode`)).rows[0]?.pode).toBe(false);
  await db.exec(`UPDATE clinica_memberships SET ativo=true WHERE user_id='${u}'`);
});

test("automático por clínica não libera internos ou arquivos de outra unidade", async () => {
  await db.exec(`UPDATE portal_paciente_config SET auto_liberar='{"anexo_clinico":true}' WHERE clinica_id='${c1}'`);
  const clinico = await db.query<{ liberado_paciente_por: string }>(`INSERT INTO paciente_arquivos(clinica_id,paciente_id,tipo,caminho,finalidade_portal) VALUES('${c1}','${p1}','anexo','${c1}/${p1}/anexo/auto.pdf','clinico') RETURNING liberado_paciente_por`);
  expect(clinico.rows[0]?.liberado_paciente_por).toBe(u);
  const interno = await db.query<{ liberado_paciente_em: string | null }>(`INSERT INTO paciente_arquivos(clinica_id,paciente_id,tipo,caminho) VALUES('${c1}','${p1}','anexo','legado/interno-auto.pdf') RETURNING liberado_paciente_em`);
  expect(interno.rows[0]?.liberado_paciente_em).toBeNull();
  await db.exec("SELECT set_config('test.uid','',false)");
  const outra = await db.query<{ liberado_paciente_em: string | null }>(`INSERT INTO paciente_arquivos(clinica_id,paciente_id,tipo,caminho,finalidade_portal) VALUES('${c2}','${p2}','anexo','${c2}/${p2}/anexo/teste.pdf','clinico') RETURNING liberado_paciente_em`);
  expect(outra.rows[0]?.liberado_paciente_em).toBeNull();
});
