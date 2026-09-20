// PostgreSQL descartável em memória, sem conexão ou dados de pacientes.
// node scripts/test-atend-espera-postgres.mjs <pglite/dist/index.js> [--baseline]
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const clinic = randomUUID();
const otherClinic = randomUUID();
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const migration = await readFile(new URL("../supabase/migrations/20260920173000_atend_espera_resposta_real.sql", import.meta.url), "utf8");
const baseline = await readFile(new URL("../supabase/migrations/20260904221502_f6a06a23-10c2-4159-81d6-d2cd0cb13c29.sql", import.meta.url), "utf8");
let passed = 0;
try {
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE TABLE atend_conversas (
      id uuid PRIMARY KEY, clinica_id uuid NOT NULL, is_teste boolean DEFAULT false,
      status text DEFAULT 'bot_attending', owner_type text DEFAULT 'AI',
      handoff_em timestamptz, aguardando_desde timestamptz,
      primeiro_resp_em timestamptz, fila_pendente boolean DEFAULT false,
      visivel boolean DEFAULT true
    );
    CREATE TABLE whatsapp_mensagens (
      id uuid PRIMARY KEY, clinica_id uuid NOT NULL, conversa_id uuid NOT NULL,
      direction text, enviada_por text, status text,
      recebida_em timestamptz, created_at timestamptz NOT NULL
    );
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT ON atend_conversas, whatsapp_mensagens TO authenticated;
    ALTER TABLE atend_conversas ENABLE ROW LEVEL SECURITY;
    ALTER TABLE whatsapp_mensagens ENABLE ROW LEVEL SECURITY;
    CREATE POLICY clinica_conversas ON atend_conversas FOR SELECT TO authenticated
      USING (clinica_id::text = current_setting('test.clinica') AND visivel);
    CREATE POLICY clinica_mensagens ON whatsapp_mensagens FOR SELECT TO authenticated
      USING (clinica_id::text = current_setting('test.clinica'));
  `);
  await db.exec(baseline);
  if (!process.argv.includes("--baseline")) await db.exec(migration);
  const now = Date.now();
  const at = (minutes) => new Date(now + minutes * 60000).toISOString();
  async function conversation(patch = {}) {
    const id = randomUUID();
    const values = { id, clinica_id: clinic, ...patch };
    await query(`INSERT INTO atend_conversas (${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map((_, i) => `$${i + 1}`).join(',')})`, Object.values(values));
    return id;
  }
  const human = (patch = {}) => conversation({ owner_type: 'HUMAN', status: 'waiting', handoff_em: at(-24), aguardando_desde: at(-24), fila_pendente: true, ...patch });
  async function message(id, min, direction = 'in', sender = 'paciente', status = 'received', patch = {}) {
    const values = { id: randomUUID(), clinica_id: clinic, conversa_id: id, direction, enviada_por: sender, status, recebida_em: at(min), created_at: at(min), ...patch };
    await query(`INSERT INTO whatsapp_mensagens (${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map((_, i) => `$${i + 1}`).join(',')})`, Object.values(values));
    return values.id;
  }
  const waits = (c = clinic, test = false) => query("SELECT * FROM atend_espera_por_conversa($1,$2)", [c, test]);
  async function expectWait(id, min, c = clinic, test = false) {
    const result = (await waits(c, test)).find(r => r.conversa_id === id);
    assert.equal(result?.aguardando_desde?.toISOString(), min == null ? undefined : at(min));
  }
  async function test(name, fn) { await fn(); console.log(`PASS ${++passed}: ${name}`); }

  const reproduced = await human({ primeiro_resp_em: at(-1440) });
  await message(reproduced, -24.1);
  await message(reproduced, -23.95, 'out', 'sistema', 'sent');
  await message(reproduced, -23.94, 'out', 'sistema', 'system');
  await message(reproduced, -23.93, 'out', 'sistema', 'system');
  await test('encaminhamento e dois registros internos mantêm os 24 minutos de espera', () => expectWait(reproduced, -24));
  await test('novas entradas do paciente não reiniciam a espera', async () => {
    await message(reproduced, -15); await message(reproduced, -2);
    await expectWait(reproduced, -24);
  });
  await test('Nina tardia e envios humanos pendentes/com falha não respondem à fila humana', async () => {
    await message(reproduced, -1, 'out', 'nina', 'sent');
    for (const status of ['pending', 'failed', 'system', null]) await message(reproduced, -1, 'out', 'humano', status);
    await expectWait(reproduced, -24);
  });
  await test('resposta humana enviada encerra a espera; próxima entrada inicia outra', async () => {
    await message(reproduced, -0.8, 'out', 'humano', 'sent');
    await expectWait(reproduced, null);
    await message(reproduced, -0.5);
    await message(reproduced, -0.1);
    await expectWait(reproduced, -0.5);
  });
  await test('confirmação de entrega/read e atualização de envio encerram a espera', async () => {
    for (const status of ['delivered', 'read']) {
      const id = await human();
      const msg = await message(id, -1, 'out', 'humano', 'pending');
      await expectWait(id, -24);
      await query('UPDATE whatsapp_mensagens SET status=$1 WHERE id=$2', [status, msg]);
      await expectWait(id, null);
    }
  });
  await test('Nina respondendo sob sua responsabilidade encerra a espera normal', async () => {
    const id = await conversation();
    await message(id, -12);
    await message(id, -10, 'out', 'nina', 'failed');
    await expectWait(id, -12);
    await message(id, -9, 'out', 'nina', 'sent');
    await expectWait(id, null);
  });
  await test('marcadores internos não encerram nem criam espera na conversa da Nina', async () => {
    const id = await conversation();
    await message(id, -12, 'in', 'sistema', 'system');
    await expectWait(id, null);
    await message(id, -10);
    await message(id, -9, 'out', 'sistema', 'system');
    await expectWait(id, -10);
  });
  await test('fila global e atribuição online contam mesmo sem entrada após a transferência', async () => {
    for (const patch of [{ owner_type: 'NONE' }, { status: 'active', aguardando_desde: null, fila_pendente: false }]) {
      const id = await human(patch);
      await message(id, -26);
      await message(id, -25, 'out', 'nina', 'sent');
      await message(id, -23, 'out', 'sistema', 'sent');
      await expectWait(id, -24);
    }
  });
  await test('reabertura não herda entradas nem resposta de um atendimento anterior', async () => {
    const id = await human({ primeiro_resp_em: at(-120) });
    await message(id, -180); await message(id, -120, 'out', 'humano', 'read');
    await message(id, -100);
    await expectWait(id, -24);
  });
  await test('retorno à Nina ignora o marco antigo de transferência', async () => {
    const id = await human();
    await message(id, -25);
    await query("UPDATE atend_conversas SET owner_type='AI',status='bot_attending' WHERE id=$1", [id]);
    await message(id, -20, 'out', 'nina', 'sent');
    await expectWait(id, null);
  });
  await test('conversa humana sem handoff usa primeira entrada sem resposta', async () => {
    const id = await human({ handoff_em: null, aguardando_desde: null });
    await message(id, -12); await message(id, -11);
    await expectWait(id, -12);
    await message(id, -10, 'out', 'humano', 'sent');
    await expectWait(id, null);
  });
  await test('sem handoff usa aguardando_desde; created_at cobre recebida_em ausente', async () => {
    const id = await human({ handoff_em: null }); await expectWait(id, -24);
    const ai = await conversation();
    await message(ai, -11, 'in', 'paciente', 'received', { recebida_em: null });
    await expectWait(ai, -11);
  });
  await test('fechadas/finalizadas saem do cálculo', async () => {
    for (const status of ['closed', 'finished']) {
      const id = await human({ status }); await message(id, -10); await expectWait(id, null);
    }
  });
  await test('mantém janela de sete dias e separação entre real e homologação', async () => {
    const old = await human({ handoff_em: at(-8 * 1440), aguardando_desde: at(-8 * 1440) });
    await message(old, -8 * 1440); await expectWait(old, null);
    const simulated = await human({ is_teste: true });
    await message(simulated, -20); await expectWait(simulated, null);
    await expectWait(simulated, -24, clinic, true);
    await expectWait(reproduced, null, clinic, true);
  });
  await test('clínicas isoladas e mensagem com clínica divergente não encerra espera', async () => {
    const id = await human({ clinica_id: otherClinic });
    await expectWait(id, null); await expectWait(id, -24, otherClinic);
    const local = await human();
    await message(local, -1, 'out', 'humano', 'sent', { clinica_id: otherClinic });
    await expectWait(local, -24);
  });
  await test('SECURITY INVOKER respeita RLS e mantém os privilégios existentes', async () => {
    const hidden = await human({ visivel: false });
    await db.exec(`SET ROLE authenticated; SET test.clinica='${clinic}';`);
    try {
      assert.ok((await waits()).length > 0);
      await expectWait(hidden, null);
      assert.deepEqual(await waits(otherClinic), []);
    } finally { await db.exec('RESET ROLE'); }
    const [fn] = await query("SELECT prosecdef,provolatile,proconfig FROM pg_proc WHERE oid='atend_espera_por_conversa(uuid,boolean)'::regprocedure");
    assert.equal(fn.prosecdef, false); assert.equal(fn.provolatile, 's');
    assert.deepEqual(fn.proconfig, ['search_path=public']);
  });
  await test('reaplicar é idempotente e nenhuma mensagem/conversa é alterada', async () => {
    const snapshot = async () => [await query('SELECT * FROM atend_conversas ORDER BY id'), await query('SELECT * FROM whatsapp_mensagens ORDER BY id')];
    const before = await snapshot(); const times = await waits();
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual(await snapshot(), before); assert.deepEqual(await waits(), times);
  });
  console.log(`${passed} cenários PostgreSQL passaram.`);
} finally { await db.close(); }
