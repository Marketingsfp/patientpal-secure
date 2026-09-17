# Distribuição de conversas do Zap OS

A distribuição usa a escolha manual de presença. Heartbeat, troca de aba e inatividade não tornam alguém online ou offline.

## Capacidade e seleção

Online recebe diretamente em **Ativas**, sem limite. Pausa recebe na sua fila individual **Não atribuídas**, até **10 conversas**. Offline não recebe novas conversas. Não existe prioridade entre Online e Pausa.

O balanceamento considera a soma de ativas e reservas individuais abertas (`waiting`, `active`, `in_progress`). O teto de 10 considera somente reservas ainda não respondidas. Empates usam a atribuição mais antiga e depois o identificador do usuário. Limites configuráveis antigos não participam mais da seleção: os registros históricos são preservados, o controle saiu da tela e o RPC legado recusa novas configurações explicitamente.

O banco escolhe entre membros ativos com perfil Telefonia, presença manual ONLINE ou PAUSA com espaço e sem bloqueio de fila. Administradores não recebem distribuição automática. Um setor sem candidato elegível usa os demais candidatos elegíveis, preservando a regra de setor anterior. Heartbeat e logs legados de pausa não substituem a escolha manual.

Uma reserva mantém `atribuida_user_id` como responsável pelo acesso e `fila_pendente=true` como estado da fila. Voltar a Online, abrir a conversa ou receber outra mensagem do paciente não a move para Ativas. A primeira mensagem humana registrada como enviada (`sent`, `delivered` ou `read`) após a reserva limpa a marca. Falhas de envio e mensagens da Nina ou do sistema não a limpam. Finalização, retorno à Nina e transferência explícita encerram a reserva anterior.

Atendentes veem suas próprias reservas na aba Não atribuídas. A supervisão acessa **Não atribuídas global** pelo seletor e acompanha reservas da equipe pela visão por atendente. Quando ninguém está elegível, a conversa fica sem responsável nessa fila global. Tornar-se Online/Pausa com espaço ou liberar uma vaga retoma a distribuição. Filtros no servidor, cache, links e Realtime usam a mesma distinção; uma política RLS também restringe o acesso às conversas reservadas.

Somente conversas reais, abertas, sem responsável, com propriedade humana/NONE e IA desativada entram na fila. Handoff e resumo continuam como evidência histórica; sua ausência não impede distribuir uma conversa que já pertence à fila humana. Conversas de teste, da Nina e resolvidas ficam fora dessa distribuição operacional.

## Eventos e recuperação

O mesmo núcleo SQL atende os seguintes eventos:

- escolha de ONLINE ou PAUSA e término de pausa;
- encerramento de uma conversa ou liberação de capacidade;
- primeira resposta humana que libera uma vaga da fila individual;
- pedidos legados de distribuição e atribuição de handoff;
- recuperação periódica pelo job `zap-os-recuperar-fila-humana`, a cada minuto.

O lote limita atribuições bem-sucedidas, não interrompe a busca após cinco tentativas sem candidato. Registros já travados por outra transação são ignorados nessa rodada e ficam para a próxima. A recuperação usa o pg_cron já instalado; em um novo ambiente sem essa extensão, sua ausência deve ser resolvida antes da publicação.

## Contratos e consistência

`atend_definir_presenca_manual` confirma a presença, sua versão, o histórico e uma única rodada de distribuição na mesma transação. O usuário altera apenas sua própria presença na clínica autorizada. Uma versão antiga é recusada, e entrar/sair de pausa não passa transitoriamente por ONLINE.

As novas respostas distinguem `concluida`, `bloqueada`, `pendente` e `erro`, com total distribuído, pendentes e motivo. A tela confirma separadamente a presença salva e o resultado da distribuição. A consulta de diagnóstico é somente leitura.

Uma trava por clínica, a revalidação da presença e travas nas conversas impedem atribuições duplicadas. Gatilhos que já possuem uma trava de linha não aguardam a trava da clínica em ordem inversa: deixam a recuperação retomar o trabalho. Falhas de distribuição não desfazem uma presença ou encerramento que já foram gravados pelo evento originador.

As assinaturas legadas `atend_distribuir_fila(...)->integer` e `atend_auto_assign_conversa(...)->uuid` continuam disponíveis. As tabelas de capacidade e auditoria têm RLS e escrita restrita às funções autorizadas. `atend_capacidade_auditoria` guarda antes/depois; `atend_distribuicao_execucoes` registra o resultado de cada tentativa. Não há alteração retroativa de histórico.

## Verificação

Os testes de PostgreSQL executam as funções e gatilhos da migration em um cluster descartável. O script não aceita URL de banco: cria um socket local privado, desativa conexões TCP e usa somente dados sintéticos. Também executa transações distintas sobrepostas para verificar concorrência e conflito de versão.

```sh
python3 scripts/test-zap-distribuicao-postgres.py --pg-bin "$(pg_config --bindir)"
python3 scripts/test-zap-fila-individual-postgres.py --pg-bin "$(pg_config --bindir)"
bun test src/lib/atendimento/__tests__ src/lib/nina/redistribuicao-fila.test.ts src/components/nina/distribuicao-fila-ui.test.ts
bun run typecheck
```

O job `distribuicao-zap` no GitHub Actions executa os testes reais de banco independentemente das demais verificações do projeto.

A correção da duplicidade foi validada em PostgreSQL 18.6 local: 19 cenários de fila/compatibilidade e 8 de leitura operacional aprovados. A verificação cobre repetição sem escrita, preservação de uma implementação posterior, auditoria de histórico sintético, recusa de objetos incompletos, balanceamento, permissões e concorrência. Não equivale à validação do histórico do banco remoto nem à execução de toda a cadeia do Supabase.

## Publicação e reversão

A definição canônica da fila é `20260917144041_b618961f-ac79-4d95-977a-1eac1d3541fa.sql`, registrada pelo Lovable no commit `bee18720f`. Seu SQL foi preservado. O arquivo `20260917230000_zap_fila_individual_pausa.sql` originalmente repetia essa definição; agora mantém somente uma verificação de compatibilidade, sem DDL, DML ou escrita no histórico de migrações. Os dois identificadores permanecem no repositório para não apagar o histórico de ambientes que já os registraram.

Em uma instalação nova, a migração canônica cria os objetos e a entrada posterior confere coluna, índice, funções, gatilhos e política restritiva/RLS. O aplicativo só deve ser servido depois das migrações e da conferência do job de recuperação. Nenhuma conversa antiga é redistribuída pela migração. O teste de fila individual executa a sequência, repete a verificação em transação somente leitura e compara definições, privilégios, conversas, presenças e eventos antes/depois.

### Reconciliação por ambiente

Primeiro execute `scripts/sql/auditar-zap-fila-individual.sql` no banco correto, com acesso administrativo de leitura. O script não contém dados de pacientes e não altera o banco. A evidência observada no Lovable indica aplicação em 17/09/2026; não substitui a consulta do histórico de cada ambiente.

| Histórico observado | Procedimento |
| --- | --- |
| Nenhum dos dois IDs | Aplicar as migrações em ordem: a canônica cria, a entrada posterior verifica. |
| Somente `20260917144041` | A canônica já foi executada. A entrada `20260917230000` agora pode seguir normalmente, apenas verificando os objetos. |
| Ambos os IDs | Não reaplicar SQL nem apagar/regravar entradas do histórico. A alteração do arquivo posterior não será executada novamente pelo controle de versões. |
| Somente `20260917230000` | Histórico invertido: não executar automaticamente a canônica, pois os objetos podem já existir. Comparar as definições instaladas com a versão canônica e as migrações posteriores, executar a verificação somente leitura e só então reconciliar o ID anterior pelo procedimento oficial de repair do Supabase. Nunca marcar como aplicada uma alteração não comprovada nem remover o ID original. |
| Coluna/objetos ausentes ou incompatíveis | Parar e diagnosticar o objeto e a versão faltante. A verificação não recria nem sobrescreve objetos para ocultar a divergência. |

Esta correção foi feita nos arquivos e testada em PostgreSQL descartável. Não alterou `supabase_migrations.schema_migrations` nem executou SQL no banco real. A publicação ainda exige enviar os arquivos corrigidos e conferir o histórico do ambiente antes de aplicar as migrações pendentes.

Reversão desta correção de duplicidade: não há dados a desfazer. Preserve a migração canônica e os registros aplicados. Não restaure o SQL duplicado para execução; se a verificação apontar uma divergência, corrija especificamente a causa em uma migração nova e revisada.

Se for necessário reverter, primeiro suspender o job de recuperação e restaurar a versão anterior das funções e gatilhos a partir da definição capturada antes da publicação. Preservar as tabelas novas de auditoria e capacidade. Reverter o frontend isoladamente não restaura a regra antiga do banco. Atribuições legítimas já realizadas não devem ser removidas por uma reversão de código.
