import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

// Serviços reais em processo isolado. Banco simulado, sem conexão externa.
const codigo = `
import { mock } from 'bun:test';
const clinica = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
let editorial = { id, clinica_id: clinica, nome:'Exame de teste', valor:90, status:'PUBLICADO', updated_at:'2026-09-27T12:00:00Z' };
const leituras = [], escritas = [];
let origem = 'administracao';
let ausente = false;
const db = {from(tabela) {
  const filtros = {}; let escrita;
  const linhas = () => tabela === 'procedimentos' ? [{id, nome:'Exame de teste', tipo:'exame', valor_padrao:100, valor_dinheiro:100, valor_cartao:120, preparo:'Preparo oficial'}] : [];
  const q = {select(){return q}, eq(k,v){filtros[k]=v;return q}, order(){return q},
    update(v){escrita=v;return q},
    range: async () => {leituras.push({origem,tabela});return {data:linhas(),error:null}},
    maybeSingle: async () => {
      if(tabela === 'clinica_memberships') return {data:{role:'admin'},error:null};
      leituras.push({origem,tabela});
      if(tabela === 'clinica_feature_flags') return {data:{ativo:true},error:null};
      if(tabela !== 'nina_cat_servicos') throw Error('Tabela inesperada: '+tabela);
      if(filtros.id!==id || filtros.clinica_id!==clinica) throw Error('Escopo incorreto');
      if(escrita) {escritas.push({tabela,escrita});editorial={...editorial,...escrita};}
      return {data:editorial,error:null};
    },
    then(resolve,reject){return Promise.resolve(ausente ? {data:null,error:{code:'42P01',message:'relation missing'}} : {data:tabela==='nina_cat_servicos'?[editorial]:[],error:null}).then(resolve,reject)}
  }; return q;
}};
mock.module('@tanstack/react-start',()=>({createServerFn:()=>{
  let validar = i=>i; const q={middleware:()=>q,inputValidator:f=>{validar=f;return q},handler:fn=>arg=>fn({data:validar(arg.data),context:{supabase:db,userId:'operador'}})};return q;
}}));
mock.module('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
mock.module('@/integrations/supabase/client.server',()=>({supabaseAdmin:db}));
const {lerFonteOperacional,limparCacheFonteOperacional}=await import('../fonte-operacional.server');
const {salvarServicoCatalogo,listarCatalogoNina}=await import('../catalogo.functions');
origem='atendimento'; const antes=await lerFonteOperacional(clinica);
origem='administracao';
const resultado=await salvarServicoCatalogo({data:{clinicaId:clinica,id,publicar:true,dados:{nome:'Exame de teste',valor:999}}});
limparCacheFonteOperacional();
origem='atendimento'; const depois=await lerFonteOperacional(clinica);
ausente=true; let erro='';
try { await listarCatalogoNina({data:{clinicaId:clinica}}); } catch(e) {erro=e.message;}
console.log(JSON.stringify({antes,depois,resultado,editorial,leituras,escritas,erro}));
`;

test("publicar a base editorial não muda a fonte operacional da Maria", async () => {
  const p = Bun.spawn([process.execPath, "--eval", codigo], {
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  expect(exitCode, stderr).toBe(0);
  const r = JSON.parse(stdout.trim());
  expect(r.resultado.status).toBe("PUBLICADO");
  expect(r.editorial.valor).toBe(999);
  expect(r.antes.servicos).toHaveLength(1);
  expect(r.depois).toEqual(r.antes);
  expect(r.escritas.map((e: any) => e.tabela)).toEqual(["nina_cat_servicos"]);
  expect(
    r.leituras
      .filter((l: any) => l.origem === "atendimento")
      .some((l: any) => l.tabela.startsWith("nina_cat_")),
  ).toBe(false);
  expect(r.erro).toContain("Os dados da base não estão disponíveis neste ambiente");
}, 20_000);
