import { mock } from "bun:test";
import assert from "node:assert/strict";
const url = new URL(process.env.NINA_WATCHDOG_TEST_DATABASE_URL!);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/nina_watchdog_test")
  throw Error("Banco não isolado");
const sql = new Bun.SQL(url.toString());

// Apenas substitui PostgREST pelo driver SQL local; RPCs e transações são reais.
let perderAck = false;
const admin = {
  async rpc(nome: string, args: Record<string, unknown>) {
    if (!/^nina_[a-z_]+$/.test(nome)) throw Error("RPC inválida");
    if (perderAck && nome === "nina_watchdog_entrega_resultado" && args._estado === "confirmed") {
      perderAck = false;
      return { data: null, error: { code: "TEST_ACK_LOST" } };
    }
    const entries = Object.entries(args);
    if (entries.some(([k]) => !/^_[a-z_]+$/.test(k))) throw Error("Parâmetro inválido");
    const chamada = `public.${nome}(${entries.map(([k], i) => `${k} => $${i + 1}`).join(",")})`;
    try {
      if (nome === "nina_watchdog_evento") {
        await sql.unsafe(
          `SELECT ${chamada}`,
          entries.map(([, v]) => v),
        );
        return { data: null, error: null };
      }
      if (nome === "nina_watchdog_reivindicar") {
        const rows = await sql.unsafe(
          `SELECT to_jsonb(b) AS data FROM ${chamada} b`,
          entries.map(([, v]) => v),
        );
        return { data: rows.map((r: any) => r.data), error: null };
      }
      const [r] = await sql.unsafe(
        `SELECT to_jsonb(${chamada}) AS data`,
        entries.map(([, v]) => v),
      );
      return { data: r.data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },
  from(tabela: string) {
    if (!/^[a-z_]+$/.test(tabela)) throw Error("Tabela inválida");
    let campos = "*";
    const filtros: { campo: string; valor: unknown; conjunto?: boolean }[] = [];
    const ordem: string[] = [];
    const executar = async () => {
      try {
        return {
          data: await sql.unsafe(
            `SELECT ${campos} FROM ${tabela}${filtros.length ? " WHERE " + filtros.map((f, i) => (f.conjunto ? `${f.campo}=ANY($${i + 1}::uuid[])` : `${f.campo}=$${i + 1}`)).join(" AND ") : ""}${ordem.length ? " ORDER BY " + ordem.join(",") : ""}`,
            filtros.map((f) => f.valor),
          ),
          error: null,
        };
      } catch (error) {
        return { data: null, error };
      }
    };
    const q = {
      select(c: string) {
        if (!/^[a-z_,*]+$/.test(c)) throw Error("Colunas inválidas");
        campos = c;
        return q;
      },
      eq(campo: string, valor: unknown) {
        if (!/^[a-z_]+$/.test(campo)) throw Error("Filtro inválido");
        filtros.push({ campo, valor });
        return q;
      },
      in(campo: string, ids: string[]) {
        if (!/^[a-z_]+$/.test(campo)) throw Error("Filtro inválido");
        filtros.push({ campo, valor: "{" + ids.join(",") + "}", conjunto: true });
        return q;
      },
      order(campo: string) {
        if (!/^[a-z_]+$/.test(campo)) throw Error("Ordem inválida");
        ordem.push(campo);
        return q;
      },
      async single() {
        const r = await executar();
        return { ...r, data: r.data?.[0] ?? null };
      },
      async maybeSingle() {
        return q.single();
      },
      then(a: any, b: any) {
        return executar().then(a, b);
      },
    };
    return q;
  },
};
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));
const {
  carregarControleWatchdog,
  gerarComCheckpointNina,
  finalizarTextoComCheckpointNina,
  entregarComCheckpointNina,
  finalizarWatchdogNina,
  ErroEntregaWatchdog,
  executarWatchdogNina,
} = await import("../../watchdog.server");
const clinica = "11111111-1111-4111-8111-111111111111",
  conversa = crypto.randomUUID(),
  telefone = "550077" + Date.now();
await sql`INSERT INTO atend_conversas(id,clinica_id) VALUES(${conversa},${clinica})`;
const [m] =
  await sql`INSERT INTO whatsapp_mensagens(clinica_id,conversa_id,wa_message_id,direction,from_number,body,canal,is_teste)
  VALUES(${clinica},${conversa},${crypto.randomUUID()},'in',${telefone},'Qual o preparo?','test-console',true) RETURNING id`;
await sql`SELECT nina_revisao_registrar_entrada(${clinica},${telefone},${m.id})`;
const [b] =
  await sql`SELECT * FROM nina_batch_registrar(${clinica},${telefone},${conversa},${m.id})`;
const chave = clinica + ":" + telefone;
const [lock] =
  await sql`SELECT nina_lock_adquirir(${chave},${clinica},${conversa},${b.batch_id},90) AS token`;
await sql`SELECT nina_batch_reivindicar(${b.batch_id},${b.revision},true)`;
await sql`SELECT nina_batch_iniciar_processamento(${b.batch_id},${chave},${lock.token})`;
const turno = {
  batchId: b.batch_id,
  lock: { chave, token: lock.token },
  texto: "Qual o preparo?",
  revisao: 1,
  mensagens: [m.id],
};
let controle = await carregarControleWatchdog(turno);
assert(controle);
let modelCalls = 0,
  transportAttempts = 0,
  delivered = 0;
const gerar = async () => {
  modelCalls++;
  return "Preparo publicado do exame.";
};
const texto = await gerarComCheckpointNina(controle, {}, gerar);
let finalizacoes = 0;
const finalizar = async () => {
  finalizacoes++;
  return { texto: texto + " Confira o preparo.", encerrarConversaId: null };
};
const finalizada = await finalizarTextoComCheckpointNina(controle, finalizar);
// Entrega de homologação não faz HTTP; neste ensaio a linha é marcada como WhatsApp
// apenas no banco descartável para exercer a rejeição e o retry do adaptador real.
await sql`UPDATE whatsapp_mensagens SET is_teste=false,canal='whatsapp' WHERE id=${m.id}`;
await sql`UPDATE nina_watchdog_config SET producao_ativa=true`;
const payload = {
  texto: finalizada.texto,
  tipo: "text" as const,
  canal: "whatsapp" as const,
  from: "55000000000",
};
try {
  await entregarComCheckpointNina(controle, payload, async () => {
    transportAttempts++;
    throw Object.assign(new Error("rate limit"), { status: 429 });
  });
  throw Error("Era esperada rejeição");
} catch (error) {
  await finalizarWatchdogNina(controle, error);
}
await sql`SELECT nina_lock_liberar(${chave},${lock.token})`;
await sql`UPDATE nina_message_batches SET next_retry_at=now()-interval '1 second' WHERE id=${b.batch_id}`;
await sql`UPDATE nina_batch_entregas SET next_retry_at=now()-interval '1 second' WHERE batch_id=${b.batch_id}`;
const recovered = await sql`SELECT * FROM nina_watchdog_reivindicar(10)`;
const job = recovered.find((x: any) => x.id === b.batch_id);
assert(job);
controle = await carregarControleWatchdog({ ...turno, lock: { chave, token: job.watchdog_token } });
assert(controle);
assert.equal(await gerarComCheckpointNina(controle, {}, gerar), texto);
assert.deepEqual(await finalizarTextoComCheckpointNina(controle, finalizar), finalizada);
assert.equal(finalizacoes, 1);
const enviar = async () => {
  transportAttempts++;
  delivered++;
  return { wa_message_id: "wamid.test." + b.batch_id };
};
const primeira = await entregarComCheckpointNina(controle, payload, enviar);
const repetida = await entregarComCheckpointNina(controle, payload, enviar);
assert.equal(primeira.mensagemId, repetida.mensagemId);
await finalizarWatchdogNina(controle);
const [final] = await sql`SELECT nina_status FROM whatsapp_mensagens WHERE id=${m.id}`;
assert.equal(final.nina_status, "completed");
assert.equal(modelCalls, 1);
assert.equal(delivered, 1);
assert.equal(transportAttempts, 2);

// Outra conversa: Meta aceitou, mas o banco perdeu a gravação do ACK.
const conversa2 = crypto.randomUUID(),
  telefone2 = telefone + "2",
  chave2 = clinica + ":" + telefone2;
await sql`INSERT INTO atend_conversas(id,clinica_id) VALUES(${conversa2},${clinica})`;
const [m2] =
  await sql`INSERT INTO whatsapp_mensagens(clinica_id,conversa_id,wa_message_id,direction,from_number,body,canal,is_teste)
 VALUES(${clinica},${conversa2},${crypto.randomUUID()},'in',${telefone2},'Pergunta','whatsapp',false) RETURNING id`;
const [b2] =
  await sql`SELECT * FROM nina_batch_registrar(${clinica},${telefone2},${conversa2},${m2.id})`;
const [l2] =
  await sql`SELECT nina_lock_adquirir(${chave2},${clinica},${conversa2},${b2.batch_id},90) AS token`;
await sql`SELECT nina_batch_reivindicar(${b2.batch_id},${b2.revision},true)`;
await sql`SELECT nina_batch_iniciar_processamento(${b2.batch_id},${chave2},${l2.token})`;
const c2 = await carregarControleWatchdog({
  ...turno,
  batchId: b2.batch_id,
  mensagens: [m2.id],
  lock: { chave: chave2, token: l2.token },
});
assert(c2);
perderAck = true;
let efeitosAckPerdido = 0;
try {
  await entregarComCheckpointNina(c2, payload, async () => {
    efeitosAckPerdido++;
    return { wa_message_id: "wamid.local.aceita" };
  });
  throw Error("Deveria detectar ACK não salvo");
} catch (e) {
  assert(e instanceof ErroEntregaWatchdog);
  assert(e.incerta);
  assert(!e.recuperavel);
  await finalizarWatchdogNina(c2, e);
}
const [falha] = await sql`SELECT nina_status FROM whatsapp_mensagens WHERE id=${m2.id}`;
assert.equal(falha.nina_status, "failed");
assert.equal(efeitosAckPerdido, 1);

// Exercita o job real: claim SQL -> roteamento canônico -> finalização -> liberação.
// Só o atendimento/modelo é substituído; o coordenador e a persistência são reais.
mock.module("../../../atendimento/handoff.server", () => ({
  estadoConversaPorId: async () => ({ owner_type: "AI", status: "open", ai_enabled: true }),
  ninaPodeResponder: () => true,
}));
mock.module("../../../nina-desligada.server", () => ({
  ninaDesativadaNaClinica: async () => false,
}));
const conversa3 = crypto.randomUUID(),
  telefone3 = telefone + "3",
  lead3 = crypto.randomUUID(),
  ciclo3 = crypto.randomUUID();
await sql.unsafe(
  "CREATE TABLE IF NOT EXISTS nina_teste_leads(id uuid,clinica_id uuid,conversa_id uuid,ciclo_id uuid)",
);
await sql`INSERT INTO atend_conversas(id,clinica_id) VALUES(${conversa3},${clinica})`;
await sql`INSERT INTO nina_teste_leads(id,clinica_id,conversa_id,ciclo_id) VALUES(${lead3},${clinica},${conversa3},${ciclo3})`;
const [m3] =
  await sql`INSERT INTO whatsapp_mensagens(clinica_id,conversa_id,wa_message_id,direction,from_number,body,canal,is_teste)
 VALUES(${clinica},${conversa3},${crypto.randomUUID()},'in',${telefone3},'Mensagem retomada','test-console',true) RETURNING *`;
await sql`SELECT nina_revisao_registrar_entrada(${clinica},${telefone3},${m3.id})`;
const [b3] =
  await sql`SELECT * FROM nina_batch_registrar(${clinica},${telefone3},${conversa3},${m3.id})`;
await sql`UPDATE nina_message_batches SET next_retry_at=now()-interval '1 second' WHERE id=${b3.batch_id}`;
let chamadasProcessador = 0;
mock.module("../../teste-console.server", () => ({
  processarMensagemTeste: async (data: any, _actor: any, retomada: any) => {
    chamadasProcessador++;
    assert.equal(data.leadId, lead3);
    assert.equal(retomada.mensagem.id, m3.id);
    assert.equal(retomada.cicloId, ciclo3);
    assert.equal(retomada.turno.texto, "Mensagem retomada");
    const c = await carregarControleWatchdog(retomada.turno);
    assert(c);
    const texto = await gerarComCheckpointNina(c, {}, async () => "Resposta retomada");
    await entregarComCheckpointNina(
      c,
      { texto, tipo: "text", canal: "test-console", from: "test-console" },
      async () => {
        throw Error("Não deve enviar a Meta");
      },
    );
    // O coordenador deve concluir até um retorno antecipado deste adaptador.
    return { processamento: "RESPONDIDA" };
  },
}));
const rodada = await executarWatchdogNina();
assert.equal(rodada.assumidos, 1);
assert.equal(rodada.completed, 1);
assert.equal(rodada.pendentes, 0);
assert.equal(chamadasProcessador, 1);
const [l3] = await sql`SELECT liberado_em FROM nina_conversa_locks WHERE batch_id=${b3.batch_id}`;
assert(l3.liberado_em);

await sql`UPDATE nina_watchdog_config SET producao_ativa=false`;
await sql.close();
console.log(
  "WATCHDOG_RUNTIME=" + JSON.stringify({ modelCalls, transportAttempts, delivered, completed: 1 }),
);
