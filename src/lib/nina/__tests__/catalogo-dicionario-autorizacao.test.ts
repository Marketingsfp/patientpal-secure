import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("geração exige gestão da clínica, não escreve e revalida acesso após o modelo", async () => {
  const codigo = `
import { mock } from 'bun:test';
const clinica = '11111111-1111-4111-8111-111111111111';
let role = 'admin', revogar = false, chamadas = 0, escritas = 0;
const banco = {from(tabela) {
  if (tabela !== 'clinica_memberships') throw Error('Leitura inesperada');
  const filtros = {};
  const q = {select(){return q}, eq(k,v){filtros[k]=v;return q},
    insert(){escritas++;throw Error('Escrita proibida')},update(){escritas++;throw Error('Escrita proibida')},
    async maybeSingle(){return {data: filtros.clinica_id === clinica && filtros.user_id === 'operador' && filtros.ativo === true && role ? {role} : null,error:null}}};
  return q;
}};
mock.module('@tanstack/react-start',()=>({createServerFn:()=>{
  let validar = i=>i; const q={middleware:()=>q,inputValidator:f=>{validar=f;return q},handler:fn=>arg=>fn({data:validar(arg.data),context:{supabase:banco,userId:'operador'}})};return q;
}}));
mock.module('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
mock.module('@/lib/nina/catalogo-dicionario.server',()=>({
  comLimiteDicionario:(_id,f)=>f(),
  gerarDicionarioComIA:async()=>{chamadas++;if(revogar)role='telefonia';return {variacoes:[],duvidas:[],modelo:'openai/gpt-6-astra'}}
}));
const {gerarVariacoesCatalogoIA}=await import('../catalogo.functions');
const data={clinicaId:clinica,contexto:{tipo:'servico',nome:'Exame teste',descricao:'',especialidades:[],aliases:[]}};
const capturar=async d=>{try{await gerarVariacoesCatalogoIA({data:d});return 'ok'}catch(e){return e.message}};
const admin=await capturar(data);
role='gestor';const gestor=await capturar(data);
role='telefonia';const telefonia=await capturar(data);
role='admin';const outra=await capturar({...data,clinicaId:'22222222-2222-4222-8222-222222222222'});
revogar=true;const revogado=await capturar(data);
console.log(JSON.stringify({admin,gestor,telefonia,outra,revogado,chamadas,escritas}));
`;
  const p = Bun.spawn([process.execPath, "--eval", codigo], {
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  expect(exit, stderr).toBe(0);
  const r = JSON.parse(stdout.trim());
  expect(r.admin).toBe("ok");
  expect(r.gestor).toBe("ok");
  expect(r.telefonia).toContain("Apenas administradores");
  expect(r.outra).toContain("Sem acesso");
  expect(r.revogado).toContain("Apenas administradores");
  expect(r.chamadas).toBe(3);
  expect(r.escritas).toBe(0);
}, 20000);
