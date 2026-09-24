/** Auditoria offline: catálogo e opções exportados, nenhuma dependência externa real. */
import { afterAll, expect, mock, test } from "bun:test";
import { estadoVazio } from "../src/lib/nina/fluxo-estado-normalizar";
import { aceitarResumoEntregue } from "../src/lib/nina/agendamento-escolha";
import { separarAtendimentos } from "../src/lib/nina/catalogo-estrutura";
import { interpretarModalidade } from "../src/lib/nina/modalidade-atendimento";
import { profissionalSfp } from "../src/lib/nina/regras-catalogo";
import type { CtxNinaPaciente } from "../src/lib/nina/paciente-tools.server";

const dir = process.env.NINA_CATALOGO_AUDITORIA;
if (!dir) throw new Error("Informe NINA_CATALOGO_AUDITORIA com base.json e opcoes.json exportados. Somente leitura local.");
const base = await Bun.file(`${dir}/base.json`).json();
const opcoes = await Bun.file(`${dir}/opcoes.json`).json();
const CLINICA = "11111111-1111-4111-8111-111111111111";
const PACIENTE = "44444444-4444-4444-8444-444444444444";
const RESERVA = "55555555-5555-4555-8555-555555555555";
const inicio = new Date(Date.now() + 2 * 86400000); inicio.setUTCHours(17, 0, 0, 0);
const fim = new Date(+inicio + 30 * 60000);
type Row = Record<string, any>;
let banco: Record<string, Row[]>;
let escritas: Row[] = [];
const resultados: Row[] = [];
let rede = 0;
globalThis.fetch = (() => { rede++; throw new Error("Rede proibida na auditoria local"); }) as typeof fetch;

mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from(tabela: string) {
    if (["audit_log", "nina_kb_consultas"].includes(tabela)) return { insert: async () => ({ error: null }) };
    if (!banco[tabela]) throw new Error(`Tabela não simulada: ${tabela}`);
    const pred: ((r: Row) => boolean)[] = [];
    let n = Infinity, start = 0, ordem: string | null = null, asc = true, update: Row | null = null, campos = "";
    const ler = () => {
      let rows = banco[tabela]!.filter(r => pred.every(p => p(r)));
      if (ordem) rows = rows.toSorted((a,b) => String(a[ordem!]).localeCompare(String(b[ordem!])) * (asc ? 1 : -1));
      rows = rows.slice(start, start+n);
      if (update) rows.forEach(r => Object.assign(r, update));
      return rows.map(r => campos.includes("aliases:estrutura->aliases") ? {...r, aliases:r.estrutura?.aliases} : r);
    };
    const q: any = {
      select: (s: string) => { campos = s; return q; }, eq: (k: string,v: any) => {pred.push(r=>r[k]===v);return q;},
      neq: (k: string,v: any) => {pred.push(r=>r[k]!==v);return q;}, in: (k: string,v: any[]) => {pred.push(r=>v.includes(r[k]));return q;},
      is: (k: string,v: any) => {pred.push(r=>(r[k]??null)===v);return q;},
      gt: (k: string,v: any) => {pred.push(r=>r[k]>v);return q;}, lt: (k: string,v: any) => {pred.push(r=>r[k]<v);return q;},
      gte: (k: string,v: any) => {pred.push(r=>r[k]>=v);return q;}, lte: (k: string,v: any) => {pred.push(r=>r[k]<=v);return q;},
      ilike: (k: string,v: string) => { const re = new RegExp('^'+v.split('%').map(s=>s.replace(/\\([%_\\])/g,'$1').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$','i');pred.push(r=>re.test(String(r[k]??'')));return q;},
      not: (k: string,_: string,v: string) => {pred.push(r=>!v.replace(/[()]/g,'').split(',').includes(String(r[k])));return q;},
      or: () => q, order: (k: string,o?: {ascending?: boolean}) => {ordem=k;asc=o?.ascending!==false;return q;},
      limit: (v: number) => {n=v;return q;}, range: (a: number,b: number) => {start=a;n=b-a+1;return q;},
      update: (v: Row) => {update=v;return q;}, maybeSingle: async () => ({data:ler()[0]??null,error:null}),
      then: (resolve: any,reject: any) => Promise.resolve().then(()=>({data:ler(),error:null})).then(resolve,reject),
    }; return q;
  },
}}));
mock.module("@/lib/agenda/criar-agendamento.core.server", () => ({ criarAgendamentoCore: async (_: any, entrada: any) => {
  escritas.push(entrada.payload);
  const index = banco.agendamentos!.findIndex(r=>r.id===entrada.editing_id);
  const linha = {...banco.agendamentos![index],...entrada.payload,id:RESERVA};
  if(index>=0) banco.agendamentos![index]=linha; else banco.agendamentos!.push(linha);
  return {ok:true,id:RESERVA};
}}));

const { executarFerramentaPaciente: executar } = await import("../src/lib/nina/paciente-tools.server");
const { modalidadePublicadaDoMedico } = await import("../src/lib/nina/vinculo-catalogo-agenda.server");
const { candidatosPrimeiraVaga } = await import("../src/lib/nina/primeiro-disponivel-catalogo.server");
const { buscarNoCatalogo } = await import("../src/lib/nina/catalogo-retrieval.server");
const servicos = base.servicos.filter((s: Row) => s.status === "PUBLICADO");
function preparar(s: Row): CtxNinaPaciente {
  const medicos = opcoes.medicos.map((m: Row)=>({...m,clinica_id:CLINICA,ativo:true}));
  banco = {
    nina_cat_servicos: servicos.map((r: Row)=>({...r,clinica_id:CLINICA})),
    nina_cat_profissionais:base.profissionais.map((r: Row)=>({...r,clinica_id:CLINICA})),
    medicos, especialidades:opcoes.especialidades, medico_agendas:[], nina_mensagens_templates:[],
    medico_disponibilidades: medicos.map((m: Row)=>({clinica_id:CLINICA,medico_id:m.id,ativo:true,dia_semana:inicio.getUTCDay(),hora_inicio:"13:00",hora_fim:"18:00"})),
    agendamentos:medicos.map((m: Row)=>({id:`vaga-${m.id}`,clinica_id:CLINICA,medico_id:m.id,inicio:inicio.toISOString(),fim:fim.toISOString(),paciente_nome:"DISPONIVEL",status:"confirmado"})),
  };
  escritas=[];
  const estado=estadoVazio(); estado.session_id="auditoria-local";
  Object.assign(estado.patient,{id:PACIENTE,identified:true,validated:true});
  return {clinicaId:CLINICA,telefone:null,pacienteId:PACIENTE,pacienteNome:"Paciente Fictício",conversaId:null,
    origem:"homologacao",teste:true,podeAgendar:true,estado,
    consultaAgenda:{mensagemAtual:`Quero ${s.nome}`,historico:[]}};
}
for (const s of servicos) test(`${s.nome}: identidade, executantes, modalidade e reserva`, async () => {
  const ctx=preparar(s);
  const linha: Row={id:s.id,procedimento:s.nome,executantes:[],retrieval:null}; resultados.push(linha);
  const pesquisa=await executar(ctx,"consultar_base_conhecimento",{termo:s.nome,tipo_atendimento:"exame_procedimento"});
  linha.retrieval={ok:pesquisa.ok,encontrado:pesquisa.found,esclarecimento:pesquisa.esclarecimento,ids:(pesquisa.records as Row[]|undefined)?.map(r=>r.id)};
  expect(pesquisa.ok,JSON.stringify(pesquisa)).toBe(true);
  expect((pesquisa.records as Row[]).every(r=>r.tipo==="servico")).toBe(true);
  if (pesquisa.esclarecimento) {
    linha.resultado="esclarecimento_de_termo_generico";
    expect(["ULTRASSONOGRAFIA","RAIO X","PROCEDIMENTOS"]).toContain(s.nome);
    expect(ctx.estado!.appointment.procedimento_solicitado).toBeUndefined();
    expect(ctx.estado!.appointment.slot_options).toBeNull();
    expect(escritas).toHaveLength(0);
    return;
  }
  expect(linha.retrieval.ids).toContain(s.id);
  for (const termo of [s.nome.toLowerCase(), s.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()]) {
    const variante=await buscarNoCatalogo({clinicaId:CLINICA,query:termo,tipo_atendimento:"exame_procedimento"});
    expect(variante.records.map(r=>r.id)).toContain(s.id);
    expect(variante.esclarecimento).toBeUndefined();
  }
  expect(ctx.estado!.appointment.procedimento_solicitado?.catalogo_id).toBe(s.id);
  const candidatos=await candidatosPrimeiraVaga(CLINICA,"procedimento",[{registro:s.id,procedimento:s.nome}]);
  const sfp=(s.executantes??[]).some((e: Row)=>profissionalSfp(e.nome));
  for (const e of candidatos) {
    const c=preparar(s);
    await executar(c,"consultar_base_conhecimento",{termo:s.nome,tipo_atendimento:"exame_procedimento"});
    const item: Row={profissional:e.medicoNome,medico_id:e.medicoId}; linha.executantes.push(item);
    if(sfp) { const r=await executar(c,"consultar_primeiro_disponivel",{tipo:"procedimento",atendimento:s.nome});item.resultado=r.erro;expect(r.erro).toBe("PROFISSIONAL_SFP");continue; }
    const auxiliar=await executar(c,"buscar_medicos",{nome:e.medicoNome,especialidade:"Consulta"});
    item.busca_auxiliar={ok:auxiliar.ok,esclarecimento:auxiliar.esclarecimento};
    expect(auxiliar.tipo_atendimento,JSON.stringify(auxiliar)).toBe("exame_procedimento");
    if(!e.medicoId) {item.resultado="vinculo_ausente";expect(escritas).toHaveLength(0);continue;}
    item.modalidade=await modalidadePublicadaDoMedico(CLINICA,e.medicoId,{atendimento:s.nome,procedimentoId:s.id});
    item.modalidade_consulta_na_rota_antiga=await modalidadePublicadaDoMedico(CLINICA,e.medicoId);
    const buscaAntiga=await buscarNoCatalogo({clinicaId:CLINICA,query:e.medicoNome,medico:e.medicoNome,tipo_atendimento:"consulta"});
    item.executante_encontrado_como_consulta=buscaAntiga.found;
    const blocos=separarAtendimentos(s.descricao_publica).filter(b=>b.profissional===e.medicoNome);
    item.modalidade_publicada=[...new Set(blocos.map(b=>s.estrutura?.complementos?.find((x: Row)=>x.chave===b.chave)?.modalidade??interpretarModalidade(b.observacoes)).filter(Boolean))];
    const vagas=await executar(c,"proxima_vaga",{medico_id:e.medicoId});
    item.disponibilidade={ok:vagas.ok,erro:vagas.erro,codigo:vagas.codigo};
    if(item.modalidade==="chegada_sem_pre_agendamento") {item.resultado="comparecimento_sem_reserva";expect(vagas.sem_agendamento).toBe(true);expect(escritas).toHaveLength(0);continue;}
    if(!item.modalidade || item.modalidade==="nao_definida") {item.resultado="modalidade_pendente";expect(vagas.ok).toBe(false);expect(escritas).toHaveLength(0);continue;}
    expect(vagas.ok,JSON.stringify(vagas)).toBe(true);
    const vaga=c.estado!.appointment.slot_options!.vagas[0]!;
    expect(vaga.procedimento).toBe(s.nome);
    c.consultaAgenda!.mensagemAtual=vaga.hora;
    const resumo=await executar(c,"selecionar_horario",vaga);
    expect(resumo.ok,JSON.stringify(resumo)).toBe(true);
    expect(aceitarResumoEntregue(c.estado!,CLINICA,[{role:"assistant",content:String(resumo.resumo_confirmacao)}])).toBe(true);
    const reserva=await executar(c,"agendar",{...vaga,procedimento:s.nome});
    item.resultado=reserva.ok?"gravacao_simulada_correta":reserva.erro;
    expect(reserva.ok,JSON.stringify(reserva)).toBe(true);
    expect(escritas).toHaveLength(1);
    expect(escritas[0]!.procedimento).toBe(s.nome);
    expect(banco.agendamentos!.find(r=>r.id===RESERVA)?.procedimento).toBe(s.nome);
  }
  // Rota de primeiro disponível também deve conservar a categoria e relatar
  // pendências sem escolher silenciosamente outro atendimento/profissional.
  const primeiroCtx=preparar(s);
  await executar(primeiroCtx,"consultar_base_conhecimento",{termo:s.nome,tipo_atendimento:"exame_procedimento"});
  const primeiro=await executar(primeiroCtx,"consultar_primeiro_disponivel",{tipo:"procedimento",atendimento:s.nome});
  linha.primeiro_disponivel={ok:primeiro.ok,erro:primeiro.erro,codigo:primeiro.codigo};
  if(sfp) expect(primeiro.erro).toBe("PROFISSIONAL_SFP");
  else if(candidatos.some(e=>!e.medicoId)) expect(primeiro).toMatchObject({ok:false,codigo:"ATENDIMENTO_AGENDA_NAO_VINCULADO",comparacao_completa:false});
  else if(linha.executantes.every((e: Row)=>e.resultado==="gravacao_simulada_correta")) expect(primeiro.ok,JSON.stringify(primeiro)).toBe(true);
  if(primeiro.ok) for(const v of primeiroCtx.estado!.appointment.slot_options?.vagas??[]) {
    expect(v.procedimento).toBe(s.nome); expect(v.catalogo_id).toBe(s.id); expect(v.tipo_atendimento).toBe("exame_procedimento");
  }
  expect(escritas).toHaveLength(0);
  if(!candidatos.length) linha.resultado="sem_executantes";
  expect(rede).toBe(0);
}, 30000);
afterAll(async()=>{
  const saida={coletado_em:new Date().toISOString(),fonte:dir,servicos:servicos.length,executantes:resultados.flatMap(r=>r.executantes).length,rede,resultados};
  await Bun.write(`${dir}/resultado.json`,JSON.stringify(saida,null,2));
  console.log("AUDITORIA_RESUMO="+JSON.stringify({servicos:saida.servicos,executantes:saida.executantes,rede,
    resultados:resultados.flatMap(r=>r.executantes).reduce((a: Row,r: Row)=>(a[r.resultado??"falha_teste"]=(a[r.resultado??"falha_teste"]??0)+1,a),{})}));
});
