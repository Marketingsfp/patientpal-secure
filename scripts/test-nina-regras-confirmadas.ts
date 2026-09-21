/** Banco PostgreSQL descartável. Nenhuma conexão com a clínica. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { gerarRegrasConfirmadas } from "./nina/gerar-regras-confirmadas";
import { INSTRUCAO_DADOS_CATALOGO } from "../src/lib/nina/catalogo-estrutura";
import { validarTemplateInstrucoes } from "../src/lib/nina/instrucoes-template";
const db = new PGlite();
const arquivo = (p: string) => readFileSync(`supabase/migrations/${p}`, "utf8");
let prompt = JSON.parse(arquivo("20260920220000_nina_consolidacao_instrucoes.sql").split("$nina_dados$")[1]!)[0].conteudo;
for (const [a,b] of JSON.parse(arquivo("20260921150000_nina_duas_perguntas_esclarecimento.sql").split("$alteracoes$")[1]!)) prompt = prompt.replace(a,b);
prompt += "\n\n" + arquivo("20260921180000_nina_informacoes_publicas_grupo.sql").split("$regra$")[1]!;
const snapshot = async () => (await db.query("SELECT v FROM (SELECT to_jsonb(t) v FROM nina_cat_servicos t UNION ALL SELECT to_jsonb(t) FROM nina_cat_profissionais t) s ORDER BY v->>'id'")).rows;
try {
  await db.exec(`
    CREATE TABLE audit_log(id bigserial, tabela text, antes jsonb, depois jsonb);
    CREATE FUNCTION audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO audit_log(tabela,antes,depois) VALUES(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW)); RETURN NEW; END $$;
    CREATE TABLE nina_cat_servicos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text,status text,descricao_publica text,estrutura jsonb,formas_pagamento jsonb,created_at timestamptz DEFAULT now(),nota_interna text);
    CREATE TABLE nina_cat_profissionais(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text,status text,observacao_publica text,horarios jsonb,estrutura jsonb,created_at timestamptz DEFAULT now(),nota_interna text);
    CREATE TRIGGER aud_servico AFTER UPDATE ON nina_cat_servicos FOR EACH ROW EXECUTE FUNCTION audit();
    CREATE TRIGGER aud_prof AFTER UPDATE ON nina_cat_profissionais FOR EACH ROW EXECUTE FUNCTION audit();
    CREATE TABLE nina_instrucoes_versoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinica_id uuid,escopo text,versao integer,conteudo text,status text,comentario text,versao_anterior_id uuid,publicado_em timestamptz,created_at timestamptz DEFAULT now());
  `);
  for (const nome of ["CAPTURA HIBRIDA DE HPV", "ELETROCAUTERIZAÇÃO PORTE 2", "ELETROCAUTERIZAÇÃO PORTE 3"]) {
    for (const status of ["PUBLICADO", "ARQUIVADO", "RASCUNHO"])
      await db.query("INSERT INTO nina_cat_servicos(nome,status,descricao_publica,estrutura,formas_pagamento,nota_interna) VALUES($1,$2,$3,$4,$5,'preservar')", [nome,status,`${nome}\nEspecialidade: UROLOGIA\nProfissional: Marcelo Barreto\nObservação: R$ 500,00 (anestesia)\nPode chegar até que horas: Até 14:00h`, {versao:1, aliases:["teste"],complementos:[]},[{forma:"Dinheiro",valor:600},{forma:"Pix/cartão",valor:750}]]);
  }
  const obs = "CONSULTA CARDIOLOGIA\nObservação: 20 vagas\nPode chegar até que horas: Manhã\n\nCONSULTA CLÍNICO GERAL\nObservação: 20 vagas\nPode chegar até que horas: Até 11:30h";
  await db.query("INSERT INTO nina_cat_profissionais(nome,status,observacao_publica,horarios,estrutura,nota_interna) VALUES ('Sandro Prinscewal','PUBLICADO',$1,$2,$3,'preservar'),('Karen','PUBLICADO','Pode chegar até que horas: Até 17h','[]','{}','preservar'),('Diogo Del Cima','PUBLICADO','Critério: 40 kg; Manhã e tarde','[]','{}','preservar'),('Outro','PUBLICADO',$1,$2,$3,'preservar')", [obs,[{dia:"Segunda",inicio:"09:30",fim:null,observacao:"CONSULTA CARDIOLOGIA. 20 vagas. Chegada: Manhã; Até 11:30h."}],{versao:1,complementos:[]}]);
  await db.query("INSERT INTO nina_instrucoes_versoes(escopo,versao,conteudo,status) VALUES ('whatsapp',43,$1,'publicada'),('painel_interno',4,'Painel intacto','publicada')",[prompt]);
  const antes = await snapshot();
  const versoesAntes = (await db.query("SELECT * FROM nina_instrucoes_versoes ORDER BY escopo")).rows;
  const migration = gerarRegrasConfirmadas();
  await db.exec(migration);
  const depois = await snapshot();
  let alterados = 0;
  for (let i=0;i<antes.length;i++) {
    const a = antes[i]!.v as any, d = depois[i]!.v as any;
    if (JSON.stringify(a) === JSON.stringify(d)) continue;
    alterados++;
    assert.equal(a.status,"PUBLICADO");
    assert.equal(a.created_at,d.created_at);
    assert.equal(a.nota_interna,d.nota_interna);
    if (a.nome === "Sandro Prinscewal") {
      assert.equal((d.observacao_publica.match(/20 para cardiologia e 20 para clínico geral/g)??[]).length,2);
      assert.equal(d.horarios[0].inicio,a.horarios[0].inicio);
      assert.equal(d.horarios[0].fim,null);
      assert.ok(d.observacao_publica.includes("Até 11:30h"));
    } else {
      assert.deepEqual(a.formas_pagamento,d.formas_pagamento);
      assert.deepEqual(d.estrutura.aliases,["teste"]);
      assert.match(d.estrutura.complementos[0].acrescimos,/Total = valor do procedimento/);
      assert.match(d.descricao_publica,/Anestesia adicional/);
    }
  }
  assert.equal(alterados,4);
  assert.equal((await db.query("SELECT count(*)::int n FROM audit_log")).rows[0]!.n,4);
  const versoes = (await db.query("SELECT * FROM nina_instrucoes_versoes ORDER BY escopo")).rows;
  for (const a of versoesAntes) assert.deepEqual(versoes.find(v=>v.id===a.id),{...a,status:a.escopo==='whatsapp'?'arquivada':a.status});
  const novo = versoes.find(v=>v.versao===44)!;
  assert.ok(String(novo.conteudo).includes(INSTRUCAO_DADOS_CATALOGO));
  assert.ok(String(novo.conteudo).includes("ATÉ DUAS VEZES por solicitação"));
  assert.ok(String(novo.conteudo).includes("INSTRUÇÃO INST-01"));
  assert.ok(validarTemplateInstrucoes("whatsapp",String(novo.conteudo)).ok);
  await db.exec(migration);
  assert.deepEqual(await snapshot(),depois);
  assert.equal((await db.query("SELECT count(*)::int n FROM audit_log")).rows[0]!.n,4);
  assert.equal((await db.query("SELECT count(*)::int n FROM nina_instrucoes_versoes")).rows[0]!.n,3);
  console.log("PASS: 4 registros previstos; preços, horários, Karen, peso, rascunhos, histórico, painel e auditoria preservados; publicação válida e reaplicação sem duplicação.");
} finally { await db.close(); }
