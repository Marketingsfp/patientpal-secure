// PostgreSQL descartável. net.http_post registra a fila localmente, sem rede nem IA.
// bun scripts/test-nina-whatsapp-assincrono.mjs node_modules/@electric-sql/pglite/dist/index.js
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const um = async (sql, args = []) => (await q(sql, args))[0];
const cid = randomUUID(),
  outra = randomUUID();
let verificacoes = 0;
const check = (v, m) => {
  assert.ok(v, m);
  verificacoes++;
};
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA cron; CREATE SCHEMA net;
    CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY,jobname text UNIQUE,schedule text,command text,active boolean DEFAULT true);
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$
      INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) ON CONFLICT(jobname) DO UPDATE SET schedule=$2,command=$3 RETURNING jobid $$;
    CREATE TABLE net.requests(id bigint GENERATED ALWAYS AS IDENTITY,url text,headers jsonb,body jsonb,timeout_ms integer);
    CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 2000)
      RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.requests(url,headers,body,timeout_ms) VALUES($1,$4,$2,$5) RETURNING id $$;
    CREATE TABLE nina_watchdog_config(id boolean PRIMARY KEY,job_url text);
    INSERT INTO nina_watchdog_config VALUES(true,'https://example.invalid/api/public/nina/watchdog');
    CREATE TABLE sistema_job_tokens(nome text PRIMARY KEY,token text);
    CREATE TABLE clinicas(id uuid PRIMARY KEY);
    CREATE TABLE whatsapp_mensagens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinica_id uuid,direction text,body text);
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
  `);
  await q("INSERT INTO clinicas VALUES($1),($2)", [cid, outra]);
  const msg = async (clinica = cid, direction = "in") =>
    (
      await um(
        "INSERT INTO whatsapp_mensagens(clinica_id,direction,body) VALUES($1,$2,'Paciente Teste: bom dia') RETURNING id",
        [clinica, direction],
      )
    ).id;
  const migration = await readFile(
    new URL("../supabase/migrations/20261017120000_nina_whatsapp_assincrono.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration);
  check(
    (await um("SELECT count(*)::int n FROM cron.job WHERE jobname='nina-whatsapp-varredura'")).n ===
      1,
    "migration reexecutável sem duplicar a varredura",
  );
  check(
    (await um("SELECT schedule FROM cron.job WHERE jobname='nina-whatsapp-varredura'")).schedule ===
      "* * * * *",
    "varredura a cada minuto (rede de segurança)",
  );
  check(
    (await um("SELECT job_url FROM nina_whatsapp_assincrono_config")).job_url ===
      "https://example.invalid/api/public/nina/processar",
    "URL derivada da configuração do vigia",
  );
  check(!(await um("SELECT nina_whatsapp_assincrono_disponivel() ok")).ok, "nasce desligada");
  const m1 = await msg();
  check(
    (await um("SELECT nina_whatsapp_despachar($1,$2) id", [cid, m1])).id === null,
    "desligada: webhook responde como antes",
  );
  check((await um("SELECT count(*)::int n FROM net.requests")).n === 0, "desligada não chama nada");

  await db.exec("UPDATE nina_whatsapp_assincrono_config SET ativo=true");
  check((await um("SELECT nina_whatsapp_assincrono_disponivel() ok")).ok, "prontidão");
  const t1 = (await um("SELECT nina_whatsapp_despachar($1,$2,false,'123456') id", [cid, m1])).id;
  check(t1, "despacho cria a tarefa");
  const req = await um("SELECT * FROM net.requests ORDER BY id DESC LIMIT 1");
  check(
    JSON.stringify(Object.keys(req.body).sort()) === '["tarefa","token"]',
    "a chamada leva só tarefa e token",
  );
  check(!JSON.stringify(req.body).includes("Paciente"), "nenhum texto do paciente na chamada");
  check(req.headers["x-job-token"]?.length >= 64, "token interno no cabeçalho");
  check(req.timeout_ms === 300000, "chamada aberta por até 5 min");
  let t = await um("SELECT * FROM nina_whatsapp_tarefas WHERE id=$1", [t1]);
  check(t.estado === "enviada" && t.tentativas === 1, "tarefa enviada");
  const k1 = t.token;
  check(t.phone_number_id === "123456", "número da clínica guardado");

  check(
    (await um("SELECT nina_whatsapp_despachar($1,$2) id", [cid, m1])).id === t1,
    "reentrega da Meta devolve a mesma tarefa",
  );
  check(
    (await um("SELECT count(*)::int n FROM net.requests")).n === 1,
    "reentrega não aciona de novo",
  );
  check(
    (await um("SELECT nina_whatsapp_despachar($1,$2) id", [outra, m1])).id === null,
    "mensagem de outra clínica é recusada",
  );
  const saida = await msg(cid, "out");
  check(
    (await um("SELECT nina_whatsapp_despachar($1,$2) id", [cid, saida])).id === null,
    "só mensagem recebida",
  );
  const m2 = await msg();
  await um("SELECT nina_whatsapp_despachar($1,$2,false,'abc') id", [cid, m2]);
  check(
    (await um("SELECT phone_number_id FROM nina_whatsapp_tarefas WHERE mensagem_id=$1", [m2]))
      .phone_number_id === null,
    "número fora do formato é descartado",
  );

  // Assumir: token errado não serve; o certo assume uma vez só.
  check(
    (await q("SELECT * FROM nina_whatsapp_assumir($1,$2)", [t1, randomUUID()])).length === 0,
    "token errado",
  );
  const assumida = await q("SELECT * FROM nina_whatsapp_assumir($1,$2)", [t1, t.token]);
  check(assumida.length === 1 && assumida[0].mensagem_id === m1, "assume e devolve a mensagem");
  check(assumida[0].modo === "responder" && assumida[0].clinica_id === cid, "modo e clínica");
  check(
    (await q("SELECT * FROM nina_whatsapp_assumir($1,$2)", [t1, t.token])).length === 0,
    "não assume duas vezes",
  );
  check((await um("SELECT nina_whatsapp_renovar($1,$2) ok", [t1, t.token])).ok, "renova a reserva");
  check(
    (await um("SELECT nina_whatsapp_finalizar($1,$2,'concluida') ok", [t1, t.token])).ok,
    "conclui",
  );
  t = await um("SELECT * FROM nina_whatsapp_tarefas WHERE id=$1", [t1]);
  check(t.estado === "concluida" && t.token === null && t.concluido_em, "concluída");
  check(
    !(await um("SELECT nina_whatsapp_finalizar($1,$2,'concluida') ok", [t1, k1])).ok,
    "desfecho repetido é ignorado",
  );

  // "Conversa ocupada": aciona de novo na hora; a rota recebe quanto esperar.
  const m3 = await msg();
  const t3 = (await um("SELECT nina_whatsapp_despachar($1,$2) id", [cid, m3])).id;
  const tok = async (id) =>
    (await um("SELECT token FROM nina_whatsapp_tarefas WHERE id=$1", [id])).token;
  let k = await tok(t3);
  const primeira = await q("SELECT * FROM nina_whatsapp_assumir($1,$2)", [t3, k]);
  check(primeira[0].aguardar_ms === 0, "primeira tentativa sem espera");
  await um("SELECT nina_whatsapp_finalizar($1,$2,'repetir',0,'CONVERSA_OCUPADA')", [t3, k]);
  t = await um("SELECT * FROM nina_whatsapp_tarefas WHERE id=$1", [t3]);
  check(t.estado === "enviada" && t.tentativas === 2, "ocupada sem espera: aciona de novo");
  k = t.token;
  await q("SELECT * FROM nina_whatsapp_assumir($1,$2)", [t3, k]);
  const antes = (await um("SELECT count(*)::int n FROM net.requests")).n;
  await um("SELECT nina_whatsapp_finalizar($1,$2,'repetir',20000,'CONVERSA_OCUPADA')", [t3, k]);
  t = await um("SELECT * FROM nina_whatsapp_tarefas WHERE id=$1", [t3]);
  check(t.estado === "enviada" && t.tentativas === 3, "ocupada com espera: aciona na hora mesmo");
  check(
    (await um("SELECT count(*)::int n FROM net.requests")).n === antes + 1,
    "sem depender da varredura",
  );
  const comEspera = await q("SELECT * FROM nina_whatsapp_assumir($1,$2)", [t3, t.token]);
  check(
    comEspera[0].aguardar_ms > 15000 && comEspera[0].aguardar_ms <= 20000,
    "a rota recebe quanto esperar",
  );
  await q("UPDATE nina_whatsapp_tarefas SET estado='enviada' WHERE id=$1", [t3]);
  t = await um("SELECT * FROM nina_whatsapp_tarefas WHERE id=$1", [t3]);
  // Configuração desligada no meio: fica pendente e a varredura retoma depois.
  const m7 = await msg();
  const t7 = (await um("SELECT nina_whatsapp_despachar($1,$2) id", [cid, m7])).id;
  const k7 = await tok(t7);
  await q("SELECT * FROM nina_whatsapp_assumir($1,$2)", [t7, k7]);
  await db.exec("UPDATE nina_whatsapp_assincrono_config SET ativo=false");
  await um("SELECT nina_whatsapp_finalizar($1,$2,'repetir',0)", [t7, k7]);
  check(
    (await um("SELECT estado FROM nina_whatsapp_tarefas WHERE id=$1", [t7])).estado === "pendente",
    "sem configuração: fica pendente",
  );
  await db.exec("UPDATE nina_whatsapp_assincrono_config SET ativo=true");
  check((await um("SELECT nina_whatsapp_varrer() n")).n === 1, "varredura retoma a pendente");
  check(
    (await um("SELECT estado FROM nina_whatsapp_tarefas WHERE id=$1", [t7])).estado === "enviada",
    "pendente acionada pela varredura",
  );

  // Muitas tentativas ocupadas: vira encaminhamento para a equipe.
  await q("UPDATE nina_whatsapp_tarefas SET tentativas=10 WHERE id=$1", [t3]);
  k = t.token;
  await q("SELECT * FROM nina_whatsapp_assumir($1,$2)", [t3, k]);
  await um("SELECT nina_whatsapp_finalizar($1,$2,'repetir',5000)", [t3, k]);
  t = await um("SELECT * FROM nina_whatsapp_tarefas WHERE id=$1", [t3]);
  check(t.modo === "encaminhar" && t.estado === "enviada", "limite de tentativas encaminha");
  k = t.token;
  await q("SELECT * FROM nina_whatsapp_assumir($1,$2)", [t3, k]);
  await um("SELECT nina_whatsapp_finalizar($1,$2,'repetir')", [t3, k]);
  t = await um("SELECT * FROM nina_whatsapp_tarefas WHERE id=$1", [t3]);
  check(t.estado === "falhou", "encaminhamento não fica repetindo");

  // Chamada perdida / servidor caiu: reserva vencida conta como falha.
  const m4 = await msg();
  const t4 = (await um("SELECT nina_whatsapp_despachar($1,$2) id", [cid, m4])).id;
  const vencer = () =>
    q("UPDATE nina_whatsapp_tarefas SET expira_em=now()-interval '1 second' WHERE id=$1", [t4]);
  for (let i = 1; i <= 2; i++) {
    await vencer();
    await um("SELECT nina_whatsapp_varrer()");
  }
  t = await um("SELECT * FROM nina_whatsapp_tarefas WHERE id=$1", [t4]);
  check(
    t.falhas === 2 && t.modo === "responder" && t.estado === "enviada",
    "duas perdas: tenta de novo",
  );
  await vencer();
  await um("SELECT nina_whatsapp_varrer()");
  t = await um("SELECT * FROM nina_whatsapp_tarefas WHERE id=$1", [t4]);
  check(t.falhas === 3 && t.modo === "encaminhar", "três perdas: encaminha para a equipe");
  for (let i = 1; i <= 2; i++) {
    await vencer();
    await um("SELECT nina_whatsapp_varrer()");
  }
  t = await um("SELECT * FROM nina_whatsapp_tarefas WHERE id=$1", [t4]);
  check(t.estado === "falhou" && t.ultimo_erro === "SEM_CONFIRMACAO", "cinco perdas: encerra");
  // Reserva vencida também durante o processamento.
  const m5 = await msg();
  const t5 = (await um("SELECT nina_whatsapp_despachar($1,$2) id", [cid, m5])).id;
  await q("SELECT * FROM nina_whatsapp_assumir($1,$2)", [t5, await tok(t5)]);
  await q("UPDATE nina_whatsapp_tarefas SET expira_em=now()-interval '1 second' WHERE id=$1", [t5]);
  await um("SELECT nina_whatsapp_varrer()");
  t = await um("SELECT * FROM nina_whatsapp_tarefas WHERE id=$1", [t5]);
  check(t.estado === "enviada" && t.falhas === 1, "processamento parado é retomado");

  // Diagnóstico: sem mensagem; perda encerra direto.
  const d1 = (await um("SELECT nina_whatsapp_diagnostico(90) id")).id;
  t = await um("SELECT * FROM nina_whatsapp_tarefas WHERE id=$1", [d1]);
  check(
    t.modo === "diagnostico" && t.mensagem_id === null && t.diagnostico_segundos === 90,
    "diagnóstico",
  );
  const dAss = await q("SELECT * FROM nina_whatsapp_assumir($1,$2)", [d1, t.token]);
  check(dAss[0].diagnostico_segundos === 90, "diagnóstico assumido");
  await um("SELECT nina_whatsapp_finalizar($1,$2,'concluida')", [d1, t.token]);
  check(
    (await um("SELECT estado FROM nina_whatsapp_tarefas WHERE id=$1", [d1])).estado === "concluida",
    "diagnóstico concluído",
  );

  // Retenção de 7 dias.
  await q("UPDATE nina_whatsapp_tarefas SET concluido_em=now()-interval '8 days' WHERE id=$1", [
    t1,
  ]);
  await um("SELECT nina_whatsapp_varrer()");
  check(
    (await um("SELECT count(*)::int n FROM nina_whatsapp_tarefas WHERE id=$1", [t1])).n === 0,
    "histórico antigo é apagado",
  );

  // Desligar a configuração para a varredura e novos despachos.
  await db.exec("UPDATE nina_whatsapp_assincrono_config SET ativo=false");
  const m6 = await msg();
  check(
    (await um("SELECT nina_whatsapp_despachar($1,$2) id", [cid, m6])).id === null,
    "desligada de novo: caminho de sempre",
  );
  check((await um("SELECT nina_whatsapp_varrer() n")).n === 0, "varredura parada");

  // Permissões: nada para anon/authenticated; servidor só nas funções da rota e do webhook.
  for (const f of [
    "nina_whatsapp_despachar(uuid,uuid,boolean,text)",
    "nina_whatsapp_assumir(uuid,uuid)",
    "nina_whatsapp_finalizar(uuid,uuid,text,integer,text)",
    "nina_whatsapp_varrer()",
    "nina_whatsapp_diagnostico(integer)",
    "nina_whatsapp_enviar(uuid)",
  ]) {
    for (const papel of ["anon", "authenticated"])
      check(
        !(await um(`SELECT has_function_privilege('${papel}','public.${f}','EXECUTE') ok`)).ok,
        `${papel} sem ${f}`,
      );
  }
  check(
    (
      await um(
        "SELECT has_function_privilege('service_role','public.nina_whatsapp_despachar(uuid,uuid,boolean,text)','EXECUTE') ok",
      )
    ).ok,
    "servidor despacha",
  );
  check(
    !(
      await um(
        "SELECT has_function_privilege('service_role','public.nina_whatsapp_enviar(uuid)','EXECUTE') ok",
      )
    ).ok,
    "servidor não chama o envio direto",
  );
  for (const papel of ["anon", "authenticated"])
    check(
      !(
        await um(
          `SELECT has_table_privilege('${papel}','public.nina_whatsapp_tarefas','SELECT') ok`,
        )
      ).ok,
      `${papel} não lê tarefas`,
    );
  console.log(`OK ${verificacoes} verificações`);
} finally {
  await db.close();
}
