import {describe, expect, it} from 'bun:test';
import {podeEncerrarConversa} from '../perfil-atendimento';
describe('encerramento por responsável ou supervisão',()=>{
  it('admin e supervisão encerram sem assumir a conversa de outra atendente',()=>{
    expect(podeEncerrarConversa({userId:'admin',responsavelId:'ana',admin:true,gestor:false})).toBe(true);
    expect(podeEncerrarConversa({userId:'gestor',responsavelId:'ana',admin:false,gestor:true})).toBe(true);
  });
  it('supervisão pode encerrar conversa sem responsável',()=>{
    expect(podeEncerrarConversa({userId:'gestor',responsavelId:null,admin:false,gestor:true})).toBe(true);
  });
  it('atendente comum encerra somente sua própria conversa',()=>{
    expect(podeEncerrarConversa({userId:'ana',responsavelId:'ana',admin:false,gestor:false})).toBe(true);
    expect(podeEncerrarConversa({userId:'bia',responsavelId:'ana',admin:false,gestor:false})).toBe(false);
    expect(podeEncerrarConversa({userId:'bia',responsavelId:null,admin:false,gestor:false})).toBe(false);
  });
  it('ausência de usuário nunca autoriza a ação',()=>{
    expect(podeEncerrarConversa({userId:null,responsavelId:null,admin:true,gestor:true})).toBe(false);
  });
});

it('núcleo registra quem encerrou sem trocar a autoria da atendente responsável',()=>{
  const fixture=new URL('./fixtures/encerramento-auditoria.fixture.ts',import.meta.url);
  const r=Bun.spawnSync([process.execPath,decodeURIComponent(fixture.pathname).replace(/^\/(\w:)/,'$1')]);
  expect(r.exitCode).toBe(0);
});
