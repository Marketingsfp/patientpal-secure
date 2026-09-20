// PostgreSQL descartável. net.http_post registra a fila localmente, sem rede nem IA.
// node scripts/test-nina-carga-servidor.mjs <pglite/dist/index.js>
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const q = async (sql,args=[]) => (await db.query(sql,args)).rows;
const uid=randomUUID(), cid=randomUUID(), outro=randomUUID();
let verificacoes=0;
const check=(v,m)=>{assert.ok(v,m);verificacoes++;};
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
    CREATE TABLE clinica_memberships(id uuid DEFAULT gen_random_uuid(),clinica_id uuid,user_id uuid,ativo boolean DEFAULT true);
    CREATE TABLE nina_teste_carga(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinica_id uuid,criado_por uuid,
      status text DEFAULT 'preparando',cancelar boolean DEFAULT false,config jsonb,plano jsonb DEFAULT '[]',updated_at timestamptz DEFAULT now(),finalizado_em timestamptz);
    CREATE TABLE nina_teste_carga_amostras(id uuid DEFAULT gen_random_uuid(),carga_id uuid,indice integer);
    ALTER TABLE nina_teste_carga ENABLE ROW LEVEL SECURITY;
    ALTER TABLE nina_teste_carga_amostras ENABLE ROW LEVEL SECURITY;
    CREATE POLICY legado ON nina_teste_carga FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY legado ON nina_teste_carga_amostras FOR ALL TO authenticated USING(true) WITH CHECK(true);
    GRANT ALL ON nina_teste_carga,nina_teste_carga_amostras TO authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
  `);
  await q('INSERT INTO clinica_memberships(clinica_id,user_id) VALUES($1,$2)',[cid,uid]);
  const migration=await readFile(new URL('../supabase/migrations/20260919210000_nina_carga_servidor.sql',import.meta.url),'utf8');
  await db.exec(migration); await db.exec(migration);
  check((await q('SELECT count(*)::int n FROM cron.job'))[0].n===1,'migration reexecutável sem duplicar cron');
  check(!(await q('SELECT nina_carga_servidor_disponivel() ok'))[0].ok,'migração permanece inativa antes da publicação');
  await db.exec('UPDATE nina_carga_servidor_config SET ativo=true');
  check((await q('SELECT nina_carga_servidor_disponivel() ok'))[0].ok,'prontidão do servidor');
  const criar=async(n=2,estado='preparando',executor='carga-v5-servidor',clinica=cid)=>{
    const [r]=await q('INSERT INTO nina_teste_carga(clinica_id,criado_por,status,config) VALUES($1,$2,$3,$4) RETURNING id',
      [clinica,uid,estado,JSON.stringify({executor,conversasSimultaneas:n,leadsAtivos:n})]);return r.id;
  };
  const fila=async(id)=>(await q('SELECT * FROM nina_carga_servidor_tarefas WHERE carga_id=$1 ORDER BY slot',[id]));
  const assumir=async(j)=>(await q('SELECT nina_carga_servidor_assumir($1,$2,$3) cid',[j.carga_id,j.slot,j.token]))[0].cid;
  const finalizar=async(j,delay=0,falhou=false)=>(await q('SELECT nina_carga_servidor_finalizar($1,$2,$3,$4,$5) ok',[j.carga_id,j.slot,j.token,delay,falhou]))[0].ok;
  const encerrar=async(id)=>q("UPDATE nina_teste_carga SET status='concluido' WHERE id=$1",[id]);
  const id=await criar(); let [j]=await fila(id);
  check((await fila(id)).length===1,'preparação usa uma única tarefa');
  check(await assumir(j)===cid,'job usa a clínica persistida');
  check(await assumir(j)===null,'mesmo callback não pode ser assumido duas vezes');
  check(await finalizar(j),'continuação transacional da preparação');
  const [seguinte]=await fila(id); check(seguinte.token!==j.token,'próxima etapa já enfileirada sem navegador');
  check(!await finalizar(j),'resposta antiga não libera a tarefa nova');
  await assumir(seguinte);
  await q("UPDATE nina_teste_carga SET status='executando' WHERE id=$1",[id]);
  check((await fila(id)).length===2,'fim da preparação abre vagas paralelas');
  await encerrar(id); await finalizar(seguinte);
  for(const n of [2,5,10]) {
    const c=await criar(n,'executando'); const jobs=await fila(c);
    check(jobs.length===n && jobs.every(j=>j.token),'primeira onda paralela: '+n);
    await q('SELECT nina_carga_servidor_despachar($1)',[c]);
    check((await fila(c)).every(j=>j.tentativas===1),'cron concorrente não duplica callbacks');
    for(const item of jobs) await assumir(item);
    await finalizar(jobs[0]);
    check((await fila(c))[0].token!==jobs[0].token,'lead livre avança sem esperar os lentos');
    check((await fila(c))[1].token===jobs[1].token,'lead lento conserva reserva');
    await encerrar(c);
  }
  const parada=await criar(2,'executando'); const jobsParada=await fila(parada);
  await assumir(jobsParada[0]);
  await q("UPDATE nina_teste_carga SET status='parado',cancelar=true WHERE id=$1",[parada]);
  check(await assumir(jobsParada[1])===null,'cancelamento impede callback já enfileirado');
  await finalizar(jobsParada[0]);
  check((await fila(parada))[0].token===null,'cancelamento não encadeia novo envio');
  const cad=await criar(1,'executando'); const [cadJob]=await fila(cad); await assumir(cadJob); await finalizar(cadJob,60000);
  check((await fila(cad))[0].token===null,'espera é persistida');
  await q("UPDATE nina_carga_servidor_tarefas SET disponivel_em=now()-interval '1 second' WHERE carga_id=$1",[cad]);
  await q('SELECT nina_carga_servidor_despachar($1)',[cad]);
  check(!!(await fila(cad))[0].token,'cron retoma após espera sem navegador'); await encerrar(cad);
  const queda=await criar(1,'executando'); const [velho]=await fila(queda);
  await q("UPDATE nina_carga_servidor_tarefas SET expira_em=now()-interval '1 second' WHERE carga_id=$1",[queda]);
  await q('SELECT nina_carga_servidor_despachar($1)',[queda]);
  check(await assumir(velho)===null,'callback atrasado é rejeitado após troca de token');
  for(let i=0;i<2;i++) { await q("UPDATE nina_carga_servidor_tarefas SET expira_em=now()-interval '1 second' WHERE carga_id=$1",[queda]); await q('SELECT nina_carga_servidor_despachar($1)',[queda]); }
  check((await q('SELECT status FROM nina_teste_carga WHERE id=$1',[queda]))[0].status==='erro','não há repetição infinita de falhas');
  const semAcesso=await criar(1,'executando',undefined,outro);
  check((await fila(semAcesso)).length===0,'criador sem vínculo não dispara');
  const revogado=await criar(1,'executando'); const [antes]=await fila(revogado);
  await q('UPDATE clinica_memberships SET ativo=false WHERE clinica_id=$1',[cid]);
  check(await assumir(antes)===null,'revogação de vínculo impede execução');
  await q('UPDATE clinica_memberships SET ativo=true WHERE clinica_id=$1',[cid]);
  await encerrar(revogado);
  const legado=await criar(1,'executando','carga-v4-paralela');
  check((await fila(legado)).length===0,'histórico legado não é convertido');
  await db.exec('SET ROLE authenticated');
  check((await q('SELECT id FROM nina_teste_carga')).length>0,'membros continuam lendo relatórios');
  await assert.rejects(()=>q('SELECT * FROM nina_carga_servidor_tarefas')); verificacoes++;
  await assert.rejects(()=>q('SELECT nina_carga_servidor_despachar()')); verificacoes++;
  await assert.rejects(()=>criar()); verificacoes++;
  check((await q("UPDATE nina_teste_carga SET config='{}' WHERE id=$1 RETURNING id",[id])).length===0,'cliente não altera execução autônoma');
  await assert.rejects(()=>q('INSERT INTO nina_teste_carga_amostras(carga_id,indice) VALUES($1,99)',[id])); verificacoes++;
  await assert.rejects(()=>q("UPDATE nina_teste_carga SET config='{\"executor\":\"carga-v5-servidor\"}' WHERE id=$1",[legado])); verificacoes++;
  await db.exec('RESET ROLE');
  console.log(`${verificacoes} verificações SQL aprovadas: fila, paralelismo, preparação, retomada, cancelamento e permissões.`);
} finally { await db.close(); }
