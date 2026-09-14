# Distribuição de conversas do Zap OS

A distribuição usa a escolha manual de presença. Heartbeat, troca de aba e inatividade não tornam alguém online ou offline.

## Capacidade e seleção

Sem configuração individual nem limite legado de departamento, a capacidade é **sem limite**. A gestão pode configurar de 1 a 1000 conversas ou escolher “Sem limite”, pelo botão **Limites da equipe** na caixa de entrada do Zap OS.

O limite individual prevalece sobre os limites legados de departamento. Reduzir o limite não remove conversas em andamento: bloqueia somente novas atribuições enquanto a carga estiver no limite ou acima dele. A carga inclui conversas reais abertas (`waiting`, `active`, `in_progress`).

O banco escolhe entre membros ativos com perfil Telefonia, presença manual ONLINE, sem pausa aberta e sem bloqueio de fila. Administradores não recebem distribuição automática. Entre os elegíveis, prioriza menor carga e depois maior tempo sem atribuição. Um setor sem candidato com capacidade usa os demais candidatos elegíveis, conforme o comportamento de fallback já previsto no simulador.

Somente conversas reais, abertas, sem responsável, com propriedade humana/NONE e IA desativada entram na fila. Handoff e resumo continuam como evidência histórica; sua ausência não impede distribuir uma conversa que já pertence à fila humana. Conversas de teste, da Nina e resolvidas ficam fora dessa distribuição operacional.

## Eventos e recuperação

O mesmo núcleo SQL atende os seguintes eventos:

- escolha de ONLINE e término de pausa;
- encerramento de uma conversa ou liberação de capacidade;
- alteração do limite individual;
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
bun test src/lib/atendimento/__tests__ src/lib/nina/redistribuicao-fila.test.ts src/components/nina/distribuicao-fila-ui.test.ts
bun run typecheck
```

O job `distribuicao-zap` no GitHub Actions executa os testes reais de banco independentemente das demais verificações do projeto.

## Publicação e reversão

A migration deve ser aplicada antes da versão nova do aplicativo; as assinaturas legadas mantêm a compatibilidade durante essa ordem de publicação. Conferir o registro em `supabase_migrations.schema_migrations`, os privilégios dos novos objetos e o agendamento do job.

Se for necessário reverter, primeiro suspender o job de recuperação e restaurar a versão anterior das funções e gatilhos a partir da definição capturada antes da publicação. Preservar as tabelas novas de auditoria e capacidade. Reverter o frontend isoladamente não restaura a regra antiga do banco. Atribuições legítimas já realizadas não devem ser removidas por uma reversão de código.
