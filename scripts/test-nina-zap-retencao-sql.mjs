// PostgreSQL descartável em memória, sem conexão ou dados de pacientes.
// node scripts/test-nina-zap-retencao-sql.mjs <pglite/dist/index.js>
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const migration = await readFile(
  new URL("../supabase/migrations/20260924230000_nina_zap_retencao_dados.sql", import.meta.url),
  "utf8",
);
const clinica = randomUUID();
const dias = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
let passed = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  passed++;
};
const existe = async (tabela, coluna, valor) =>
  (await query(`SELECT 1 FROM ${tabela} WHERE ${coluna} = $1`, [valor])).length > 0;

try {
  // Só as colunas e vínculos que a retenção usa, com as mesmas regras de FK da produção.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE clinicas (id uuid PRIMARY KEY);
    CREATE TABLE atend_conversas (id uuid PRIMARY KEY, clinica_id uuid, created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(), ultima_msg_em timestamptz);
    CREATE TABLE atend_conversa_eventos (id uuid PRIMARY KEY,
      conversa_id uuid REFERENCES atend_conversas(id) ON DELETE CASCADE);
    CREATE TABLE nina_execucoes (id uuid PRIMARY KEY, clinica_id uuid, created_at timestamptz DEFAULT now());
    CREATE TABLE nina_execucao_evidencias (execucao_id uuid PRIMARY KEY REFERENCES nina_execucoes(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now());
    CREATE TABLE nina_prompt_snapshots (id uuid PRIMARY KEY,
      execucao_id uuid REFERENCES nina_execucoes(id) ON DELETE CASCADE, created_at timestamptz DEFAULT now());
    CREATE TABLE whatsapp_mensagens (id uuid PRIMARY KEY, clinica_id uuid,
      conversa_id uuid REFERENCES atend_conversas(id) ON DELETE SET NULL,
      execucao_id uuid REFERENCES nina_execucoes(id) ON DELETE SET NULL,
      is_teste boolean, created_at timestamptz DEFAULT now());
    CREATE TABLE nina_trace_eventos (id uuid PRIMARY KEY, created_at timestamptz DEFAULT now());
    CREATE TABLE nina_kb_consultas (id uuid PRIMARY KEY, created_at timestamptz DEFAULT now());
    CREATE TABLE nina_message_batches (id uuid PRIMARY KEY, status text, watchdog_state text,
      processed_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE nina_message_batch_itens (batch_id uuid REFERENCES nina_message_batches(id) ON DELETE CASCADE,
      mensagem_id uuid);
    CREATE TABLE nina_batch_entregas (batch_id uuid REFERENCES nina_message_batches(id), parte text);
    CREATE TABLE nina_conversa_revisoes (chave text PRIMARY KEY, updated_at timestamptz DEFAULT now());
    CREATE TABLE nina_conversa_locks (chave text PRIMARY KEY, liberado_em timestamptz, expira_em timestamptz,
      updated_at timestamptz DEFAULT now());
    CREATE TABLE nina_teste_leads (id uuid PRIMARY KEY, ciclo_id uuid, conversa_id uuid);
    CREATE TABLE nina_teste_ciclos (id uuid PRIMARY KEY, lead_id uuid REFERENCES nina_teste_leads(id) ON DELETE CASCADE,
      conversa_id uuid REFERENCES atend_conversas(id) ON DELETE SET NULL, status text, ended_at timestamptz,
      resolved_at timestamptz, updated_at timestamptz, created_at timestamptz DEFAULT now());
    ALTER TABLE nina_teste_leads ADD FOREIGN KEY (ciclo_id) REFERENCES nina_teste_ciclos(id) ON DELETE SET NULL;
    CREATE TABLE nina_teste_carga (id uuid PRIMARY KEY, status text, finalizado_em timestamptz,
      updated_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE nina_teste_carga_amostras (id uuid PRIMARY KEY,
      carga_id uuid REFERENCES nina_teste_carga(id) ON DELETE CASCADE);
    CREATE TABLE nina_carga_servidor_tarefas (id uuid PRIMARY KEY, carga_id uuid REFERENCES nina_teste_carga(id));
    CREATE TABLE nina_teste_execucoes (id uuid PRIMARY KEY, status text, finalizado_em timestamptz,
      updated_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE nina_teste_avaliacoes (id uuid PRIMARY KEY, updated_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE nina_teste_simulacoes (id uuid PRIMARY KEY, status text, finalizado_em timestamptz,
      updated_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE nina_feedback_erros (id uuid PRIMARY KEY, status text,
      execucao_id uuid REFERENCES nina_execucoes(id) ON DELETE SET NULL, created_at timestamptz DEFAULT now());
    CREATE TABLE nina_feedback_analises (id uuid PRIMARY KEY,
      feedback_id uuid REFERENCES nina_feedback_erros(id) ON DELETE CASCADE);
    CREATE TABLE nina_feedback (id uuid PRIMARY KEY, created_at timestamptz DEFAULT now());
    CREATE TABLE atend_aviso_encaminhamento (id uuid PRIMARY KEY, created_at timestamptz DEFAULT now());
    CREATE TABLE agendamento_confirmacoes (id uuid PRIMARY KEY, created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now());
    CREATE TABLE nina_confianca_decisoes (id uuid PRIMARY KEY);
    CREATE TABLE nina_confianca_vinculos (id uuid PRIMARY KEY,
      decisao_id uuid REFERENCES nina_confianca_decisoes(id) ON DELETE RESTRICT);
    CREATE FUNCTION nina_confianca_decisoes_imutavel() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'nina_confianca_decisoes e um registro historico imutavel'; END $$;
    CREATE FUNCTION nina_confianca_vinculos_imutavel() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'nina_confianca_vinculos e um registro historico imutavel'; END $$;
    CREATE TRIGGER nina_confianca_decisoes_no_update BEFORE UPDATE OR DELETE ON nina_confianca_decisoes
      FOR EACH ROW EXECUTE FUNCTION nina_confianca_decisoes_imutavel();
    CREATE TRIGGER nina_confianca_vinculos_imutavel_trg BEFORE UPDATE OR DELETE ON nina_confianca_vinculos
      FOR EACH ROW EXECUTE FUNCTION nina_confianca_vinculos_imutavel();
  `);

  // Motor de confiança com histórico protegido antes da migration.
  const decisao = randomUUID();
  await query("INSERT INTO nina_confianca_decisoes (id) VALUES ($1)", [decisao]);
  await query("INSERT INTO nina_confianca_vinculos (id, decisao_id) VALUES ($1, $2)", [
    randomUUID(),
    decisao,
  ]);
  await assert.rejects(query("DELETE FROM nina_confianca_vinculos"), /imutavel/);

  await db.exec(migration);
  ok(
    (await query("SELECT count(*)::int n FROM nina_confianca_decisoes"))[0].n === 0,
    "decisões apagadas",
  );
  ok(
    (await query("SELECT count(*)::int n FROM nina_confianca_vinculos"))[0].n === 0,
    "vínculos apagados",
  );
  // Reexecutável: aplicar de novo não falha nem recria a trava.
  await db.exec(migration);
  ok(
    (await query("SELECT count(*)::int n FROM pg_trigger WHERE tgname LIKE 'nina_confianca_%'"))[0]
      .n === 0,
    "travas de imutabilidade removidas",
  );
  ok(
    !(
      await query(
        "SELECT has_function_privilege('authenticated','nina_zap_retencao_executar()','EXECUTE') p",
      )
    )[0].p,
    "usuário comum não executa a retenção",
  );
  ok(
    (
      await query(
        "SELECT has_function_privilege('service_role','nina_zap_retencao_executar()','EXECUTE') p",
      )
    )[0].p,
    "service_role executa a retenção",
  );

  // ---------- Diagnóstico (7 dias)
  const exeVelha = randomUUID();
  const exeNova = randomUUID();
  await query(
    "INSERT INTO nina_execucoes (id, clinica_id, created_at) VALUES ($1,$3,$4),($2,$3,$5)",
    [exeVelha, exeNova, clinica, dias(10), dias(2)],
  );
  await query(
    "INSERT INTO nina_execucao_evidencias (execucao_id, created_at) VALUES ($1,$3),($2,$4)",
    [exeVelha, exeNova, dias(10), dias(2)],
  );
  const snapVelho = randomUUID();
  await query("INSERT INTO nina_prompt_snapshots (id, execucao_id, created_at) VALUES ($1,$2,$3)", [
    snapVelho,
    exeVelha,
    dias(10),
  ]);
  const traceVelho = randomUUID();
  const traceNovo = randomUUID();
  await query("INSERT INTO nina_trace_eventos (id, created_at) VALUES ($1,$3),($2,$4)", [
    traceVelho,
    traceNovo,
    dias(8),
    dias(6),
  ]);
  const kbVelha = randomUUID();
  await query("INSERT INTO nina_kb_consultas (id, created_at) VALUES ($1,$2)", [kbVelha, dias(9)]);

  const loteVelho = randomUUID();
  const loteAtivo = randomUUID();
  const loteNovo = randomUUID();
  await query(
    `INSERT INTO nina_message_batches (id, status, watchdog_state, processed_at, created_at) VALUES
      ($1,'PROCESSED','completed',$4,$4), ($2,'PROCESSING','processing',NULL,$4), ($3,'PROCESSED',NULL,$5,$5)`,
    [loteVelho, loteAtivo, loteNovo, dias(8), dias(3)],
  );
  await query("INSERT INTO nina_batch_entregas (batch_id, parte) VALUES ($1,'texto')", [loteVelho]);
  await query("INSERT INTO nina_message_batch_itens (batch_id, mensagem_id) VALUES ($1,$2)", [
    loteVelho,
    randomUUID(),
  ]);

  await query(
    "INSERT INTO nina_conversa_revisoes (chave, updated_at) VALUES ('velha',$1),('nova',$2)",
    [dias(8), dias(1)],
  );
  await query(
    `INSERT INTO nina_conversa_locks (chave, liberado_em, expira_em, updated_at) VALUES
      ('livre', $1, $1, $1), ('presa', NULL, now() + interval '1 minute', $1)`,
    [dias(8)],
  );

  // ---------- Homologação (7 dias; configuração fica)
  const lead = randomUUID();
  await query("INSERT INTO nina_teste_leads (id) VALUES ($1)", [lead]);
  const cicloVelho = randomUUID();
  const cicloAtual = randomUUID();
  const cicloAtivo = randomUUID();
  await query(
    `INSERT INTO nina_teste_ciclos (id, lead_id, status, ended_at, created_at) VALUES
      ($1,$4,'resolvido',$5,$5), ($2,$4,'encerrado_handoff',$5,$5), ($3,$4,'ativo',NULL,$5)`,
    [cicloVelho, cicloAtual, cicloAtivo, lead, dias(9)],
  );
  await query("UPDATE nina_teste_leads SET ciclo_id=$1 WHERE id=$2", [cicloAtual, lead]);
  const cargaVelha = randomUUID();
  const cargaRodando = randomUUID();
  await query(
    `INSERT INTO nina_teste_carga (id, status, finalizado_em, created_at) VALUES
      ($1,'concluido',$3,$3), ($2,'executando',NULL,$3)`,
    [cargaVelha, cargaRodando, dias(9)],
  );
  await query("INSERT INTO nina_teste_carga_amostras (id, carga_id) VALUES ($1,$2)", [
    randomUUID(),
    cargaVelha,
  ]);
  await query("INSERT INTO nina_carga_servidor_tarefas (id, carga_id) VALUES ($1,$2)", [
    randomUUID(),
    cargaVelha,
  ]);
  await query(
    "INSERT INTO nina_teste_execucoes (id, status, finalizado_em) VALUES ($1,'concluida',$2)",
    [randomUUID(), dias(9)],
  );
  await query("INSERT INTO nina_teste_avaliacoes (id, created_at) VALUES ($1,$2)", [
    randomUUID(),
    dias(9),
  ]);
  await query(
    "INSERT INTO nina_teste_simulacoes (id, status, finalizado_em) VALUES ($1,'concluida',$2)",
    [randomUUID(), dias(9)],
  );

  // ---------- Reportes de erro (7 dias, qualquer status)
  const reporteVelho = randomUUID();
  const reporteNovo = randomUUID();
  await query(
    "INSERT INTO nina_feedback_erros (id, status, execucao_id, created_at) VALUES ($1,'pending',$3,$4),($2,'pending',NULL,$5)",
    [reporteVelho, reporteNovo, exeVelha, dias(8), dias(2)],
  );
  await query("INSERT INTO nina_feedback_analises (id, feedback_id) VALUES ($1,$2)", [
    randomUUID(),
    reporteVelho,
  ]);

  // ---------- Histórico do atendimento (3 meses por inatividade)
  const convAtiva = randomUUID();
  const convParada = randomUUID();
  const convLead = randomUUID();
  await query(
    `INSERT INTO atend_conversas (id, clinica_id, created_at, updated_at, ultima_msg_em) VALUES
      ($1,$4,$5,$6,$6), ($2,$4,$5,$7,$7), ($3,$4,$5,$5,NULL)`,
    [convAtiva, convParada, convLead, clinica, dias(150), dias(3), dias(120)],
  );
  await query("UPDATE nina_teste_leads SET conversa_id=$1 WHERE id=$2", [convLead, lead]);
  await query("INSERT INTO atend_conversa_eventos (id, conversa_id) VALUES ($1,$2),($3,$4)", [
    randomUUID(),
    convParada,
    randomUUID(),
    convAtiva,
  ]);
  const msgAntigaAtiva = randomUUID();
  const msgRecenteAtiva = randomUUID();
  const msgParada = randomUUID();
  await query(
    `INSERT INTO whatsapp_mensagens (id, clinica_id, conversa_id, execucao_id, created_at) VALUES
      ($1,$5,$4,NULL,$6), ($2,$5,$4,$8,$7), ($3,$5,$9,NULL,$10)`,
    [
      msgAntigaAtiva,
      msgRecenteAtiva,
      msgParada,
      convAtiva,
      clinica,
      dias(140),
      dias(3),
      exeVelha,
      convParada,
      dias(120),
    ],
  );
  await query("INSERT INTO atend_aviso_encaminhamento (id, created_at) VALUES ($1,$2)", [
    randomUUID(),
    dias(120),
  ]);
  await query(
    "INSERT INTO agendamento_confirmacoes (id, created_at, updated_at) VALUES ($1,$2,$2)",
    [randomUUID(), dias(120)],
  );

  const resultado = (await query("SELECT nina_zap_retencao_executar() r"))[0].r;
  ok(
    !Object.keys(resultado).some((k) => k.endsWith("_erro")),
    `nenhuma etapa falhou: ${JSON.stringify(resultado)}`,
  );

  ok(!(await existe("nina_execucoes", "id", exeVelha)), "execução velha apagada");
  ok(
    !(await existe("nina_execucao_evidencias", "execucao_id", exeVelha)),
    "evidência velha saiu junto",
  );
  ok(!(await existe("nina_prompt_snapshots", "id", snapVelho)), "cópia das instruções saiu junto");
  ok(await existe("nina_execucoes", "id", exeNova), "execução recente fica");
  ok(await existe("nina_execucao_evidencias", "execucao_id", exeNova), "evidência recente fica");
  ok(!(await existe("nina_trace_eventos", "id", traceVelho)), "rastro velho apagado");
  ok(await existe("nina_trace_eventos", "id", traceNovo), "rastro recente fica");
  ok(!(await existe("nina_kb_consultas", "id", kbVelha)), "consulta à base velha apagada");
  ok(!(await existe("nina_message_batches", "id", loteVelho)), "lote encerrado velho apagado");
  ok(
    (await query("SELECT count(*)::int n FROM nina_batch_entregas"))[0].n === 0,
    "entrega do lote saiu junto",
  );
  ok(
    (await query("SELECT count(*)::int n FROM nina_message_batch_itens"))[0].n === 0,
    "itens do lote saíram junto",
  );
  ok(await existe("nina_message_batches", "id", loteAtivo), "lote em processamento nunca sai");
  ok(await existe("nina_message_batches", "id", loteNovo), "lote recente fica");
  ok(!(await existe("nina_conversa_revisoes", "chave", "velha")), "contador parado apagado");
  ok(await existe("nina_conversa_revisoes", "chave", "nova"), "contador em uso fica");
  ok(!(await existe("nina_conversa_locks", "chave", "livre")), "trava livre antiga apagada");
  ok(await existe("nina_conversa_locks", "chave", "presa"), "trava ainda válida fica");

  ok(await existe("nina_teste_leads", "id", lead), "paciente de teste (configuração) fica");
  ok(!(await existe("nina_teste_ciclos", "id", cicloVelho)), "ciclo encerrado velho apagado");
  ok(await existe("nina_teste_ciclos", "id", cicloAtual), "ciclo atual do paciente de teste fica");
  ok(await existe("nina_teste_ciclos", "id", cicloAtivo), "ciclo ativo fica");
  ok(!(await existe("nina_teste_carga", "id", cargaVelha)), "carga encerrada velha apagada");
  ok(
    (await query("SELECT count(*)::int n FROM nina_carga_servidor_tarefas"))[0].n === 0,
    "tarefas da carga saíram",
  );
  ok(
    (await query("SELECT count(*)::int n FROM nina_teste_carga_amostras"))[0].n === 0,
    "amostras da carga saíram",
  );
  ok(await existe("nina_teste_carga", "id", cargaRodando), "carga em andamento fica");
  ok(
    (await query("SELECT count(*)::int n FROM nina_teste_execucoes"))[0].n === 0,
    "execução de teste velha apagada",
  );
  ok(
    (await query("SELECT count(*)::int n FROM nina_teste_avaliacoes"))[0].n === 0,
    "avaliação velha apagada",
  );
  ok(
    (await query("SELECT count(*)::int n FROM nina_teste_simulacoes"))[0].n === 0,
    "simulação velha apagada",
  );

  ok(
    !(await existe("nina_feedback_erros", "id", reporteVelho)),
    "reporte velho apagado, mesmo pendente",
  );
  ok(
    (await query("SELECT count(*)::int n FROM nina_feedback_analises"))[0].n === 0,
    "análise do reporte saiu junto",
  );
  ok(await existe("nina_feedback_erros", "id", reporteNovo), "reporte recente fica");

  ok(
    !(await existe("whatsapp_mensagens", "id", msgAntigaAtiva)),
    "mensagem com mais de 3 meses apagada",
  );
  ok(await existe("whatsapp_mensagens", "id", msgRecenteAtiva), "mensagem recente fica");
  ok(
    (await query("SELECT execucao_id FROM whatsapp_mensagens WHERE id=$1", [msgRecenteAtiva]))[0]
      .execucao_id === null,
    "mensagem recente só perde o vínculo com a execução apagada",
  );
  ok(await existe("atend_conversas", "id", convAtiva), "conversa antiga com mensagem recente fica");
  ok(!(await existe("atend_conversas", "id", convParada)), "conversa parada há 3 meses apagada");
  ok(!(await existe("whatsapp_mensagens", "id", msgParada)), "mensagens da conversa parada saíram");
  ok(
    (await query("SELECT count(*)::int n FROM atend_conversa_eventos"))[0].n === 1,
    "eventos só da conversa apagada saíram",
  );
  ok(await existe("atend_conversas", "id", convLead), "conversa do paciente de teste fica");
  ok(
    (await query("SELECT count(*)::int n FROM atend_aviso_encaminhamento"))[0].n === 0,
    "aviso antigo apagado",
  );
  ok(
    (await query("SELECT count(*)::int n FROM agendamento_confirmacoes"))[0].n === 0,
    "confirmação antiga apagada",
  );

  const segunda = (await query("SELECT nina_zap_retencao_executar() r"))[0].r;
  ok(
    Object.values(segunda).every((v) => v === 0),
    `segunda execução não encontra mais nada: ${JSON.stringify(segunda)}`,
  );

  console.log(`nina_zap_retencao: ${passed} verificações aprovadas`);
} finally {
  await db.close();
}
