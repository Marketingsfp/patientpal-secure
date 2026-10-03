import {mock} from 'bun:test';
import assert from 'node:assert/strict';
mock.module('@/lib/nina/espera-paciente.server',()=>({limparEsperaPaciente:async()=>{}}));
const {resolverConversaCore}=await import('../../resolver-conversa.server');
for(const actor of ['admin','supervisor']) {
 let update:any=null,event:any=null;
 const db={from(table:string){
  const q:any={select(){return q},eq(){return q},async maybeSingle(){return {data:{atribuida_user_id:'ana',last_assigned_user_id:'ana',nina_fluxo_estado:null,protocolo_atendimento:'MJ-1'}}},update(value:any){update=value;return q},async insert(value:any){event=value;return {error:null}}};
  return q;
 },async rpc(){return {data:null,error:null}}};
 await resolverConversaCore(db,{clinicaId:'clinica',conversaId:'conversa',userId:actor,adiarResumo:true});
 assert.equal(update.resolved_by,actor);
 assert.equal(update.last_assigned_user_id,'ana');
 assert.equal(update.atribuida_user_id,null);
 assert.equal(event.user_id,actor);
 assert.equal(event.detalhes.resolvido_por,actor);
 assert.equal(event.detalhes.ultimo_atendente,'ana');
 assert.equal(event.detalhes.automatico,false);
}
console.log('Autoria do encerramento validada com banco simulado.');
