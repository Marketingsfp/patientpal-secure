/** PostgreSQL real com conexões concorrentes; nunca aponta para Supabase/produção. */
import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { conciliarProcessamentoNina } from "../watchdog";

const url = process.env.NINA_WATCHDOG_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
let db: InstanceType<typeof Bun.SQL>;
const clinica = "11111111-1111-4111-8111-111111111111";
const migration = (nome: string) =>
  readFile(new URL("../../../../supabase/migrations/" + nome, import.meta.url), "utf8");

suite("Watchdog — RPCs reais no PostgreSQL isolado", () => {
  beforeAll(async () => {
    const endereco = new URL(url!);
    if (
      !["127.0.0.1", "localhost"].includes(endereco.hostname) ||
      endereco.pathname !== "/nina_watchdog_test"
    )
      throw new Error("Somente o banco local dedicado nina_watchdog_test pode ser usado.");
    db = new Bun.SQL(url!, { max: 20 });
    const [identidade] = await db.unsafe("select current_database() as nome");
    if (identidade.nome !== "nina_watchdog_test") throw new Error("Banco de teste inválido");
    await db.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
      DO $$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
      END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE FUNCTION public.is_member(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE TABLE whatsapp_mensagens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinica_id uuid NOT NULL,
        conversa_id uuid,wa_message_id text UNIQUE,direction text,from_number text,to_number text,body text,
        transcricao text,tipo text DEFAULT 'text',canal text,status text,enviada_por text,media_mime text,
        is_teste boolean DEFAULT false,tratada_internamente boolean DEFAULT false,execucao_id uuid,
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE atend_conversas(id uuid PRIMARY KEY,clinica_id uuid,owner_type text DEFAULT 'AI',
        atribuida_user_id uuid,status text DEFAULT 'open',is_teste boolean DEFAULT true,
        ai_enabled boolean DEFAULT true,ultima_msg_em timestamptz DEFAULT now(),nina_fluxo_estado jsonb);
      CREATE TABLE sistema_job_tokens(nome text PRIMARY KEY,token text);
      CREATE TABLE nina_teste_carga(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    `);
    for (const nome of [
      "20260906202836_89716e54-33fc-4c84-8bc9-fb75627368cf.sql",
      "20260909211431_50fc301a-c11a-42ae-9600-6573162e1e59.sql",
      "20260909212614_8f29c356-d80d-4d4b-9176-1de9e0d2c5a9.sql",
      "20260909214029_9d465871-e4f1-43ed-a08f-b8b65e121f8e.sql",
      "20260914024011_nina_agrupamento_persistente_sem_fallback.sql",
      "20260915170000_nina_watchdog_processamento.sql",
    ])
      await db.unsafe(await migration(nome));
    await db.unsafe("UPDATE nina_watchdog_config SET homologacao_ativa=true");
  }, 30_000);
  afterAll(async () => {
    await db?.close();
  });

  async function entrada(
    telefone = String(Date.now()) + Math.random().toString().slice(2, 7),
    conversa = crypto.randomUUID(),
    indice = 0,
  ) {
    await db`INSERT INTO atend_conversas(id,clinica_id) VALUES(${conversa},${clinica}) ON CONFLICT DO NOTHING`;
    const [m] =
      await db`INSERT INTO whatsapp_mensagens(clinica_id,conversa_id,wa_message_id,direction,from_number,
      body,canal,is_teste,created_at) VALUES(${clinica},${conversa},${crypto.randomUUID()},'in',${telefone},'Consulta teste',
      'test-console',true,now()+${indice}*interval '1 millisecond') RETURNING *`;
    await db`SELECT nina_revisao_registrar_entrada(${clinica},${telefone},${m.id})`;
    const [b] =
      await db`SELECT * FROM nina_batch_registrar(${clinica},${telefone},${conversa},${m.id})`;
    return {
      id: m.id,
      batchId: b.batch_id,
      revision: b.revision,
      telefone,
      conversa,
      chave: clinica + ":" + telefone,
    };
  }
  type Entrada = Awaited<ReturnType<typeof entrada>>;
  const ordens = new Map<string, string[]>();
  async function assumir(e: Entrada) {
    const [l] =
      await db`SELECT nina_lock_adquirir(${e.chave},${clinica},${e.conversa},${e.batchId},90) AS token`;
    const [claim] = await db`SELECT * FROM nina_batch_reivindicar(${e.batchId},${e.revision},true)`;
    expect(claim.reivindicado).toBe(true);
    ordens.set(
      e.batchId,
      Array.isArray(claim.mensagens)
        ? claim.mensagens
        : String(claim.mensagens).slice(1, -1).split(","),
    );
    const [iniciou] =
      await db`SELECT nina_batch_iniciar_processamento(${e.batchId},${e.chave},${l.token}) AS ok`;
    expect(iniciou.ok).toBe(true);
    return l.token as string;
  }
  const expirar = async (e: Entrada) => {
    await db`UPDATE nina_conversa_locks SET expira_em=now()-interval '100 seconds',updated_at=now()-interval '100 seconds' WHERE chave=${e.chave}`;
    await db`UPDATE nina_message_batches SET last_message_at=now()-interval '10 minutes',next_retry_at=now()-interval '1 second' WHERE id=${e.batchId}`;
  };
  const payload = {
    texto: "Resposta conferida",
    tipo: "text",
    canal: "test-console",
    from: "test-console",
  };
  async function entregar(e: Entrada, token: string) {
    await db`SELECT nina_watchdog_entrega_preparar(${e.batchId},${token},'texto',${payload}::jsonb)`;
    const [claim] =
      await db`SELECT * FROM nina_watchdog_entrega_claim(${e.batchId},${token},'texto')`;
    if (claim.estado === "sending") {
      await db`SELECT nina_watchdog_entrega_resultado(${e.batchId},${token},'texto','confirmed',NULL,NULL,0)`;
    }
    await db`SELECT nina_watchdog_finalizar(${e.batchId},${token},'completed',NULL)`;
  }

  test("10 conversas simultâneas: 10 entradas, 10 terminais e 0 saídas duplicadas", async () => {
    const entradas = await Promise.all(Array.from({ length: 10 }, () => entrada()));
    await Promise.all(entradas.map(async (e) => entregar(e, await assumir(e))));
    const rows =
      await db`SELECT id,nina_status,nina_batch_id FROM whatsapp_mensagens WHERE id IN ${db(entradas.map((e) => e.id))}`;
    expect(
      conciliarProcessamentoNina(
        entradas.map((e) => e.id),
        rows as any,
      ),
    ).toMatchObject({ recebidas: 10, terminais: 10, completed: 10, pendentes: 0, aprovado: true });
    const [d] = await db.unsafe(
      `SELECT count(*)::int AS duplicadas FROM (SELECT batch_id,parte FROM nina_batch_entregas GROUP BY 1,2 HAVING count(*)>1) x`,
    );
    expect(d.duplicadas).toBe(0);
  });
  test("10 entradas simultâneas na mesma conversa: lote único e ordem física preservada", async () => {
    const telefone = "55001000000",
      conversa = crypto.randomUUID();
    const entradas = await Promise.all(
      Array.from({ length: 10 }, (_, i) => entrada(telefone, conversa, i)),
    );
    expect(new Set(entradas.map((e) => e.batchId)).size).toBe(1);
    for (const [i, m] of entradas.entries())
      await db`UPDATE whatsapp_mensagens SET created_at=${new Date(1700000000000 + i).toISOString()} WHERE id=${m.id}`;
    const e = entradas[0]!;
    const token = await assumir(e);
    expect(ordens.get(e.batchId)).toEqual(entradas.map((e) => e.id));
    const ids =
      await db`SELECT i.mensagem_id FROM nina_message_batch_itens i JOIN whatsapp_mensagens m ON m.id=i.mensagem_id WHERE i.batch_id=${e.batchId} ORDER BY m.created_at,i.ordem,i.mensagem_id`;
    expect(new Set(ids.map((i: any) => i.mensagem_id)).size).toBe(10);
    await entregar(e, token);
    const [r] =
      await db`SELECT count(*)::int AS total FROM whatsapp_mensagens WHERE nina_batch_id=${e.batchId} AND nina_status='completed'`;
    const [saidas] =
      await db`SELECT count(*)::int AS total FROM nina_batch_entregas WHERE batch_id=${e.batchId}`;
    expect(r.total).toBe(10);
    expect(saidas.total).toBe(1);
  });
  test("worker morre após lock: recuperação troca token e o proprietário antigo perde autoridade", async () => {
    const e = await entrada();
    const antigo = await assumir(e);
    await expirar(e);
    const r = await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    const b = r.find((x: any) => x.id === e.batchId);
    expect(b).toBeDefined();
    expect(b.watchdog_token).not.toBe(antigo);
    const [fence] =
      await db`SELECT nina_watchdog_checkpoint(${e.batchId},${antigo},'generating',NULL) AS ok`;
    expect(fence.ok).toBe(false);
    await entregar(e, b.watchdog_token);
  });
  test("queued sem worker é assumido pela varredura", async () => {
    const e = await entrada();
    await expirar(e);
    const r = await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    const b = r.find((x: any) => x.id === e.batchId);
    expect(b.attempt_count).toBe(1);
    await entregar(e, b.watchdog_token);
  });
  test("resposta salva e entrega rejeitada: retoma snapshot, sem reiniciar geração", async () => {
    const e = await entrada();
    const token = await assumir(e);
    const snapshot = { texto: payload.texto, auditoria: {} };
    await db`SELECT nina_watchdog_checkpoint(${e.batchId},${token},'generated',${snapshot}::jsonb)`;
    await db`SELECT nina_watchdog_entrega_preparar(${e.batchId},${token},'texto',${payload}::jsonb)`;
    await db`SELECT nina_watchdog_entrega_claim(${e.batchId},${token},'texto')`;
    await db`SELECT nina_watchdog_entrega_resultado(${e.batchId},${token},'texto','retry_pending',NULL,'RATE_LIMIT',1000)`;
    await db`SELECT nina_watchdog_finalizar(${e.batchId},${token},'retry_pending','RATE_LIMIT')`;
    const [atrasada] =
      await db`SELECT nina_watchdog_finalizar(${e.batchId},${token},'failed','LATE_FINALLY') AS ok`;
    expect(atrasada.ok).toBe(false);
    const [pendente] =
      await db`SELECT watchdog_state FROM nina_message_batches WHERE id=${e.batchId}`;
    expect(pendente.watchdog_state).toBe("retry_pending");
    await expirar(e);
    await db`UPDATE nina_batch_entregas SET next_retry_at=now()-interval '1 second' WHERE batch_id=${e.batchId}`;
    const r = await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    const b = r.find((x: any) => x.id === e.batchId);
    expect(b.response_snapshot).toEqual(snapshot);
    await entregar(e, b.watchdog_token);
  });
  test("dois watchdogs concorrentes: somente um claim", async () => {
    const e = await entrada();
    await assumir(e);
    await expirar(e);
    const r = await Promise.all([
      db`SELECT * FROM nina_watchdog_reivindicar(10)`,
      db`SELECT * FROM nina_watchdog_reivindicar(10)`,
    ]);
    const claims = r.flat().filter((b: any) => b.id === e.batchId);
    expect(claims).toHaveLength(1);
    await entregar(e, claims[0].watchdog_token);
  });
  test("completed não é retomado, mesmo encontrado outra vez", async () => {
    const e = await entrada();
    await entregar(e, await assumir(e));
    await expirar(e);
    const r = await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    expect(r.some((b: any) => b.id === e.batchId)).toBe(false);
  });
  test("lease expirado mas heartbeat válido: não remove nem recupera", async () => {
    const e = await entrada();
    const token = await assumir(e);
    await expirar(e);
    await db`UPDATE nina_conversa_locks SET updated_at=now() WHERE chave=${e.chave}`;
    const r = await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    expect(r.some((b: any) => b.id === e.batchId)).toBe(false);
    const [l] = await db`SELECT token,liberado_em FROM nina_conversa_locks WHERE chave=${e.chave}`;
    expect(l.token).toBe(token);
    expect(l.liberado_em).toBeNull();
    await db`SELECT nina_lock_renovar(${e.chave},${token},90)`;
    await entregar(e, token);
  });
  test("3 tentativas abandonadas: failed explícito e fim do retry", async () => {
    const e = await entrada();
    await assumir(e);
    for (let i = 0; i < 3; i++) {
      await expirar(e);
      await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    }
    const [b] =
      await db`SELECT watchdog_state,attempt_count FROM nina_message_batches WHERE id=${e.batchId}`;
    expect(b.watchdog_state).toBe("failed");
    expect(b.attempt_count).toBe(3);
    const [m] = await db`SELECT nina_status FROM whatsapp_mensagens WHERE id=${e.id}`;
    expect(m.nina_status).toBe("failed");
  });
  test("envio incerto após POST: nunca reenvia automaticamente", async () => {
    const e = await entrada();
    const token = await assumir(e);
    await db`SELECT nina_watchdog_entrega_preparar(${e.batchId},${token},'texto',${payload}::jsonb)`;
    await db`SELECT nina_watchdog_entrega_claim(${e.batchId},${token},'texto')`;
    await expirar(e);
    const r = await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    expect(r.some((b: any) => b.id === e.batchId)).toBe(false);
    const [b] =
      await db`SELECT watchdog_state,erro_tecnico FROM nina_message_batches WHERE id=${e.batchId}`;
    expect(b).toMatchObject({ watchdog_state: "failed", erro_tecnico: "DELIVERY_OUTCOME_UNKNOWN" });
  });
  test("produção permanece desativada e RPC não é executável por authenticated", async () => {
    const [m] =
      await db`INSERT INTO whatsapp_mensagens(clinica_id,direction,body,is_teste) VALUES(${clinica},'in','Teste produção',false) RETURNING nina_status`;
    expect(m.nina_status).toBeNull();
    const [p] =
      await db`SELECT has_function_privilege('authenticated','nina_watchdog_reivindicar(integer)','EXECUTE') AS permitido`;
    expect(p.permitido).toBe(false);
  });
  test("lote posterior não ultrapassa predecessor, mesmo com lease já liberado", async () => {
    const e = await entrada();
    const token = await assumir(e);
    const proxima = await entrada(e.telefone, e.conversa);
    await db`SELECT nina_lock_liberar(${e.chave},${token})`;
    const [bloqueio] =
      await db`SELECT nina_lock_adquirir(${proxima.chave},${clinica},${proxima.conversa},${proxima.batchId},90) AS token`;
    expect(bloqueio.token).toBeNull();
    await expirar(e);
    const r = await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    const b = r.find((b: any) => b.id === e.batchId);
    await entregar(e, b.watchdog_token);
    await db`SELECT nina_lock_liberar(${e.chave},${b.watchdog_token})`;
    await entregar(proxima, await assumir(proxima));
  });
  test("ACK persistido antes da morte do worker recupera conclusão, sem nova entrega", async () => {
    const e = await entrada();
    const token = await assumir(e);
    await db`SELECT nina_watchdog_entrega_preparar(${e.batchId},${token},'texto',${payload}::jsonb)`;
    await db`SELECT nina_watchdog_entrega_claim(${e.batchId},${token},'texto')`;
    await db`SELECT nina_watchdog_entrega_resultado(${e.batchId},${token},'texto','confirmed',NULL,NULL,0)`;
    await expirar(e);
    await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    const [b] = await db`SELECT watchdog_state FROM nina_message_batches WHERE id=${e.batchId}`;
    expect(b.watchdog_state).toBe("completed");
    const [envio] =
      await db`SELECT attempt_count FROM nina_batch_entregas WHERE batch_id=${e.batchId}`;
    expect(envio.attempt_count).toBe(1);
  });
  test("integração runtime + SQL: retry de entrega chama modelo uma vez e entrega uma vez", async () => {
    const fixture = fileURLToPath(
      new URL("./fixtures/watchdog-runtime.fixture.ts", import.meta.url),
    );
    const p = Bun.spawn([process.execPath, fixture], {
      env: { ...process.env, NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    if (code) throw Error(stdout + stderr);
    const linha = stdout.split(/\r?\n/).find((l) => l.startsWith("WATCHDOG_RUNTIME="));
    expect(linha).toBeDefined();
    expect(JSON.parse(linha!.slice("WATCHDOG_RUNTIME=".length))).toEqual({
      modelCalls: 1,
      transportAttempts: 2,
      delivered: 1,
      completed: 1,
    });
  }, 15_000);
  test("lock órfão e lock terminal são liberados sem tocar worker com heartbeat recente", async () => {
    const conversa = crypto.randomUUID(),
      batch = crypto.randomUUID(),
      token = crypto.randomUUID(),
      chave = clinica + ":5500998877";
    await db`INSERT INTO atend_conversas(id,clinica_id) VALUES(${conversa},${clinica})`;
    await db`INSERT INTO nina_conversa_locks(chave,clinica_id,conversa_id,token,batch_id,expira_em,updated_at)
      VALUES(${chave},${clinica},${conversa},${token},${batch},now()-interval '10 minutes',now())`;
    await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    let [l] = await db`SELECT liberado_em FROM nina_conversa_locks WHERE chave=${chave}`;
    expect(l.liberado_em).toBeNull();
    await db`UPDATE nina_conversa_locks SET updated_at=now()-interval '10 minutes' WHERE chave=${chave}`;
    await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    [l] = await db`SELECT liberado_em FROM nina_conversa_locks WHERE chave=${chave}`;
    expect(l.liberado_em).not.toBeNull();
    const [eventos] =
      await db`SELECT count(*)::int AS n FROM nina_trace_eventos WHERE trace_id=${batch} AND node_id='WATCHDOG_DETECTED_ORPHAN_LOCK'`;
    expect(eventos.n).toBe(1);
    const e = await entrada();
    await entregar(e, await assumir(e));
    await expirar(e);
    await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    [l] = await db`SELECT liberado_em FROM nina_conversa_locks WHERE chave=${e.chave}`;
    expect(l.liberado_em).not.toBeNull();
  });
  test("cliente não pode forjar o estado terminal da entrada", async () => {
    const e = await entrada();
    await db.unsafe(
      "GRANT USAGE ON SCHEMA public TO authenticated; GRANT SELECT, UPDATE ON whatsapp_mensagens TO authenticated",
    );
    const cliente = new Bun.SQL(url!, { max: 1 });
    let erro: unknown;
    try {
      await cliente.unsafe("SET ROLE authenticated");
      try {
        await cliente`UPDATE whatsapp_mensagens SET nina_status='completed' WHERE id=${e.id}`;
      } catch (e) {
        erro = e;
      }
    } finally {
      await cliente.close();
    }
    expect(String(erro)).toContain("Estado de processamento somente pelo servidor");
    await entregar(e, await assumir(e));
  });
  test("desativar admissões preserva recuperação dos lotes já aceitos", async () => {
    const e = await entrada();
    await expirar(e);
    await db`UPDATE nina_watchdog_config SET homologacao_ativa=false`;
    try {
      const r = await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
      const b = r.find((b: any) => b.id === e.batchId);
      expect(b).toBeDefined();
      await entregar(e, b.watchdog_token);
    } finally {
      await db`UPDATE nina_watchdog_config SET homologacao_ativa=true`;
    }
  });
  test("geração abandonada sem snapshot falha sem repetir ferramentas potencialmente executadas", async () => {
    const e = await entrada(),
      token = await assumir(e);
    await db`SELECT nina_watchdog_checkpoint(${e.batchId},${token},'generating',NULL)`;
    await expirar(e);
    const r = await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    expect(r.some((b: any) => b.id === e.batchId)).toBe(false);
    const [b] =
      await db`SELECT watchdog_state,erro_tecnico,attempt_count FROM nina_message_batches WHERE id=${e.batchId}`;
    expect(b).toMatchObject({
      watchdog_state: "failed",
      erro_tecnico: "GENERATION_OUTCOME_UNKNOWN",
      attempt_count: 1,
    });
  });
  test("entrada sem lote só conclui com saída comprovada na mesma conversa", async () => {
    const conversa = crypto.randomUUID();
    await db`INSERT INTO atend_conversas(id,clinica_id) VALUES(${conversa},${clinica})`;
    const [m] =
      await db`INSERT INTO whatsapp_mensagens(clinica_id,conversa_id,wa_message_id,direction,body,tipo,is_teste,canal)
      VALUES(${clinica},${conversa},${crypto.randomUUID()},'in','Imagem','image',true,'test-console') RETURNING id`;
    const [out] =
      await db`INSERT INTO whatsapp_mensagens(clinica_id,conversa_id,wa_message_id,direction,body,status,enviada_por,is_teste,canal)
      VALUES(${clinica},${conversa},${crypto.randomUUID()},'out','Pode enviar em texto?','pending','nina',true,'test-console') RETURNING id`;
    let [r] = await db`SELECT nina_watchdog_vincular_saida(${m.id},${out.id}) AS ok`;
    expect(r.ok).toBe(false);
    await db`UPDATE whatsapp_mensagens SET status='sent' WHERE id=${out.id}`;
    [r] = await db`SELECT nina_watchdog_vincular_saida(${m.id},${out.id}) AS ok`;
    expect(r.ok).toBe(true);
    [r] = await db`SELECT nina_status FROM whatsapp_mensagens WHERE id=${m.id}`;
    expect(r.nina_status).toBe("completed");
  });
  test("aviso do protocolo é vinculado sem criar outra saída", async () => {
    const e = await entrada(),
      token = await assumir(e);
    const [out] =
      await db`INSERT INTO whatsapp_mensagens(clinica_id,conversa_id,wa_message_id,direction,body,status,enviada_por,is_teste,canal)
      VALUES(${clinica},${e.conversa},${crypto.randomUUID()},'out','Vou chamar um atendente.','sent','nina',true,'test-console') RETURNING id`;
    const snap = {
      texto: "",
      auditoria: {
        resultado: {
          estado: "descartar",
          avisoExistente: { estado: "confirmado", mensagemId: out.id },
        },
      },
    };
    await db`SELECT nina_watchdog_checkpoint(${e.batchId},${token},'generated',${snap}::jsonb)`;
    const [r] =
      await db`SELECT nina_watchdog_vincular_saida(${e.id},${out.id},${e.batchId},${token}) AS ok`;
    expect(r.ok).toBe(true);
    await db`SELECT nina_watchdog_finalizar(${e.batchId},${token},'completed',NULL)`;
    const [b] =
      await db`SELECT count(*)::int AS n FROM whatsapp_mensagens WHERE conversa_id=${e.conversa} AND direction='out'`;
    expect(b.n).toBe(1);
  });
  test("entrada humana sem lote termina handoff, entrada abandonada termina failed", async () => {
    const conversa = crypto.randomUUID();
    await db`INSERT INTO atend_conversas(id,clinica_id,owner_type) VALUES(${conversa},${clinica},'HUMAN')`;
    const [m] =
      await db`INSERT INTO whatsapp_mensagens(clinica_id,conversa_id,wa_message_id,direction,body,is_teste,created_at)
      VALUES(${clinica},${conversa},${crypto.randomUUID()},'in','Olá',true,now()-interval '10 minutes') RETURNING id`;
    const [o] =
      await db`INSERT INTO whatsapp_mensagens(clinica_id,wa_message_id,direction,body,is_teste,created_at)
      VALUES(${clinica},${crypto.randomUUID()},'in','Olá',true,now()-interval '10 minutes') RETURNING id`;
    await db`SELECT * FROM nina_watchdog_reivindicar(10)`;
    const [r] = await db`SELECT nina_status FROM whatsapp_mensagens WHERE id=${m.id}`;
    expect(r.nina_status).toBe("handoff");
    const [a] = await db`SELECT nina_status,nina_error FROM whatsapp_mensagens WHERE id=${o.id}`;
    expect(a).toMatchObject({ nina_status: "failed", nina_error: "ENTRY_NOT_QUEUED" });
  });
  test("áudio resumido isolado não comprova entrega da resposta completa", async () => {
    const e = await entrada(),
      token = await assumir(e);
    const audio = { ...payload, tipo: "audio", integral: false };
    await db`SELECT nina_watchdog_entrega_preparar(${e.batchId},${token},'audio',${audio}::jsonb)`;
    await db`SELECT nina_watchdog_entrega_claim(${e.batchId},${token},'audio')`;
    await db`SELECT nina_watchdog_entrega_resultado(${e.batchId},${token},'audio','confirmed',NULL,NULL,0)`;
    let erro: unknown;
    try {
      await db`SELECT nina_watchdog_finalizar(${e.batchId},${token},'completed',NULL)`;
    } catch (e) {
      erro = e;
    }
    expect(String(erro)).toContain("NINA_ENTREGA_NAO_COMPROVADA");
    await entregar(e, token);
  });
  test("conciliação final: todas as entradas admitidas nesta suíte têm estado terminal", async () => {
    const [r] = await db`SELECT count(*)::int AS recebidas,
      count(*) FILTER(WHERE nina_status IN ('completed','failed','handoff'))::int AS terminais,
      count(*) FILTER(WHERE nina_status IN ('received','queued','processing','retry_pending'))::int AS pendentes
      FROM whatsapp_mensagens WHERE direction='in' AND nina_status IS NOT NULL`;
    expect(r.terminais).toBe(r.recebidas);
    expect(r.pendentes).toBe(0);
    console.info("WATCHDOG_CONCILIACAO=" + JSON.stringify(r));
  });
});
