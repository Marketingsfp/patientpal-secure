import { beforeAll, afterAll, beforeEach, describe, expect, it } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { configPadraoFrancisco } from "../config";

// Executa a migração e as decisões financeiras em PostgreSQL real (WASM), sem rede.
const db = new PGlite();
const clinica = "10000000-0000-4000-8000-000000000001";
const outra = "10000000-0000-4000-8000-000000000002";
const orcamento = "20000000-0000-4000-8000-000000000001";
const item = "30000000-0000-4000-8000-000000000001";
const agenda = "40000000-0000-4000-8000-000000000001";
const financeiro = "50000000-0000-4000-8000-000000000001";
const telefone = "5521999998888";
const c = { ...configPadraoFrancisco(), ativo: true, modo: "real" };
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE FUNCTION public.has_module_access(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql AS 'SELECT false';
    CREATE TABLE clinicas(id uuid PRIMARY KEY); INSERT INTO clinicas VALUES('${clinica}'),('${outra}');
    CREATE TABLE clinica_memberships(id uuid,user_id uuid,clinica_id uuid,ativo boolean);
    CREATE TABLE orcamentos(id uuid PRIMARY KEY,clinica_id uuid,numero integer,paciente_telefone text,created_at timestamptz,status text,valor_total numeric,validade_dias integer);
    CREATE TABLE orcamento_itens(id uuid PRIMARY KEY,orcamento_id uuid,status_financeiro text DEFAULT 'pendente',valor_pago numeric DEFAULT 0,pago_em timestamptz,sinal_pago_em timestamptz,saldo_pago_em timestamptz,status_operacional text DEFAULT 'pendente',agendamento_id uuid,fin_atendimento_id uuid);
    CREATE TABLE agendamentos(id uuid PRIMARY KEY,clinica_id uuid,orcamento_id uuid);
    CREATE TABLE agendamento_orcamento_itens(clinica_id uuid,orcamento_id uuid,agendamento_id uuid);
    CREATE TABLE fin_atendimentos(id uuid PRIMARY KEY,clinica_id uuid,orcamento_item_id uuid,status text,lancamento_id uuid);
    CREATE TABLE fin_lancamentos(id uuid PRIMARY KEY,clinica_id uuid,agendamento_id uuid,tipo text,status text);
    CREATE TABLE sistema_job_tokens(nome text PRIMARY KEY,token text);
    CREATE TABLE atend_conversas(clinica_id uuid,contato_telefone text,status text,owner_type text,janela_24h_em timestamptz);
  `);
  await db.exec(
    readFileSync("supabase/migrations/20261008193000_francisco_orcamentos.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec(
    "TRUNCATE francisco_envios,francisco_eventos,francisco_contatos,francisco_config,orcamento_itens,orcamentos,agendamentos,agendamento_orcamento_itens,fin_atendimentos,fin_lancamentos,atend_conversas CASCADE",
  );
  await db.query(
    "INSERT INTO orcamentos VALUES($1,$2,1,$3,now()-interval '25 hours','aberto',100,30)",
    [orcamento, clinica, telefone],
  );
  await db.query("INSERT INTO orcamento_itens(id,orcamento_id) VALUES($1,$2)", [item, orcamento]);
  await db.query(
    "INSERT INTO francisco_config(clinica_id,rascunho,publicado,inicio_campanha) VALUES($1,$2,$2,now()-interval '2 days')",
    [clinica, JSON.stringify(c)],
  );
  await db.query(
    "INSERT INTO francisco_contatos VALUES($1,$2,'autorizado','Autorização fictícia documentada',NULL,now())",
    [clinica, telefone],
  );
});
async function avaliar(clinicaId = clinica) {
  const r = await db.query<{ resultado: { motivo: string; etapa: string } }>(
    "SELECT francisco_avaliar($1,$2,$3,now()-interval '2 days') AS resultado",
    [clinicaId, orcamento, JSON.stringify(c)],
  );
  return r.rows[0]!.resultado;
}
async function reservar() {
  return (
    await db.query<{ r: { id: string } | null }>(
      "SELECT francisco_reservar($1,$2,'d1','Mensagem fictícia') r",
      [clinica, orcamento],
    )
  ).rows[0]!.r;
}
describe("Francisco — elegibilidade, isolamento e reserva", () => {
  it("preserva atendimento humano e conversa recente da Nina", async () => {
    await db.query("INSERT INTO atend_conversas VALUES($1,$2,'waiting','HUMAN',NULL)", [
      clinica,
      telefone,
    ]);
    expect((await avaliar()).motivo).toBe("atendimento_em_andamento");
    await db.exec("UPDATE atend_conversas SET owner_type='AI',janela_24h_em=now()");
    expect((await avaliar()).motivo).toBe("atendimento_em_andamento");
  });
  it("agenda sem recebimento continua elegível", async () => {
    await db.query("INSERT INTO agendamentos VALUES($1,$2,$3)", [agenda, clinica, orcamento]);
    expect((await avaliar()).motivo).toBe("elegivel");
  });
  it("receita confirmada da agenda impede contato mesmo com item pendente", async () => {
    await db.query("INSERT INTO agendamentos VALUES($1,$2,$3)", [agenda, clinica, orcamento]);
    await db.query("INSERT INTO fin_lancamentos VALUES($1,$2,$3,'receita','confirmado')", [
      financeiro,
      clinica,
      agenda,
    ]);
    expect((await avaliar()).motivo).toBe("recebimento_confirmado");
  });
  it("recebimento pela ponte item-agenda também impede contato", async () => {
    await db.query("INSERT INTO agendamento_orcamento_itens VALUES($1,$2,$3)", [
      clinica,
      orcamento,
      agenda,
    ]);
    await db.query("INSERT INTO fin_lancamentos VALUES($1,$2,$3,'receita','confirmado')", [
      financeiro,
      clinica,
      agenda,
    ]);
    expect((await avaliar()).motivo).toBe("recebimento_confirmado");
  });
  it("pagamento parcial e sinal pago interrompem a sequência", async () => {
    await db.query("UPDATE orcamento_itens SET valor_pago=10 WHERE id=$1", [item]);
    expect((await avaliar()).motivo).toBe("item_pago_parcial_ou_inaplicavel");
    await db.query("UPDATE orcamento_itens SET valor_pago=0,sinal_pago_em=now() WHERE id=$1", [
      item,
    ]);
    expect((await avaliar()).motivo).toBe("item_pago_parcial_ou_inaplicavel");
  });
  it("atendimento financeiro realizado prevalece sobre item desatualizado", async () => {
    await db.query("INSERT INTO fin_atendimentos VALUES($1,$2,$3,'realizado',NULL)", [
      financeiro,
      clinica,
      item,
    ]);
    expect((await avaliar()).motivo).toBe("recebimento_registrado");
  });
  it("financeiro cancelado não comprova pagamento", async () => {
    await db.query("INSERT INTO agendamentos VALUES($1,$2,$3)", [agenda, clinica, orcamento]);
    await db.query("INSERT INTO fin_lancamentos VALUES($1,$2,$3,'receita','cancelado')", [
      financeiro,
      clinica,
      agenda,
    ]);
    expect((await avaliar()).motivo).toBe("elegivel");
  });
  it("não lê orçamento de outra clínica nem usa seus recebimentos", async () => {
    expect((await avaliar(outra)).motivo).toBe("orcamento_inexistente");
    await db.query("INSERT INTO agendamentos VALUES($1,$2,$3)", [agenda, clinica, orcamento]);
    await db.query("INSERT INTO fin_lancamentos VALUES($1,$2,$3,'receita','confirmado')", [
      financeiro,
      outra,
      agenda,
    ]);
    expect((await avaliar()).motivo).toBe("elegivel");
  });
  it("reserva uma única vez e confere pagamento novamente na reserva", async () => {
    expect(await reservar()).not.toBeNull();
    expect(await reservar()).toBeNull();
    await db.exec("TRUNCATE francisco_envios");
    expect((await avaliar()).motivo).toBe("elegivel");
    await db.query("UPDATE orcamento_itens SET valor_pago=100 WHERE id=$1", [item]);
    expect(await reservar()).toBeNull();
  });
  it("pagamento após a reserva ainda bloqueia antes do envio", async () => {
    const r = await reservar();
    expect(r).not.toBeNull();
    expect(
      (await db.query<{ ok: boolean }>("SELECT francisco_conferir_reserva($1) ok", [r!.id]))
        .rows[0]!.ok,
    ).toBe(true);
    await db.query("UPDATE orcamento_itens SET valor_pago=20 WHERE id=$1", [item]);
    expect(
      (await db.query<{ ok: boolean }>("SELECT francisco_conferir_reserva($1) ok", [r!.id]))
        .rows[0]!.ok,
    ).toBe(false);
    expect(
      (
        await db.query<{ status: string }>("SELECT status FROM francisco_envios WHERE id=$1", [
          r!.id,
        ])
      ).rows[0]!.status,
    ).toBe("bloqueado");
  });
  it("pausa, simulação e contato sem autorização não reservam envio", async () => {
    await db.exec(
      "UPDATE francisco_config SET publicado=jsonb_set(publicado,'{modo}','\"simulacao\"')",
    );
    expect(await reservar()).toBeNull();
    await db.exec("DELETE FROM francisco_contatos");
    expect((await avaliar()).motivo).toBe("sem_autorizacao");
  });
  it("resposta/saída interrompe D4, com histórico idempotente", async () => {
    await reservar();
    await db.query("SELECT francisco_registrar_resposta($1,$2,true,'wamid.ficticio')", [
      clinica,
      telefone,
    ]);
    await db.query("SELECT francisco_registrar_resposta($1,$2,true,'wamid.ficticio')", [
      clinica,
      telefone,
    ]);
    expect((await avaliar()).motivo).toBe("resposta_recebida");
    expect(
      (await db.query("SELECT * FROM francisco_eventos WHERE tipo='saida_solicitada'")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query<{ estado: string }>("SELECT estado FROM francisco_contatos")).rows[0]!.estado,
    ).toBe("recusado");
  });
  it("D4 é contado desde a criação e exige D1 enviado", async () => {
    await db.query("UPDATE orcamentos SET created_at=now()-interval '97 hours' WHERE id=$1", [
      orcamento,
    ]);
    const r = await db.query<{ r: { etapa: string; motivo: string } }>(
      "SELECT francisco_avaliar($1,$2,$3,now()-interval '5 days') r",
      [clinica, orcamento, JSON.stringify(c)],
    );
    expect(r.rows[0]!.r).toMatchObject({ etapa: "d4", motivo: "d1_nao_enviado" });
    await db.query(
      "INSERT INTO francisco_envios(clinica_id,orcamento_id,telefone,etapa,status,template_nome,texto,configuracao,created_at) VALUES($1,$2,$3,'d1','enviado','ficticio','ficticio',$4,now()-interval '3 days')",
      [clinica, orcamento, telefone, JSON.stringify(c)],
    );
    const d4 = await db.query<{ r: { motivo: string } }>(
      "SELECT francisco_avaliar($1,$2,$3,now()-interval '5 days') r",
      [clinica, orcamento, JSON.stringify(c)],
    );
    expect(d4.rows[0]!.r.motivo).toBe("elegivel");
  });
  it("CAS impede sobrescrita e primeira publicação não inclui orçamento antigo", async () => {
    await db.exec("DELETE FROM francisco_config");
    await db.query("SELECT francisco_salvar_config($1,NULL,0,$2,true)", [
      clinica,
      JSON.stringify(configPadraoFrancisco()),
    ]);
    await expect(
      db.query("SELECT francisco_salvar_config($1,NULL,0,$2,true)", [clinica, JSON.stringify(c)]),
    ).rejects.toThrow("outra pessoa");
    const r = await db.query<{ r: { motivo: string } }>(
      "SELECT francisco_avaliar($1,$2,$3,(SELECT inicio_campanha FROM francisco_config WHERE clinica_id=$1)) r",
      [clinica, orcamento, JSON.stringify(c)],
    );
    expect(r.rows[0]!.r.motivo).toBe("anterior_ao_inicio");
  });
  it("navegador não escreve tabelas nem executa RPCs de envio", async () => {
    const r = await db.query<{ tabela: boolean; funcao: boolean }>(
      "SELECT has_table_privilege('authenticated','francisco_envios','INSERT') tabela,has_function_privilege('authenticated','francisco_reservar(uuid,uuid,text,text)','EXECUTE') funcao",
    );
    expect(r.rows[0]).toEqual({ tabela: false, funcao: false });
  });
  it("paginação de 20 não perde registros com a mesma data", async () => {
    await db.exec(
      `INSERT INTO orcamentos SELECT gen_random_uuid(),'${clinica}',n,'${telefone}',now()-interval '25 hours','aberto',100,30 FROM generate_series(2,45) n`,
    );
    const a = await db.query<any>(
      "SELECT * FROM francisco_listar_candidatos($1,$2,now()-interval '2 days')",
      [clinica, JSON.stringify(c)],
    );
    expect(a.rows).toHaveLength(21);
    const ultimo = a.rows[19].francisco_listar_candidatos;
    const b = await db.query<any>(
      "SELECT * FROM francisco_listar_candidatos($1,$2,now()-interval '2 days',$3,$4)",
      [clinica, JSON.stringify(c), ultimo.created_at, ultimo.orcamento_id],
    );
    expect(b.rows).toHaveLength(21);
    const primeiros = a.rows.slice(0, 20).map((r) => r.francisco_listar_candidatos.orcamento_id);
    expect(b.rows.some((r) => primeiros.includes(r.francisco_listar_candidatos.orcamento_id))).toBe(
      false,
    );
  });
});
