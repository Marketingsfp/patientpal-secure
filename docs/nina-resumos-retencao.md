# Resumos internos da Nina: sete dias

Regra solicitada em 20/09/2026, para todas as clínicas.

## Antes e depois

Antes, o card podia reaproveitar um resumo arquivado como vigente. A transcrição
misturava ciclos e os resumos não tinham exclusão automática. Resolver a conversa
removia apenas pendências que coincidissem com algumas palavras de agendamento.

Agora, motivo, situação, pendências e próxima ação pertencem ao último atendimento.
O bloco **Mensagens anteriores** apresenta a última versão válida de cada atendimento
anterior, com data/hora de seu registro em São Paulo e descrição do que ocorreu.
O histórico não transporta pendências ou próximas ações para o atendimento atual.
Uma reabertura ainda sem resumo novo pode mostrar somente esse histórico.

Cada resumo vence **168 horas após `handoff_em`**, o instante do handoff/desfecho
que originou aquela versão. `updated_at`, abrir o chat e gerar novamente não
prorrogam esse prazo. Ao vencer, o servidor não o entrega e o cache da tela o
remove, mesmo com o chat aberto; foco/retorno à aba também revalida o prazo.

O job PostgreSQL `nina-resumos-retencao-7-dias` executa a cada minuto, excluindo
fisicamente os registros vencidos em `atend_handoff_resumos` e limpando a cópia
operacional legada `atend_conversas.handoff_resumo` quando seu handoff venceu.
A exclusão física acontece na primeira execução após o vencimento, sem depender
do navegador. Falha do job não autoriza o servidor/tela a mostrar dados vencidos.

Resolver o atendimento remove todas as pendências, próxima ação e etapa/pergunta
interrompida de seus resumos, inclusive em versões superadas. Isso acontece no
banco, sem depender de uma resposta bem-sucedida da IA. Ao gerar novamente, a
instrução também exige retirar itens já respondidos ou realizados nas mensagens.
Pendências ainda não resolvidas desaparecem quando o resumo completa sete dias.

## Contexto, concorrência e segurança

- `atendimento_inicio` identifica o ciclo a partir da criação, reabertura/reset
  auditados e início da sessão Nina. Não usa ordenação dos cards nem inferência da IA.
- A transcrição usa somente o último ciclo e os últimos sete dias. Preserva a
  entrada que provocou a abertura quando ela foi gravada antes do início da sessão,
  respeitando o encerramento anterior. O recorte de tamanho prioriza mensagens finais.
- O histórico é montado na leitura: seu texto não é copiado para um resumo novo,
  o que renovaria indevidamente a retenção.
- A reserva do resumo é atômica por conversa, com versão monotônica preservada
  pelos eventos já existentes. Retry antigo não recria conteúdo vencido nem
  substitui um desfecho mais recente.
- Escrita da IA usa o estado reivindicado e só pode gravar uma versão ainda ativa
  e no prazo. Geração atrasada não ressuscita conteúdo removido/resolvido.
- O agendamento real usa as colunas existentes e o ID reservado pela sessão quando
  disponível, inclusive para vagas criadas antes do atendimento.
- RPCs novas são restritas a `service_role`. A leitura da tela continua exigindo
  autorização para a conversa e isolamento por clínica; RLS não foi ampliada.
- Mensagens originais, agendamentos, cadastros, financeiro e eventos de auditoria
  permanecem intactos. A política trata dos resumos derivados, não desses registros.

## Migração e operação

Arquivo: `supabase/migrations/20260920130000_nina_resumos_retencao_sete_dias.sql`.
Adiciona uma coluna de ciclo e um índice temporal à tabela de resumos, funções de
reserva/contexto/limpeza, proteção contra gravação tardia e trigger de resolução
na conversa. A primeira limpeza roda na própria transação de implantação.

Aplicada via Cloud SQL em 20/09/2026 e registrada em `supabase_migrations`.
Conferência inicial: 147 resumos; 72 vencidos excluídos, restando 75. Foram limpas
41 cópias operacionais vencidas. Depois: zero resumos/cópias vencidos e zero resumos
resolvidos com pendências. Rotina ativa com periodicidade de um minuto.

A publicação do aplicativo é necessária para a nova apresentação do card e o
novo fluxo do servidor. Esta implantação de banco não publica o projeto Lovable.

Rollback de comportamento: pausar o job pelo nome e reverter o aplicativo de
forma coordenada. Exclusões autorizadas são definitivas; pausar/reverter não
restaura os resumos. Mensagens originais continuam disponíveis. A migração é
reexecutável, sem duplicar o job nem modificar datas originais dos resumos.

## Validação

- Testes Bun: TTL exato, histórico separado, pendências resolvidas/vencidas,
  contexto limitado, vaga preexistente, entrada que abre a sessão e gerações
  concorrentes com expiração, resolução e reabertura.
- Regressões de normalização, handoff único, agendamento e reabertura de sessão.
- PostgreSQL local isolado: exclusão física, preservação de mensagens/agenda/eventos,
  idempotência, datas imutáveis, resolução sem IA, escrita atrasada, novo ciclo,
  versão monotônica, privilégios e agendamento do job.
- Prévia Chrome com card e hook reais, transporte fictício: histórico com datas,
  pendências removidas ao resolver, reabertura só com histórico e expiração com
  o card aberto. Nenhuma mensagem enviada a paciente e nenhuma chamada paga à IA.

Para repetir a validação SQL, criar **um banco local descartável** cujo nome comece
com `codex_resumos_retencao_test`, executar, com `ON_ERROR_STOP=1`, nesta ordem:

1. `scripts/tests/resumos-retencao-setup.sql` (schema mínimo e dados fictícios);
2. a migração indicada acima;
3. `scripts/tests/resumos-retencao-check.sql` (asserções).

O setup se recusa a executar em banco fora desse prefixo. A tabela `cron.job` do
teste é um substituto local; o agendador real foi conferido separadamente no Cloud.
