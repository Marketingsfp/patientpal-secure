/**
 * Prevenção do Erro Crítico 01 — 4) watchdog sem aviso ao paciente.
 * PostgreSQL temporário em memória (PGlite) com as migrations reais: a sequência aplicada em produção
 * mais a 20260925180000, que troca a desistência silenciosa pelo encaminhamento padrão.
 * Nunca aponta para Supabase/produção.
 *
 * Estado reproduzido = o que o processo encerrado deixou em 24/09 22:58: lote em `generating`, sem
 * snapshot, trava não liberada, reserva vencida e heartbeat parado.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Mesma sequência registrada em supabase_migrations.schema_migrations da produção (conferida em 25/09):
// a 20260915184718 é a versão aplicada do watchdog (a 20260915170000, de conteúdo igual, não foi aplicada).
const MIGRATIONS = [
  "20260906202836_89716e54-33fc-4c84-8bc9-fb75627368cf.sql",
  "20260909211431_50fc301a-c11a-42ae-9600-6573162e1e59.sql",
  "20260909212614_8f29c356-d80d-4d4b-9176-1de9e0d2c5a9.sql",
  "20260909214029_9d465871-e4f1-43ed-a08f-b8b65e121f8e.sql",
  "20260914024011_nina_agrupamento_persistente_sem_fallback.sql",
  "20260915184718_1f5ec52b-ecdd-4575-9904-079a40177dd7.sql",
  "20260925180000_nina_watchdog_encaminhar_desistencia.sql",
];
const clinica = "11111111-1111-4111-8111-111111111111";
let db: PGlite;
const q = async <T = Record<string, any>>(sql: string, p: unknown[] = []) =>
  (await db.query<T>(sql, p)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
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
  for (const nome of MIGRATIONS)
    await db.exec(
      await readFile(new URL(`../../../../supabase/migrations/${nome}`, import.meta.url), "utf8"),
    );
  await db.exec("UPDATE nina_watchdog_config SET homologacao_ativa=true");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** Mensagem do paciente recebida, lote reivindicado e processamento iniciado (como às 22:57:56). */
async function turnoIniciado() {
  const conversa = crypto.randomUUID();
  const telefone = "5500" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 10);
  await q("INSERT INTO atend_conversas(id,clinica_id) VALUES($1,$2)", [conversa, clinica]);
  const [msg] = await q(
    `INSERT INTO whatsapp_mensagens(clinica_id,conversa_id,wa_message_id,direction,from_number,body,canal,is_teste)
     VALUES($1,$2,$3,'in',$4,'isso, com a dra iarmila na quinta','test-console',true) RETURNING id`,
    [clinica, conversa, crypto.randomUUID(), telefone],
  );
  await q("SELECT nina_revisao_registrar_entrada($1,$2,$3)", [clinica, telefone, msg!.id]);
  const [b] = await q("SELECT * FROM nina_batch_registrar($1,$2,$3,$4)", [
    clinica,
    telefone,
    conversa,
    msg!.id,
  ]);
  const chave = `${clinica}:${telefone}`;
  const [{ token }] = await q<{ token: string }>(
    "SELECT nina_lock_adquirir($1,$2,$3,$4,90) token",
    [chave, clinica, conversa, b!.batch_id],
  );
  await q("SELECT nina_batch_reivindicar($1,$2,true)", [b!.batch_id, b!.revision]);
  await q("SELECT nina_batch_iniciar_processamento($1,$2,$3)", [b!.batch_id, chave, token]);
  return { lote: b!.batch_id as string, msg: msg!.id as string, conversa, chave, token };
}

type Turno = Awaited<ReturnType<typeof turnoIniciado>>;

/** O processo morre dentro da ferramenta: a trava fica aberta e a reserva/heartbeat vencem. */
async function processoMorreuNaFerramenta(t: Turno) {
  await q("SELECT nina_watchdog_checkpoint($1,$2,'generating',NULL)", [t.lote, t.token]);
  await q(
    "SELECT nina_watchdog_evento($1,'TOOL_STARTED','{\"ferramenta\":\"proxima_vaga\"}'::jsonb)",
    [t.lote],
  );
  await processoMorreu(t);
}

/** Quem estava com a conversa morreu: trava vencida, heartbeat parado e lote vencido para a varredura. */
async function processoMorreu(t: Turno) {
  await q(
    "UPDATE nina_conversa_locks SET expira_em=now()-interval '100 seconds',updated_at=now()-interval '150 seconds' WHERE chave=$1",
    [t.chave],
  );
  await q(
    "UPDATE nina_message_batches SET last_message_at=now()-interval '10 minutes',next_retry_at=now()-interval '1 second' WHERE id=$1",
    [t.lote],
  );
}

const eventos = async (lote: string) =>
  (
    await q<{ node_id: string }>(
      "SELECT node_id FROM nina_trace_eventos WHERE trace_id=$1 ORDER BY created_at",
      [lote],
    )
  ).map((e) => e.node_id);

describe("Erro Crítico 01 — 4) watchdog sem aviso ao paciente", () => {
  test("pré-condição: a varredura enxerga o processo morto e libera a trava (já funciona)", async () => {
    const t = await turnoIniciado();
    await processoMorreuNaFerramenta(t);
    await q("SELECT * FROM nina_watchdog_reivindicar(10)");
    // A trava do processo morto é liberada; a conversa só fica com a trava nova do encaminhamento.
    const [trava] = await q("SELECT token FROM nina_conversa_locks WHERE chave=$1", [t.chave]);
    expect(trava!.token).not.toBe(t.token);
    expect(await eventos(t.lote)).toEqual(
      expect.arrayContaining(["WATCHDOG_RELEASED_LOCK", "WATCHDOG_DETECTED_STALE_JOB"]),
    );
  });

  test("geração interrompida sem snapshot volta ao servidor só para o encaminhamento padrão", async () => {
    const t = await turnoIniciado();
    await processoMorreuNaFerramenta(t);
    const devolvidos = await q<{ id: string; erro_tecnico: string }>(
      "SELECT * FROM nina_watchdog_reivindicar(10)",
    );
    const [lote] = await q(
      "SELECT watchdog_state,erro_tecnico,attempt_count FROM nina_message_batches WHERE id=$1",
      [t.lote],
    );
    // Antes da correção: não era devolvido e ficava `failed` (GENERATION_OUTCOME_UNKNOWN), sem
    // nenhuma saída nem fila humana — exatamente o paciente sem resposta de 24/09.
    expect(devolvidos.find((b) => b.id === t.lote)?.erro_tecnico).toBe(
      "HANDOFF_REQUIRED: GENERATION_OUTCOME_UNKNOWN",
    );
    // Encaminhar não é nova tentativa de geração: o contador não sobe.
    expect(lote).toMatchObject({ watchdog_state: "processing", attempt_count: 1 });
    expect(await eventos(t.lote)).toContain("WATCHDOG_HANDOFF_REQUIRED");
    expect(await eventos(t.lote)).not.toContain("WATCHDOG_GAVE_UP");
  });

  test("entrega incerta também vira encaminhamento (regra da clínica)", async () => {
    const t = await turnoIniciado();
    const payload = {
      texto: "Resposta",
      tipo: "text",
      canal: "test-console",
      from: "test-console",
    };
    await q("SELECT nina_watchdog_entrega_preparar($1,$2,'texto',$3::jsonb)", [
      t.lote,
      t.token,
      JSON.stringify(payload),
    ]);
    await q("SELECT nina_watchdog_entrega_claim($1,$2,'texto')", [t.lote, t.token]);
    await processoMorreu(t);
    const devolvidos = await q<{ id: string; erro_tecnico: string }>(
      "SELECT * FROM nina_watchdog_reivindicar(10)",
    );
    expect(devolvidos.find((b) => b.id === t.lote)?.erro_tecnico).toBe(
      "HANDOFF_REQUIRED: DELIVERY_OUTCOME_UNKNOWN",
    );
  });

  test("tentativas esgotadas também viram encaminhamento, sem uma 4ª geração", async () => {
    const t = await turnoIniciado();
    const devolucoes: Array<string | null | undefined> = [];
    for (let i = 0; i < 3; i++) {
      await processoMorreu(t);
      const r = await q<{ id: string; erro_tecnico: string | null }>(
        "SELECT * FROM nina_watchdog_reivindicar(10)",
      );
      devolucoes.push(r.find((b) => b.id === t.lote)?.erro_tecnico);
    }
    const [lote] = await q("SELECT attempt_count FROM nina_message_batches WHERE id=$1", [t.lote]);
    // Duas retomadas normais (tentativas 2 e 3) e, esgotadas, só o encaminhamento.
    expect(devolucoes).toEqual([null, null, "HANDOFF_REQUIRED: MAX_ATTEMPTS"]);
    expect(lote!.attempt_count).toBe(3);
  });

  test("a mesma interrupção nunca recebe dois socorros (idempotência entre varreduras)", async () => {
    const t = await turnoIniciado();
    await processoMorreuNaFerramenta(t);
    const primeira = await q<{ id: string }>("SELECT * FROM nina_watchdog_reivindicar(10)");
    await q("UPDATE nina_message_batches SET next_retry_at=now()-interval '1 second' WHERE id=$1", [
      t.lote,
    ]);
    // O encaminhamento está em andamento (trava viva): a segunda varredura não mexe.
    const segunda = await q<{ id: string }>("SELECT * FROM nina_watchdog_reivindicar(10)");
    const vezes = [...primeira, ...segunda].filter((b) => b.id === t.lote).length;
    expect(vezes).toBe(1);
  });

  test("encaminhamento interrompido é repetido como encaminhamento, com limite", async () => {
    const t = await turnoIniciado();
    await processoMorreuNaFerramenta(t);
    for (let i = 0; i < 3; i++) {
      const r = await q<{ id: string; erro_tecnico: string }>(
        "SELECT * FROM nina_watchdog_reivindicar(10)",
      );
      // Nunca volta a gerar: toda devolução é para encaminhar.
      expect(r.find((b) => b.id === t.lote)?.erro_tecnico).toBe(
        "HANDOFF_REQUIRED: GENERATION_OUTCOME_UNKNOWN",
      );
      await processoMorreu(t);
    }
    const quarta = await q<{ id: string }>("SELECT * FROM nina_watchdog_reivindicar(10)");
    expect(quarta.some((b) => b.id === t.lote)).toBe(false);
    const [lote] = await q(
      "SELECT watchdog_state,erro_tecnico FROM nina_message_batches WHERE id=$1",
      [t.lote],
    );
    expect(lote).toMatchObject({
      watchdog_state: "failed",
      erro_tecnico: "HANDOFF_NOT_COMPLETED: GENERATION_OUTCOME_UNKNOWN",
    });
  });

  test("no limite, conversa que já chegou à fila humana termina como encaminhada", async () => {
    const t = await turnoIniciado();
    await processoMorreuNaFerramenta(t);
    for (let i = 0; i < 3; i++) {
      await q("SELECT * FROM nina_watchdog_reivindicar(10)");
      await processoMorreu(t);
    }
    await q("UPDATE atend_conversas SET owner_type='NONE',ai_enabled=false WHERE id=$1", [
      t.conversa,
    ]);
    await q("SELECT * FROM nina_watchdog_reivindicar(10)");
    const [lote] = await q("SELECT watchdog_state FROM nina_message_batches WHERE id=$1", [t.lote]);
    expect(lote!.watchdog_state).toBe("handoff");
  });
});
