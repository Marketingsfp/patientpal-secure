import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// PostgreSQL embarcado em memória: não aceita URL e não acessa Supabase/WhatsApp.
const db = new PGlite();
let poolLegado: unknown[];
const clinic = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const admin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const supervisor = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ana = "33333333-3333-4333-8333-333333333333";
const bruna = "44444444-4444-4444-8444-444444444444";
const carla = "55555555-5555-4555-8555-555555555555";
const reception = "66666666-6666-4666-8666-666666666666";
const lab = "77777777-7777-4777-8777-777777777777";
const tomo = "88888888-8888-4888-8888-888888888888";
const conversation = "99999999-9999-4999-8999-999999999999";
const migration = (file: string) =>
  readFile(new URL(`../../../../supabase/migrations/${file}`, import.meta.url), "utf8");
async function login(user: string | null) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
}
async function enabled(value: boolean) {
  await db.exec(
    `CREATE OR REPLACE FUNCTION public.atend_departamentos_habilitados() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT ${value} $$`,
  );
}
async function transfer(department = lab, expected: string | null = ana) {
  return (
    await db.query<{ destino: string }>(
      "select atend_transferir_departamento($1,$2,$3,$4) as destino",
      [clinic, conversation, department, expected],
    )
  ).rows[0].destino;
}
async function resetConversation() {
  await login(admin);
  await db.query(
    "UPDATE atend_conversas SET atribuida_user_id=$1, departamento_id=$2, status='active', owner_type='HUMAN', ai_enabled=false WHERE id=$3",
    [ana, reception, conversation],
  );
  await db.exec("DELETE FROM atend_transferencias; DELETE FROM atend_conversa_eventos");
}

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE TABLE clinicas(id uuid PRIMARY KEY);
    CREATE TABLE profiles(id uuid PRIMARY KEY,nome text,email text);
    CREATE TABLE clinica_memberships(clinica_id uuid,user_id uuid,role text,ativo boolean DEFAULT true);
    CREATE TABLE perfis_acesso(id uuid PRIMARY KEY,clinica_id uuid,chave text);
    CREATE TABLE perfil_permissoes(perfil_id uuid,modulo text,acesso text);
    CREATE TABLE usuario_permissoes(clinica_id uuid,user_id uuid,modulo text,acesso text);
    CREATE FUNCTION is_member(u uuid,c uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM clinica_memberships WHERE user_id=u AND clinica_id=c AND ativo) $$;
    CREATE FUNCTION can_manage_clinica(u uuid,c uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM clinica_memberships WHERE user_id=u AND clinica_id=c AND ativo AND role IN ('admin','gestor')) $$;
    CREATE FUNCTION atend_tem_perfil_telefonia(u uuid,c uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM clinica_memberships WHERE user_id=u AND clinica_id=c AND ativo AND role='telefonia') $$;
    CREATE FUNCTION atend_usuario_e_admin(u uuid,c uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM clinica_memberships WHERE user_id=u AND clinica_id=c AND ativo AND role='admin') $$;
    CREATE TABLE atend_departamentos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinica_id uuid,nome text,ativo boolean DEFAULT true);
    CREATE TABLE atend_departamento_membros(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinica_id uuid,departamento_id uuid,user_id uuid,role text DEFAULT 'agente',queue_locked boolean DEFAULT false);
    CREATE TABLE atend_agente_presenca(clinica_id uuid,user_id uuid,estado_manual text,status text,PRIMARY KEY(clinica_id,user_id));
    CREATE TABLE atend_conversas(id uuid PRIMARY KEY,clinica_id uuid,atribuida_user_id uuid,departamento_id uuid,status text,owner_type text,ai_enabled boolean,is_teste boolean DEFAULT false,assigned_at timestamptz,atribuicao_origem text,updated_at timestamptz DEFAULT now());
    CREATE TABLE atend_transferencias(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinica_id uuid,conversa_id uuid,de_user_id uuid,para_user_id uuid,de_departamento_id uuid,para_departamento_id uuid,motivo text);
    CREATE TABLE atend_conversa_eventos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinica_id uuid,conversa_id uuid,evento text,user_id uuid,departamento_id uuid,motivo text,detalhes jsonb);
  `);
  const audit = await migration("20260518162238_719ff48f-cbe0-4d98-940d-e96c8194f245.sql");
  await db.exec(audit.slice(0, audit.indexOf("-- Aplicar triggers")));
  await db.query("INSERT INTO clinicas VALUES($1),($2)", [clinic, other]);
  for (const [user, role, nome] of [
    [admin, "admin", "Admin"],
    [supervisor, "supervisor", "Supervisora"],
    [ana, "telefonia", "Ana"],
    [bruna, "telefonia", "Bruna"],
    [carla, "telefonia", "Carla"],
  ]) {
    await db.query("INSERT INTO clinica_memberships VALUES($1,$2,$3,true)", [clinic, user, role]);
    await db.query("INSERT INTO profiles VALUES($1,$2,$3)", [
      user,
      nome,
      `${nome}@exemplo.invalid`,
    ]);
    await db.query("INSERT INTO atend_agente_presenca VALUES($1,$2,'ONLINE','online')", [
      clinic,
      user,
    ]);
  }
  for (const [id, nome] of [
    [reception, "Recepção"],
    [lab, "Laboratório"],
    [tomo, "Tomografia"],
  ])
    await db.query("INSERT INTO atend_departamentos VALUES($1,$2,$3,true)", [id, clinic, nome]);
  await db.query(
    "INSERT INTO atend_departamento_membros(clinica_id,departamento_id,user_id) VALUES($1,$2,$3),($1,$4,$5),($1,$4,$6)",
    [clinic, reception, ana, lab, bruna, carla],
  );
  await db.query(
    "INSERT INTO atend_conversas(id,clinica_id,atribuida_user_id,departamento_id,status,owner_type,ai_enabled) VALUES($1,$2,$3,$4,'active','HUMAN',false)",
    [conversation, clinic, ana, reception],
  );
  const legado = await migration("20260930130000_atend_pausa_para_saida.sql");
  const inicio = legado.indexOf("CREATE OR REPLACE FUNCTION public.atend_pool_canonico");
  await db.exec(legado.slice(inicio, legado.indexOf("$function$;", inicio) + "$function$;".length));
  poolLegado = (await db.query("SELECT * FROM atend_pool_canonico($1,$2)", [clinic, tomo])).rows;
  await db.exec(await migration("20261009190000_oszap_departamentos.sql"));
}, 30000);
afterAll(async () => {
  await db.close();
});

describe("Departamentos — regras executadas no PostgreSQL local", () => {
  test("controle desligado preserva pool legado e bloqueia novas escritas", async () => {
    await login(admin);
    expect(
      (
        await db.query<{ habilitado: boolean }>(
          "SELECT atend_departamentos_habilitados() AS habilitado",
        )
      ).rows[0].habilitado,
    ).toBe(false);
    expect(
      (await db.query("SELECT * FROM atend_pool_canonico($1,$2) WHERE elegivel", [clinic, tomo]))
        .rows,
    ).toHaveLength(3);
    expect(
      (await db.query("SELECT * FROM atend_pool_canonico($1,$2)", [clinic, tomo])).rows,
    ).toEqual(poolLegado);
    await expect(
      db.query("SELECT atend_salvar_departamento($1,'Vacinas')", [clinic]),
    ).rejects.toThrow("Somente");
    await enabled(true);
  });
  test("somente admin/supervisor; telefonia, gestor, anônimo e outra clínica são bloqueados", async () => {
    for (const user of [ana, null]) {
      await login(user);
      await expect(db.query("SELECT atend_listar_departamentos($1)", [clinic])).rejects.toThrow(
        "Somente",
      );
    }
    await login(supervisor);
    const rows = (
      await db.query<{ dados: { atendentes: { userId: string }[] } }>(
        "SELECT atend_listar_departamentos($1) AS dados",
        [clinic],
      )
    ).rows;
    expect(rows[0].dados.atendentes.map((a) => a.userId)).toEqual([ana, bruna, carla]);
    await expect(db.query("SELECT atend_listar_departamentos($1)", [other])).rejects.toThrow(
      "Somente",
    );
    await db
      .query("INSERT INTO clinica_memberships VALUES($1,$2,'gestor',true)", [
        clinic,
        crypto.randomUUID(),
      ])
      .then(async () => {
        const { rows } = await db.query<{ user_id: string }>(
          "select user_id from clinica_memberships where role='gestor'",
        );
        await login(rows[0].user_id);
        await expect(db.query("SELECT atend_listar_departamentos($1)", [clinic])).rejects.toThrow(
          "Somente",
        );
      });
  });
  test("permissão de leitura não permite editar e bloqueio individual prevalece", async () => {
    await login(supervisor);
    await db.query("INSERT INTO usuario_permissoes VALUES($1,$2,'oszap-departamentos','read')", [
      clinic,
      supervisor,
    ]);
    await db.query("SELECT atend_listar_departamentos($1)", [clinic]);
    await expect(
      db.query("SELECT atend_salvar_departamento($1,'Vacinas')", [clinic]),
    ).rejects.toThrow("Somente");
    await db.exec("UPDATE usuario_permissoes SET acesso='none'");
    await expect(db.query("SELECT atend_listar_departamentos($1)", [clinic])).rejects.toThrow(
      "Somente",
    );
    await db.exec("DELETE FROM usuario_permissoes");
  });
  test("criação/renomeação auditadas e nomes duplicados recusados", async () => {
    await login(supervisor);
    const { rows } = await db.query<{ id: string }>(
      "SELECT atend_salvar_departamento($1,'Vacinas',NULL,'127.0.0.1') AS id",
      [clinic],
    );
    await db.query("SELECT atend_salvar_departamento($1,'Vacinação',$2)", [clinic, rows[0].id]);
    await expect(
      db.query("SELECT atend_salvar_departamento($1,'recepcao')", [clinic]),
    ).rejects.toThrow("Já existe");
    const events = await db.query<{ action: string; user_id: string }>(
      "SELECT action,user_id FROM audit_log WHERE record_id=$1 ORDER BY created_at",
      [rows[0].id],
    );
    expect(events.rows.map((e) => e.action)).toEqual(["INSERT", "UPDATE"]);
    expect(events.rows.every((e) => e.user_id === supervisor)).toBe(true);
    const origem = await db.query<{ ip: string }>(
      "SELECT dados_depois->'_auditoria'->>'ip_origem' AS ip FROM audit_log WHERE record_id=$1 AND action='INSERT'",
      [rows[0].id],
    );
    expect(origem.rows[0].ip).toBe("127.0.0.1");
  });
  test("vínculo único, troca auditada, sem alterar vínculo legado ou conversas", async () => {
    await login(admin);
    const previous = (await db.query("SELECT * FROM atend_conversas")).rows;
    await db.query("SELECT atend_vincular_departamento($1,$2,$3)", [clinic, ana, lab]);
    expect(
      (
        await db.query(
          "SELECT * FROM atend_departamento_atendentes WHERE clinica_id=$1 AND user_id=$2",
          [clinic, ana],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query<{ departamento_id: string }>(
          "SELECT departamento_id FROM atend_departamento_membros WHERE user_id=$1",
          [ana],
        )
      ).rows[0].departamento_id,
    ).toBe(reception);
    expect((await db.query("SELECT * FROM atend_conversas")).rows).toEqual(previous);
    await expect(
      db.query(
        "INSERT INTO atend_departamento_atendentes(clinica_id,user_id,departamento_id) VALUES($1,$2,$3)",
        [clinic, ana, tomo],
      ),
    ).rejects.toThrow("duplicate");
    await db.query("SELECT atend_vincular_departamento($1,$2,$3)", [clinic, ana, reception]);
    await expect(
      db.query("SELECT atend_vincular_departamento($1,$2,$3)", [clinic, admin, lab]),
    ).rejects.toThrow("Telefonia");
    await expect(
      db.query("SELECT atend_vincular_departamento($1,$2,$3)", [other, ana, lab]),
    ).rejects.toThrow("Somente");
  });
  test("sorteio recebe apenas Bruna/Carla do laboratório, sem viés por carga", async () => {
    await db.query(
      "INSERT INTO atend_conversas(id,clinica_id,atribuida_user_id,status,owner_type,ai_enabled) SELECT gen_random_uuid(),$1,$2,'active','HUMAN',false FROM generate_series(1,8)",
      [clinic, bruna],
    );
    const received = new Set<string>();
    for (let i = 0; i < 40; i++) {
      await resetConversation();
      await login(ana);
      received.add(await transfer());
      const { rows } = await db.query<{ para_user_id: string }>(
        "SELECT para_user_id FROM atend_transferencias",
      );
      expect(rows).toHaveLength(1);
      expect([bruna, carla]).toContain(rows[0].para_user_id);
    }
    expect([...received].sort()).toEqual([bruna, carla].sort());
    await db.query("DELETE FROM atend_conversas WHERE id <> $1", [conversation]);
  });
  test("offline/pausa/pausa saída bloqueiam: conserva a conversa inteira e não registra falsa transferência", async () => {
    for (const state of ["OFFLINE", "PAUSA", "PAUSA_SAIDA"]) {
      await resetConversation();
      await db.query("UPDATE atend_agente_presenca SET estado_manual=$1 WHERE user_id IN ($2,$3)", [
        state,
        bruna,
        carla,
      ]);
      const before = (await db.query("SELECT * FROM atend_conversas WHERE id=$1", [conversation]))
        .rows;
      await login(ana);
      await expect(transfer()).rejects.toThrow("permanece");
      expect(
        (await db.query("SELECT * FROM atend_conversas WHERE id=$1", [conversation])).rows,
      ).toEqual(before);
      expect((await db.query("SELECT * FROM atend_transferencias")).rows).toHaveLength(0);
      expect((await db.query("SELECT * FROM atend_conversa_eventos")).rows).toHaveLength(0);
      expect(
        (await db.query("SELECT * FROM atend_pool_canonico($1,$2) WHERE elegivel", [clinic, lab]))
          .rows,
      ).toHaveLength(0);
    }
    await db.exec("UPDATE atend_agente_presenca SET estado_manual='ONLINE'");
  });
  test("única online é escolhida e perda do perfil impede novo recebimento", async () => {
    await resetConversation();
    await db.query("UPDATE atend_agente_presenca SET estado_manual='PAUSA' WHERE user_id=$1", [
      carla,
    ]);
    await login(ana);
    expect(await transfer()).toBe(bruna);
    await resetConversation();
    await db.query("UPDATE clinica_memberships SET role='recepcao' WHERE user_id=$1", [bruna]);
    await login(ana);
    await expect(transfer()).rejects.toThrow("permanece");
    await db.query("UPDATE clinica_memberships SET role='telefonia' WHERE user_id=$1", [bruna]);
    await db.exec("UPDATE atend_agente_presenca SET estado_manual='ONLINE'");
  });
  test("conversa alterada, fechada, teste ou alheia não pode ser transferida", async () => {
    await resetConversation();
    await login(admin);
    await expect(transfer(lab, bruna)).rejects.toThrow("responsável mudou");
    await login(carla);
    await expect(transfer()).rejects.toThrow("Você não pode");
    await login(ana);
    for (const [column, value] of [
      ["status", "'closed'"],
      ["is_teste", "true"],
    ]) {
      await db.exec(`UPDATE atend_conversas SET ${column}=${value}`);
      await expect(transfer()).rejects.toThrow("não está disponível");
      await db.exec("UPDATE atend_conversas SET status='active',is_teste=false");
    }
  });
  test("departamento vazio/inativo ou de outra clínica bloqueia e falha no histórico desfaz toda a transferência", async () => {
    await resetConversation();
    await login(ana);
    await expect(transfer(tomo)).rejects.toThrow("permanece");
    await db.query("UPDATE atend_departamentos SET ativo=false WHERE id=$1", [lab]);
    await expect(transfer()).rejects.toThrow("inativo");
    await db.query("UPDATE atend_departamentos SET ativo=true WHERE id=$1", [lab]);
    const { rows } = await db.query<{ id: string }>(
      "SELECT id FROM atend_departamentos WHERE clinica_id=$1 LIMIT 1",
      [other],
    );
    await expect(transfer(rows[0].id)).rejects.toThrow("nesta clínica");
    const before = (await db.query("SELECT * FROM atend_conversas WHERE id=$1", [conversation]))
      .rows;
    await db.exec(`CREATE FUNCTION teste_falhar_evento() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha simulada de auditoria'; END $$;
      CREATE TRIGGER teste_evento BEFORE INSERT ON atend_conversa_eventos FOR EACH ROW EXECUTE FUNCTION teste_falhar_evento()`);
    try {
      await expect(transfer()).rejects.toThrow("Falha simulada");
      expect(
        (await db.query("SELECT * FROM atend_conversas WHERE id=$1", [conversation])).rows,
      ).toEqual(before);
      expect((await db.query("SELECT * FROM atend_transferencias")).rows).toHaveLength(0);
    } finally {
      await db.exec(
        "DROP TRIGGER teste_evento ON atend_conversa_eventos; DROP FUNCTION teste_falhar_evento()",
      );
    }
  });
  test("RLS e privilégios impedem telefonia de ler vínculos ou escrevê-los diretamente", async () => {
    await login(ana);
    await db.exec(
      "GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated; SET ROLE authenticated",
    );
    try {
      expect((await db.query("SELECT * FROM atend_departamento_atendentes")).rows).toHaveLength(0);
      await expect(db.query("DELETE FROM atend_departamento_atendentes")).rejects.toThrow(
        "permission denied",
      );
      await expect(
        db.query("SELECT atend_vincular_departamento($1,$2,$3)", [clinic, ana, lab]),
      ).rejects.toThrow("Somente");
    } finally {
      await db.exec("RESET ROLE");
    }
  });
});
