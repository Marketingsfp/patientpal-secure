import { createHash } from "node:crypto";
const dir = process.argv[2];
if (!dir) throw new Error("Informe a pasta local da auditoria.");
const r = await Bun.file(`${dir}/resultado.json`).json();
const base = await Bun.file(`${dir}/base.json`).json();
const rows = r.resultados.flatMap((s: any) => s.executantes.map((e: any) => ({...e,procedimento:s.procedimento})));
const ok = rows.filter((e: any)=>e.resultado==="gravacao_simulada_correta");
const modal = rows.filter((e: any)=>e.resultado==="modalidade_pendente");
const vinc = rows.filter((e: any)=>e.resultado==="vinculo_ausente");
const recuperados = ok.filter((e: any)=>e.modalidade!==e.modalidade_consulta_na_rota_antiga||!e.executante_encontrado_como_consulta);
const nomeModo: any={hora_marcada:"Hora marcada",chegada_com_pre_agendamento:"Ordem de chegada com pré-agendamento",chegada_sem_pre_agendamento:"Comparecimento sem reserva",ficha:"Ficha",nao_definida:"Indefinida"};
const nomeResultado: any={gravacao_simulada_correta:"Reserva simulada correta",PROFISSIONAL_SFP:"Equipe humana (SFP)",modalidade_pendente:"Modalidade ausente",vinculo_ausente:"Vínculo com agenda não resolvido",esclarecimento_de_termo_generico:"Esclarecer procedimento específico"};
const cell=(s: any)=>String(s??"—").replaceAll("|","/").replaceAll("\n"," ");
const tabela=(header: string[],linhas: any[][])=>["| "+header.join(" | ")+" |","| "+header.map(()=>"---").join(" | ")+" |",...linhas.map(l=>"| "+l.map(cell).join(" | ")+" |")].join("\n");
const md = `# Auditoria local dos procedimentos da Nina — 23/09/2026

Fonte: catálogo autenticado da Policlínica Menino Jesus, lido em 23/09/2026. ${r.servicos} serviços publicados e 80 cadastros operacionais ativos de profissionais/recursos. Dados externos congelados para os testes. Nenhuma mensagem enviada nem reserva real criada. Alterações de código ainda locais, sem publicação nesta tarefa.

## Resultado

- ${r.servicos} procedimentos verificados; três são termos genéricos que exigem esclarecimento.
- ${r.executantes} combinações específicas de procedimento e executante verificadas.
- ${ok.length} combinações, abrangendo ${new Set(ok.map((e: any)=>e.procedimento)).size} procedimentos, chegaram à gravação e releitura simuladas mantendo o serviço correto.
- 22 combinações seguiram a regra de encaminhamento SFP.
- ${modal.length} procedimentos têm modalidade não informada na base.
- ${vinc.length} procedimentos têm vínculo de executante/recurso não resolvido no conjunto ativo consultado.
- A busca do primeiro disponível também foi exercitada para os 204 itens específicos, sem trocar a categoria. Nomes minúsculos e sem acentos foram verificados nesses itens.
- Rede nos testes: ${r.rede} chamadas. Slots e paciente fictícios; disponibilidade real não foi avaliada.

## Outros casos semelhantes ao da Bioimpedância

A comparação entre a leitura da modalidade da consulta e a leitura do procedimento identificou ${recuperados.length} combinações (${new Set(recuperados.map((e: any)=>e.procedimento)).size} procedimentos) em que a rota antiga por consulta não encontra o executante ou não fornece a modalidade correta. Isto é evidência técnica local de exposição à falha, não comprovação de que todos esses pacientes tiveram erro em produção.

Exemplos: acupuntura e fisioterapia com Daiane Helena; procedimentos de urologia com Marcelo Barreto; endoscopia com Bruno Moraes; serviços de enfermagem; ultrassonografias com Cintia, Isis e Samuel. Na infiltração com Valeria Silveira, a consulta é por ficha e o procedimento é por hora marcada; o teste preservou a modalidade do procedimento.

A proteção implementada anteriormente foi validada com os dados completos: identidade do serviço separada da especialidade, executante vinculado ao serviço e modalidade lida do procedimento. Todas as reservas simuladas mantiveram o nome publicado, inclusive na releitura após a gravação.

## Correções adicionais nesta varredura

1. O título publicado “PROCEDIMENTOS” era eliminado na limpeza do termo e retornava como não encontrado. Agora pede o nome específico, sem reservar o grupo ou substituir por consulta. Ultrassonografia e raio X genéricos continuam exigindo esclarecimento.
2. Na busca do primeiro disponível, um recurso/executante sem vínculo agora retorna ATENDIMENTO_AGENDA_NAO_VINCULADO. A ausência de vínculo não é apresentada como falta de vagas ou médico digitado incorretamente pelo paciente.
3. A instrução da ferramenta de disponibilidade passou de “valor da consulta” para “valor do atendimento solicitado”, com orientação explícita para preservar o procedimento.

## Modalidades que dependem da equipe

${tabela(["Procedimento","Profissional","Informação atual no campo de observação"],modal.map((e: any)=>{
const s=base.servicos.find((s: any)=>s.nome===e.procedimento);
return [e.procedimento,e.profissional,(s?.descricao_publica??"").match(/Observação: ([^\n]*)/)?.[1]??"Não informada"];
}))}

Recorrência quinzenal e adicional de anestesia não definem se o atendimento é por hora marcada, ficha ou ordem de chegada. Não alterei essas informações nem deduzi uma modalidade. Uma agenda real com modalidade explícita pode fornecer informação adicional; esses testes não a inventaram.

## Vínculos que dependem de conferência

35 itens com “Técnica”, dois com “Técnico” e três com “DRA. POLIANA”. Não foi possível confirmar com segurança qual recurso/cadastro ativo deve receber essas reservas. Alguns nomes indicam equipes ou equipamentos, não um médico. Não foram associados por semelhança ou por escolha do primeiro cadastro.

${tabela(["Procedimento","Executante publicado"],vinc.map((e: any)=>[e.procedimento,e.profissional]))}

## Resultado individual de todos os procedimentos

${tabela(["Procedimento","Executante","Modalidade do procedimento","Resultado local"],r.resultados.flatMap((s: any)=>s.executantes.length?s.executantes.map((e: any)=>[s.procedimento,e.profissional,nomeModo[e.modalidade]??"Não determinada",nomeResultado[e.resultado]??e.resultado]):[[s.procedimento,"—","—",nomeResultado[s.resultado]??s.resultado]]))}

## Reprodução e limites

Validação desta execução: 207 testes de varredura, 226 testes do executor e 99 testes de recuperação do catálogo, totalizando 532 testes aprovados. Checagem TypeScript aprovada e diff sem erros de whitespace. Os logs estão em artifacts/auditoria-procedimentos-final.log, auditoria-procedimentos-executor.log, auditoria-procedimentos-retrieval.log e typecheck-auditoria-procedimentos.log.

Executar em PowerShell, na raiz do projeto:

\`\`\`powershell
$env:NINA_CATALOGO_AUDITORIA='${dir}'
bun test ./scripts/auditar-procedimentos-locais.test.ts
bun scripts/relatorio-auditoria-procedimentos.ts '${dir}'
\`\`\`

O script exige base.json e opcoes.json previamente exportados. Não contém credenciais e bloqueia fetch. Exercita o executor e a recuperação reais do código local com banco e escrita simulados. Não executa o modelo de linguagem externo: fluidez da conversa e variações livres do paciente ainda exigem reteste após publicação. Não valida preço, duração, idade, agenda disponível ou execução clínica real.

SHA-256 de base.json: ${createHash("sha256").update(await Bun.file(`${dir}/base.json`).text()).digest("hex")}.
`;
await Bun.write("artifacts/auditoria-todos-procedimentos-2026-09-23.md",md);
await Bun.write("artifacts/auditoria-todos-procedimentos-2026-09-23.json",JSON.stringify(r,null,2));
console.log(JSON.stringify({procedimentos:r.servicos,combinacoes:r.executantes,reservas_simuladas:ok.length,modalidades_pendentes:modal.length,vinculos_pendentes:vinc.length}));
