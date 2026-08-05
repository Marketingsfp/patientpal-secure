# Contexto do sistema PatientPal Secure / Health Hub Pro / ClinicaOS

## Escopo da análise

Este documento consolida o histórico de prompts do Lovable em **09/07/2026 no fuso America/Sao_Paulo (UTC−3)** e a estrutura observável do repositório local. O período disponível vai de **07:43 a 22:46 no horário de São Paulo** (10:43 de 09/07 a 01:46 de 10/07 em UTC). Foram identificadas **394 mensagens**, sendo **158 solicitações do usuário**, **197 respostas do assistente** e **100 mensagens associadas a edições de código**.

Importante: o histórico comprova que mudanças foram solicitadas e que o agente gerou edições. Ele não comprova, sozinho, que todas as mudanças foram validadas em produção ou que permaneceram intactas após alterações posteriores.

## Visão geral do produto

O PatientPal Secure, exibido no Lovable como **Health Hub Pro**, é um sistema de gestão de clínicas com forte integração entre operação assistencial e financeiro. Os principais domínios percebidos são:

- agenda e agendamentos;
- pacientes, médicos, funcionários e clínicas;
- serviços, procedimentos, especialidades, convênios e atendimento particular;
- orçamento e faturamento;
- caixa, movimentos financeiros, baixas, estornos e repasses médicos;
- impressão de GR/Guia de Atendimento e comprovantes;
- auditoria, permissões e rastreabilidade;
- estoque, contratos e notificações, conforme a descrição geral do projeto.
- prontuário, RH, CRM, cartão de benefícios e atendimento via WhatsApp/Nina.

O fluxo central do sistema é altamente encadeado: **agenda → ficha/GR → atendimento → pagamento/caixa → baixa → repasse → auditoria**. Uma inconsistência em qualquer etapa tende a aparecer em vários módulos.

## Arquitetura técnica observada

- Front-end/full-stack em React 19, TypeScript, TanStack Start e TanStack Router.
- Vite e Nitro no runtime/build.
- Supabase para banco de dados, autenticação, realtime e políticas de acesso.
- TanStack Query para dados no cliente.
- React Hook Form e Zod para formulários e validação.
- Radix UI, Tailwind CSS e componentes próprios para interface.
- Geração/impressão de documentos com código próprio e jsPDF.
- Migrações SQL extensas em `supabase/migrations`.

### Identificadores e infraestrutura

- Repositório compartilhado: `github.com/Marketingsfp/patientpal-secure`.
- Branch principal: `main`.
- Projeto Lovable: `9cab2db5-e9b1-4209-b352-fc7a438da482`.
- Aplicação publicada: `https://patientpal-secure.lovable.app`.
- Supabase project ref: `odllhxwadsrnhphzoevl`.
- Hospedagem/backend operacional informado: Lovable Cloud + Supabase.

### Fluxo de desenvolvimento concorrente

O projeto é alterado tanto localmente quanto pelo editor do Lovable. O Lovable sincroniza automaticamente com o GitHub por commits do bot, portanto `origin/main` pode avançar durante uma sessão local. O GitHub é a fonte de verdade compartilhada entre os dois fluxos.

Regras operacionais documentadas:

1. Executar `git fetch origin` antes de qualquer push.
2. Integrar `origin/main` sem force push e sem sobrescrever mudanças do Lovable.
3. Conferir conflitos reais antes de resolvê-los.
4. Executar `npx tsc --noEmit` antes de commit em mudanças TypeScript.
5. Repetir fetch, integração e push caso o remoto avance novamente.

## Bug prioritário atual: numeração da ficha na agenda

### Regra funcional confirmada

A coluna **Ficha** deve ser um contador único por dia e por clínica, compartilhado por todos os profissionais: `001, 002, 003...`, em ordem cronológica de `inicio`, sem reiniciar por médico ou `agenda_id`, sem saltos e sem duplicações na lista.

O arquivo central é `src/routes/_authenticated/app.agenda.tsx`, rota `/app/agenda`, com mais de 5.300 linhas. A tela contém paginação, filtros e os modos “Lista” e “Por médico”. Foi confirmado que o bug ocorre no modo “Lista”, no mesmo bloco que usa `fichaPorId.get(a.id)`; a hipótese de uma versão `agenda-v2` ou caminho de renderização alternativo foi descartada.

### Tentativas já realizadas

1. Uso preferencial do `ficha_numero` persistido, com fallback posicional. Falhou porque misturava duas réguas: fichas persistidas apenas para pacientes reais e posição calculada incluindo slots livres.
2. Contador posicional agrupado por `agenda_id`. Falhou porque um profissional pode possuir vários `agenda_id` no mesmo dia.
3. Contador agrupado por `medico_id`. Funcionou com filtro de um médico, mas duplicou `001` na lista geral porque cada profissional reiniciava a sequência.
4. Estado documentado como atual: contador particionado somente por dia, sem `medico_id` ou `agenda_id`, aplicado em:
   - `app.agenda.tsx`, cálculo `fichaPorId`;
   - `src/lib/print-gr.ts`, guia individual;
   - `src/lib/print-gr.ts`, guia agrupada.

A quarta tentativa também adicionou filtro por `clinica_id` nos fallbacks de impressão, evitando contagem cruzada entre clínicas.

### Divergência entre código e aplicação executada

O documento registra que o código local e `origin/main` estavam idênticos, e que o Lovable apontava o mesmo commit como `latest_commit_sha`. Apesar disso, o preview continuava exibindo exatamente o comportamento da terceira tentativa: sequência reiniciada por profissional.

Isso torna mais provável um bundle/cache desatualizado do que uma nova falha na lógica fonte. A prioridade de diagnóstico é comprovar qual código o navegador está executando:

1. Fazer novo `git fetch` para confirmar que o remoto não avançou.
2. Executar o projeto localmente e reproduzir a agenda geral na mesma data.
3. Comparar com o app publicado após hard refresh.
4. Verificar no Network/DevTools o bundle JavaScript efetivamente carregado.
5. Se reproduzir localmente, inspecionar o array `items` antes de `fichaPorId` em busca de IDs duplicados ou cargas duplicadas.

Não se deve reabrir como primeira hipótese a existência de outro modo de renderização: essa linha de investigação já foi descartada com evidência concreta.

## Temas dominantes do dia 09/07/2026

### 1. Agenda, ficha e concorrência

O maior problema estrutural foi manter o mesmo número de ficha entre agenda, GR e financeiro. Houve relatos de GR impressa com um número e agenda exibindo outro, duplicação/substituição incorreta de fichas e divergência de ordem.

Foram solicitados:

- congelamento do número da ficha no momento da impressão;
- persistência de `ficha_numero` no banco;
- sincronização entre agenda, impressão e financeiro;
- ordenação da ficha conforme a agenda;
- bloqueio concorrente para impedir dois funcionários de usarem o mesmo slot/ficha simultaneamente;
- liberação correta do slot após desmarcação ou estorno;
- alerta quando outro funcionário estiver usando o mesmo número da agenda.

### 2. Financeiro, caixa, baixas e estornos

Foi a área com mais solicitações. O histórico mostra forte acoplamento entre `agendamentos`, atendimentos, lançamentos financeiros e movimentos de caixa.

Principais demandas:

- estornar pelo menu Mov. Caixa;
- restringir estorno a Admin, Gestor e Financeiro;
- registrar estorno na Auditoria;
- desfazer baixa de atendimento;
- tratar ficha de valor zero que não gera movimento de caixa tradicional;
- remover limite fixo de 500 linhas e paginar 100 por página;
- exibir o usuário responsável em todas as linhas de pagamentos agrupados;
- permitir baixa múltipla e ações em lote;
- diferenciar visualmente atendimentos baixados e pendentes;
- corrigir pagamento/recebimento em grupo e impressão de comprovantes;
- permitir alteração manual do valor de repasse;
- corrigir divergência entre valor do prestador na GR e valor exibido em Financeiro > Atendimentos.

### 3. GR, segunda via e impressão

A GR é um artefato operacional e financeiro crítico. As solicitações reforçam que ela precisa refletir o estado histórico do pagamento, e não valores padrão atuais.

Foram trabalhados:

- número da ficha correto e estável;
- manutenção da forma de pagamento na segunda via;
- correção de casos em que cartão de débito reaparecia como dinheiro;
- impressão integral em negrito;
- responsividade do cupom de 80 mm;
- ajuste para nomes, procedimentos, valores e pagamentos mistos longos;
- criação de comprovante de agendamento separado da GR;
- comprovante de repasse em A4.

### 4. Serviços, especialidades, laboratório e orçamento

O modelo funcional depende de vínculos coerentes entre serviço, procedimento, especialidade, médico e convênio.

Demandas recorrentes:

- orçamento de laboratório deve listar todos os serviços da especialidade Laboratório;
- buscas como “glicose” não podem colapsar resultados homônimos;
- agendamentos de laboratório sem serviço devem exibir “EXAMES LABORATORIAIS”, nunca “CONSULTA”;
- aba Especialidade do médico deve mostrar apenas serviços vinculados à especialidade selecionada;
- aba Repasse deve listar automaticamente os serviços cadastrados na Especialidade;
- inclusão manual deve continuar disponível;
- seleção/inclusão de vários serviços de uma vez;
- opção de atendimento particular no orçamento.

### 5. Pagamento no agendamento

O histórico distingue dois conceitos que antes estavam misturados:

- tipo de atendimento: particular ou convênio/cartão-benefício;
- forma de pagamento: dinheiro, PIX, crédito ou débito.

Foi solicitado um campo separado de “Forma de pagamento prevista” no wizard de criação/edição de agendamento. Também houve correções para que o faturamento de laboratório abra primeiro a seleção de método e valores, em vez de faturar diretamente.

### 6. Cadastros, permissões e experiência de uso

Foram relatados ajustes em cadastro de funcionário, edição de médico, permissões e layout:

- telefone obrigatório sem campo visível no cadastro de funcionário;
- scroll interno no diálogo de edição de médico;
- botões alinhados na mesma linha;
- coluna de ficha antes da data;
- redução da largura de médico/data e aumento da largura do paciente;
- ano com dois dígitos na tabela financeira;
- perfis e visibilidade de ações sensíveis.

### 7. Desempenho e capacidade

Houve intenção de suportar **1.000 usuários simultâneos**. O histórico registra:

- consulta à saúde do Supabase;
- mudança/confirmacão de compute Large;
- otimizações de busca de pacientes com trigram;
- índice composto para agenda;
- discussão de teste de carga com ramp-up de 5 minutos, 1.000 usuários e hold de 5 minutos;
- recuo para endpoints públicos devido ao risco de testar login em produção e aos limites de autenticação.

Não há evidência suficiente no histórico de que um teste completo e representativo de 1.000 usuários autenticados tenha sido concluído.

### 8. Auditoria ampla após entrada em produção

No fim do dia, o usuário informou que o sistema havia sido colocado em produção em 09/07 e que ocorreram falhas críticas sequenciais. Foram solicitadas duas linhas de trabalho:

- análise profunda como arquiteto de software, especialista em segurança e auditor de sistemas críticos;
- levantamento histórico de capturas, pedidos de correção e prompts contendo “erro” ou “errado”, sem aplicar novas correções naquele momento.

Também foi solicitado consolidar um “cluster A” em relatório A1–A5 apenas para levantamento. Isso indica uma mudança de postura no final do dia: de correções rápidas e sucessivas para diagnóstico estruturado de regressões e confiabilidade.

## Leitura arquitetural do domínio

O sistema deve tratar os seguintes registros como fontes de verdade distintas, mas relacionadas:

- **Agendamento:** reserva de horário, paciente, médico/laboratório, serviço, convênio/particular e ficha.
- **Atendimento:** execução operacional e estado de baixa.
- **Pagamento/lançamento:** valor, método, parcelas/agrupamento e responsável.
- **Movimento de caixa:** efeito financeiro auditável, inclusive estorno.
- **Repasse:** obrigação financeira com o prestador, derivada da regra de repasse e não necessariamente do valor bruto.
- **GR/comprovante:** fotografia histórica dos dados no momento da emissão.
- **Auditoria:** quem fez, quando fez, entidade afetada e valores antes/depois.

Os incidentes de 09/07 indicam que parte do sistema ainda recalculava ou reconstruía dados históricos a partir do estado atual. Para documentos, estornos e repasses, o desenho mais seguro é persistir snapshots e identificadores explícitos no momento da transação.

## Riscos identificados

1. **Regressão por volume de mudanças:** 94 edições associadas a mensagens em cerca de 13 horas é um ritmo alto para um sistema em produção.
2. **Acoplamento financeiro:** exclusão, baixa e estorno podem atingir entidades diferentes; ações precisam de semântica explícita e transações atômicas.
3. **Duplicidade de fontes de verdade:** ficha, forma de pagamento e valor de repasse aparecem em mais de um módulo.
4. **Ausência de prova de validação:** edição concluída pelo Lovable não equivale a teste de integração, homologação ou validação em produção.
5. **Migrações numerosas:** o grande volume de migrações aumenta o risco de schema drift e regras duplicadas.
6. **Permissões:** estorno, alteração de repasse e baixa em lote exigem verificação no backend/RLS, não apenas ocultação de botão.
7. **Carga em produção:** teste de 1.000 usuários no ambiente publicado pode afetar pacientes e funcionários reais.

## Contexto recomendado para futuras alterações

Antes de alterar qualquer fluxo crítico:

1. Mapear o fluxo completo e todas as tabelas afetadas.
2. Definir claramente a fonte de verdade de ficha, pagamento e repasse.
3. Preservar histórico: não recalcular segunda via com defaults atuais.
4. Usar transação para faturar, baixar, estornar ou liberar slot.
5. Registrar auditoria com ator, ação, entidade, antes/depois e correlação.
6. Aplicar autorização no banco/backend e refletir a permissão no front-end.
7. Testar os cenários: particular, convênio, laboratório, valor zero, pagamento misto, pagamento agrupado, estorno e segunda via.
8. Validar concorrência de agenda com duas sessões simultâneas.
9. Executar build, lint e testes direcionados antes de publicar.
10. Fazer mudanças pequenas e observáveis, evitando vários fluxos financeiros no mesmo lote.

## Estado percebido ao final de 09/07

O sistema estava em fase intensa de estabilização operacional. Agenda, ficha, GR, financeiro e repasses receberam várias correções e melhorias no mesmo dia. O produto já cobria boa parte da rotina clínica, mas os prompts revelam inconsistências principalmente nas transições entre módulos e em operações reversíveis. A prioridade técnica deveria ser consolidar invariantes de domínio, testes de integração e auditoria antes de continuar adicionando funcionalidades em ritmo elevado.
