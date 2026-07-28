# Checkup do Cartao Beneficios - Menino de Jesus

Data: 24/07/2026  
Clinica: Policlínica Menino Jesus  
`clinica_id`: `7570ddde-8c1c-4b55-ba72-cf12b2a6c940`  
Convenio: Cartao Consulta + Seguros  
`convenio_id`: `4fdce541-5b2b-4816-ba7d-911b36741b7d`  
Modo: auditoria somente leitura. Nenhum dado, regra, migration, RPC ou tela foi alterado.

## 1. Resumo executivo

O sistema possui uma estrutura capaz de representar boa parte das regras do
Cartao Consulta + Seguros, incluindo precos por forma de pagamento, carencia
por mensalidades pagas, limite por contrato, excedente com desconto sobre o
particular, gratuidade e tolerancia de inadimplencia.

O principal problema nao e falta de campos. As regras financeiras ainda
dependem demais do navegador e da configuracao manual, enquanto o backend aceita
valores, parcelas, status de pagamento, dependentes e autoria enviados pelo
cliente sem recalcular tudo a partir do convenio da Menino de Jesus.

Conclusao: o motor atual e flexivel, mas ainda nao e uma autoridade financeira
segura. Antes de ampliar o uso, o backend deve passar a validar contrato,
cobranca e elegibilidade de forma transacional e escopada por `clinica_id`.

## 2. Classificacao do pedido

- Regra de negocio: precos, carencias, limites, dependentes e renovacao.
- Inconsistencia de dados: duas fontes de beneficios e migrations destrutivas.
- Permissao, seguranca e RLS: backend aceita operacoes de qualquer membro da
  clinica em pontos financeiros relevantes.
- Integracao externa: boletos, seguro, funeral, telemedicina e clube.
- Documentacao: informativo ainda contradiz regras corrigidas.
- Performance: nao foi identificado gargalo critico nesta rodada.

## 3. Escopo e limitacoes

Foram analisados codigo TypeScript, telas que gravam dados, RPCs, triggers,
policies e migrations locais. Nao foram executados agendamentos, pagamentos,
renovacoes, baixas, boletos ou alteracoes de configuracao.

O banco informado pelo colaborador esta no Lovable Cloud. O workspace nao
contem o ID de projeto Lovable exigido pelo conector de consulta. Nao foi
possível confirmar com segurança os valores e regras atualmente gravados no
banco de producao. As conclusoes sobre dados reais estao marcadas como
"validar no Lovable Cloud".

## 4. Achados prioritarios

### P0 - Backend confia em dados financeiros enviados pelo navegador

Evidencia:

- `src/components/pages/contratos-page.tsx:1340-1388`
- `supabase/migrations/20260722174109_26ae62a9-326d-4bc4-9de8-84fe8e33e17e.sql`

A RPC `criar_contrato_assinatura` recebe e grava `_valor_mensal`,
`_taxa_adesao`, `_num_parcelas`, `_mensalidades`, status, `pago_em`,
`valor_pago` e `_criado_por`. Ela valida que o usuario pertence a clinica, mas
nao recalcula os valores pela faixa do convenio e nao substitui `_criado_por`
por `auth.uid()`.

Impacto:

- um cliente adulterado pode enviar valor, quantidade ou status incorretos;
- mensalidades podem nascer como pagas e antecipar beneficios;
- a autoria de criacao pode ser informada pelo proprio cliente;
- o convenio informado nao e validado como ativo e pertencente a mesma clinica.

Correcao recomendada: criar uma RPC financeira autoritativa que receba apenas
identificadores e opcoes de negocio. O banco deve buscar convenio/faixa, contar
vidas, calcular vigencia, taxa, parcelas e vencimentos, e usar `auth.uid()`.

### P0 - Migrations historicas apagam contratos e financeiro

Evidencia:

- `supabase/migrations/20260601131522_897c66b5-9996-4554-9fc3-2e0c45c9a3e5.sql`
- `supabase/migrations/20260711003420_1ce18887-b2bb-48a6-9d51-88eb092c3623.sql`
- `supabase/migrations/20260711040121_ab9f9e34-9bac-4178-acb9-71534fc70f51.sql`

A primeira executa `DELETE` de todos os contratos da clinica
`7570ddde-8c1c-4b55-ba72-cf12b2a6c940`. As outras removem mensalidades,
boletos, dependentes, contratos e lancamentos identificados como teste.

Impacto:

- viola a politica atual de imutabilidade financeira;
- torna uma reconstrucao do banco dependente de exclusoes irreversiveis;
- pode ter causado perda historica se aplicada sobre dados validos.

Correcao recomendada: nao editar migration ja aplicada sem estrategia formal.
Auditar o historico do Lovable Cloud e backups. Em uma futura baseline, separar
limpeza de teste de migrations de schema e exigir aprovacao explicita.

### P1 - Qualquer membro da clinica pode operar pontos financeiros

Evidencia:

- policies iniciais em
  `supabase/migrations/20260517035235_9fb7b695-4f29-420a-9a2e-6a69aa9af882.sql`
- verificacao apenas com `is_member` em `criar_contrato_assinatura`
- funcoes de renovacao em
  `supabase/migrations/20260717194103_32f786a2-bd8b-4ac6-9e03-d2a0ae7f0224.sql`

As telas consultam permissao de escrita, mas o banco usa principalmente
pertencimento a clinica. Um usuario autenticado pode tentar chamar RPCs ou a
Data API sem passar pela interface.

Correcao recomendada: exigir permissao especifica de contratos/financeiro no
backend, revisar `EXECUTE` das funcoes e aplicar `WITH CHECK` nas policies de
UPDATE relevantes.

### P1 - Dependentes nao obedecem a regra conjuge e filhos

Evidencia:

- `src/lib/contrato-dependentes.ts`
- trigger em
  `supabase/migrations/20260713132555_ec912af9-d19b-4442-8d27-b16bedb8d021.sql`
- campo livre em `src/components/clientes/paciente-cartoes-beneficios.tsx:332`

O trigger protege limite, duplicidade, titular como proprio dependente e
contrato cancelado. Ele nao valida parentesco nem se o paciente pertence a
Menino de Jesus. `parentesco` e texto livre e a propria interface sugere
"Pai/Mae".

Possível regra de negócio — validar com a equipe da clínica: definir os valores
aceitos para conjuge e filhos, incluindo ou excluindo companheiro(a), enteado(a),
filho sob guarda e variacoes de genero.

Correcao recomendada: catalogo normalizado de parentescos e validacao no banco
ativada apenas para o convenio da Menino de Jesus.

### P1 - Pagamento anual a vista nao existe no fluxo de contratacao

Evidencia:

- `src/components/pages/contratos-page.tsx:1154`
- `src/components/pages/contratos-page.tsx:1340-1388`

O novo contrato oferece apenas `boleto`, `carne` ou nenhuma selecao e sempre
gera `convenio.num_parcelas` mensalidades. Nao ha opcao que gere uma cobranca
anual unica quitando o ciclo de 12 meses.

Impacto: uma modalidade expressamente prevista no contrato nao pode ser
registrada de forma consistente.

### P1 - Prorrogacao automatica e apenas texto contratual

Evidencia:

- informativo em `src/components/cartao-beneficios/informativo-seed.ts`
- renovacao manual em `src/components/contratos/renovar-contrato-dialog.tsx`
- RPCs `renovar_contrato_extensao` e `renovar_contrato_troca_plano`

A renovacao atual exige acao manual e, na extensao, todas as mensalidades pagas.
Nao foi localizada rotina automatica que prorrogue vigencia ou gere o novo
ciclo.

Possível regra de negócio — validar com a equipe da clínica: "prorrogado
automaticamente" pode significar continuidade juridica do contrato ou tambem
geracao automatica de novas cobrancas. O backend precisa de uma definicao
unica.

### P1 - Fonte antiga contradiz o preco fixo de R$ 9,99

Evidencia:

- migration
  `supabase/migrations/20260614020234_e54aae08-5436-4bb1-9521-6fffb6327ce0.sql`
- telas legadas
  `src/routes/_authenticated/app.cartao-beneficios.beneficios.tsx`
  e `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`
- agenda usa `cb_convenio_regras` em `src/routes/_authenticated/app.agenda.tsx:585`

Uma migration antiga converteu consultas de R$ 9,99 para R$ 9,99 em dinheiro e
R$ 12,00 em outros meios dentro de `cb_beneficios`. Isso contradiz a regra
atual de R$ 9,99 sem variacao. A agenda ignora essa tabela, mas duas telas ainda
leem e gravam nela.

Correcao recomendada: declarar `cb_convenio_regras` como unica fonte
operacional, migrar somente dados validos e retirar a escrita legada de forma
controlada.

### P1 - Carencia nao exige claramente a taxa de adesao paga

Evidencia:

- `src/lib/cb-regras.ts`
- contagem de mensalidades pagas em `src/routes/_authenticated/app.agenda.tsx`

O motor usa `carencia_mensalidades`, mas a liberacao e baseada em mensalidades
pagas. A regra da Menino de Jesus exige primeira mensalidade mais taxa de
inscricao. Nao foi localizada verificacao conjunta da parcela de adesao
`numero_parcela = 0`.

Impacto: o paciente pode ter beneficio liberado com a mensalidade paga e a
adesao pendente.

### P1 - Preco e limite sao calculados principalmente fora do banco

Evidencia:

- `src/lib/cb-regras.ts`
- `src/routes/_authenticated/app.agenda.tsx`
- `src/lib/agenda/criar-agendamento.functions.ts`

O servidor de agendamento valida paciente, horario e inadimplencia, mas recebe
do caller o tipo de atendimento e nao recalcula a regra completa do Cartao
Beneficios em uma RPC central. Isso aumenta a chance de divergencia entre
agenda, caixa, procedimentos e futuras telas.

Correcao recomendada: uma funcao backend de cotacao deve retornar regra
aplicada, valor por forma de pagamento, carencia, cota, excedente e motivo.

### P2 - Boleto de R$ 3,50 esta hardcoded no frontend

Evidencia:

- `src/components/pages/contratos-page.tsx:142`
- calculo em `src/components/pages/contratos-page.tsx:1340`
- emissao manual em `src/lib/boleto.functions.ts`

A taxa e somada pelo navegador, nao pela configuracao do convenio nem pelo
backend. A RPC aceita o valor ja acrescido. Isso permite omissao, aplicacao em
outra clinica e futura duplicidade quando houver integracao bancaria real.

Correcao recomendada: configurar a taxa por convenio/clinica e calcular uma
unica vez no backend, registrando base e tarifa separadamente.

### P2 - Contrato ignora `vigencia_meses` na criacao

Evidencia: `src/components/pages/contratos-page.tsx:132-138` e `:1375`.

O fluxo usa `addUmAno(dataInicio)` mesmo existindo `vigencia_meses`. Para a
Menino de Jesus o resultado esperado e 12 meses, mas a implementacao e
inconsistente com o cadastro e pode afetar outros convenios.

### P2 - Assinatura publica pode ser substituida com o mesmo token

Evidencia:

- `contrato_publico` e `assinar_contrato_publico` na migration inicial de
  contratos.

`assinado_em` preserva a primeira data, mas `assinatura_svg` e
`assinatura_ip` podem ser atualizados novamente por quem conhece o token.
Isso enfraquece a evidencia contratual.

Correcao recomendada: assinatura imutavel depois da primeira confirmacao, com
hash, versao do documento e log de auditoria.

### P2 - Informativo ainda divulga regras antigas

Evidencia: `src/components/cartao-beneficios/informativo-seed.ts`.

O texto ainda afirma limite de uma consulta diaria por contrato e nao explica
que a segunda consulta custa 50% do particular. Tambem exibe somente R$ 60 e
R$ 80 na franquia diferenciada, omitindo R$ 72 e R$ 95 para cartao/PIX.

Impacto: recepcao e paciente podem seguir uma regra diferente da configurada.

### P2 - Seguro, funeral, telemedicina externa e clube sao informativos

Evidencia:

- template e informativo do contrato;
- buscas por regras operacionais e cobranca automatica.

Nao foi localizado backend que:

- valide 14 a 69 anos para seguro;
- valide ate 69 anos para funeral e telemedicina externa;
- gere 50% da telemedicina na mensalidade seguinte;
- garanta que somente o titular seja enviado ao clube.

Se esses servicos forem administrados integralmente por terceiros, registrar
essa fronteira formalmente. Caso o sistema deva controlar elegibilidade ou
cobranca, a automacao esta ausente.

## 5. Matriz das regras de negocio

| Regra | Suporte no sistema | Situacao |
|---|---|---|
| Adesao unica R$ 30 | Campo e parcela avulsa `0` | Validar valor real no Lovable Cloud |
| Vigencia de 12 meses | Data final de um ano | Atende MJ, mas ignora configuracao |
| Prorrogacao automatica | Renovacao manual | Inconsistente |
| Somente conjuge e filhos | Parentesco livre | Nao aplicado |
| Pagamento anual a vista | Nao localizado | Ausente |
| 12x carne/boleto | Suportado | Presente |
| R$ 3,50 por boleto | Hardcoded no navegador | Fragil |
| Faixas de 1 a 6 pessoas | Estrutura `cb_convenio_faixas` | Validar dados reais |
| Primeira consulta R$ 9,99 | Motor suporta valor fixo | Validar regra viva; legado contradiz |
| Segunda consulta com 50% do particular | Motor suporta excedente percentual | Depende da configuracao |
| Franquia R$ 60/72 e R$ 80/95 | Motor suporta dinheiro e cartao/PIX | Validar configuracao |
| Franquia sem limite | `limite_qtd = null` | Depende da configuracao |
| Seguro/funeral por idade | Apenas texto | Nao automatizado |
| Telemedicina interna | Pode usar tabela comum | Sem fluxo especifico confirmado |
| Telemedicina externa a 50% | Apenas texto | Cobranca automatica ausente |
| Clube somente titular | Apenas texto | Integracao nao confirmada |
| Descontos apos 2a mensalidade | `carencia_mensalidades` | Suportado por configuracao |
| Gratuidade apos 6a mensalidade | `gratuito` e carencia | Suportado por configuracao |
| Um exame anual por contrato/titular | Limite anual e grupo | Suportado por configuracao |
| Exclusoes absolutas | Dependem do cadastro de regras | Sem bloqueio central confirmado |
| Tolerancia de 5 dias corridos | RPC central retorna bloqueio apos o 5o dia | Implementado corretamente |

## 6. Pontos positivos confirmados

- Criacao de contrato, dependentes, mensalidades e adesao ocorre em uma unica
  transacao.
- Existe lock contra contrato titular duplicado por duplo clique.
- O trigger de dependentes protege duplicidade, limite e titular.
- A taxa de adesao e representada separadamente como parcela `0`.
- Taxas de inclusao usam parcelas negativas e nao contaminam o contador mensal.
- Renovacao por troca de plano recebe `_cobrar_taxa_adesao: false` na interface,
  preservando a regra de adesao unica nesse fluxo.
- `cb_convenio_regras` suporta dinheiro e cartao/PIX separadamente.
- O motor suporta excedente `percentual_particular`, adequado para a segunda
  consulta com 50% de desconto.
- O motor suporta grupos de gratuidade compartilhados.
- A inadimplencia usa cinco dias corridos e bloqueia apenas a partir do sexto.
- A RPC de inadimplencia exige `clinica_id` e verifica pertencimento.

## 7. Decisoes que precisam da clinica

1. Possível regra de negócio — validar com a equipe da clínica: quais
   parentescos equivalem oficialmente a conjuge e filhos.
2. Possível regra de negócio — validar com a equipe da clínica: prorrogacao
   automatica gera cobrancas automaticamente ou apenas mantem o vinculo.
3. Possível regra de negócio — validar com a equipe da clínica: agendamento
   pendente ja consome a cota diaria ou apenas atendimento pago/realizado.
4. Possível regra de negócio — validar com a equipe da clínica: pagamento anual
   libera imediatamente as carencias de 2a e 6a mensalidade ou segue o tempo
   cronologico do contrato.
5. Confirmar se seguro, funeral, clube e telemedicina externa sao apenas
   informativos no sistema ou devem gerar controle e cobranca.

## 8. Ordem segura de correcao

1. Consultar e exportar a configuracao real do Lovable Cloud, sem alteracao.
2. Criar testes de caracterizacao das regras atuais da Menino de Jesus.
3. Criar RPC autoritativa de cotacao e contratacao, escopada por `clinica_id`.
4. Fortalecer permissoes, autoria e validacoes cruzadas de tenant.
5. Aplicar parentesco permitido no backend com configuracao exclusiva da MJ.
6. Consolidar `cb_convenio_regras` e encerrar escrita em `cb_beneficios`.
7. Implementar pagamento anual e definir renovacao automatica.
8. Centralizar tarifa de boleto e liberacao por adesao paga.
9. Corrigir informativo e contrato somente depois das regras operacionais.
10. Integrar ou declarar formalmente como externos seguro, funeral, clube e
    telemedicina.

## 9. Validacao desta auditoria

- Busca cruzada em `src`, `supabase/migrations`, `docs` e `mem`.
- Leitura das funcoes de contrato, renovacao, dependentes, regras e agenda.
- Conferencia dos IDs da Menino de Jesus no codigo e nas migrations.
- Conferencia da tolerancia de inadimplencia e do motor de excedentes.
- Nenhuma escrita no banco ou teste de producao.
- O projeto Supabase consultado inicialmente foi descartado por orientacao do
  colaborador e nao foi usado como evidencia.
- A consulta Lovable Cloud nao foi concluida porque o ID do projeto Lovable nao
  esta salvo no workspace. Nao foi possível confirmar com segurança a
  configuracao real em producao.

## 10. Antes, depois e pendencias

**Antes:** os achados estavam distribuidos entre codigo, migrations e analises
de conversa, sem uma referencia unica para a Menino de Jesus.

**Depois:** existe este relatorio consolidado, priorizado e rastreavel, sem
alteracao do comportamento do sistema.

**Validacao:** arquivo criado a partir de evidencias locais e revisao somente
leitura.

**Pendencias:** consulta ao banco correto do Lovable Cloud, confirmacoes
funcionais da clinica e aprovacao explicita antes de qualquer migration ou
alteracao financeira.
