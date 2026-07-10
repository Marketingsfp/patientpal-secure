## Problema

Quando o repasse do laudador é apagado/estornado, o atendimento de origem continua com `laudo_status = 'emitido'` e a coluna Laudo segue mostrando **Vinculado**. Falta a propagação inversa: hoje só existe um trigger que cancela o repasse quando o lançamento de origem é cancelado (`trg_cancelar_laudo_ao_cancelar_lanc`), mas nada que faça o caminho contrário quando o repasse é apagado/cancelado.

Confirmado no banco (paciente QUEDIMA SUELEN, ECG): o `fin_lancamentos` de origem continua com `laudo_status='emitido'`, `medico_laudador_id` e `valor_laudo` preenchidos, mesmo depois do repasse ter sido removido — por isso a badge fica presa em "Vinculado".

## Correção

Migration única com dois gatilhos que espelham o comportamento já existente:

1. **AFTER DELETE em `fin_atendimentos`** — quando a linha excluída era um repasse de laudo (`forma_pagamento = 'laudo'` e `laudo_de_atendimento_id` ou observação com o UUID do lançamento origem), resetar no registro origem:
   - `laudo_status = NULL`
   - `medico_laudador_id = NULL`
   - `valor_laudo = NULL`
   - `laudo_emitido_em = NULL`
   - `laudo_lancamento_id = NULL`
   
   A origem pode estar em `fin_atendimentos` (via `laudo_de_atendimento_id`) ou em `fin_lancamentos` (via `laudo_lancamento_id = OLD.id`). O trigger cobre os dois casos.

2. **AFTER UPDATE OF status em `fin_atendimentos`** — quando o repasse passa a `cancelado` (mesma condição de origem acima), aplicar o mesmo reset. Isso alinha o comportamento com o trigger que já cancela o repasse quando o lançamento origem é cancelado.

Também um **script de saneamento** único (na mesma migration) para consertar registros já quebrados: para cada `fin_lancamentos`/`fin_atendimentos` com `laudo_status='emitido'` cuja linha de repasse referenciada não existe mais ou está cancelada, aplicar o mesmo reset. Isso destrava o caso do QUEDIMA SUELEN e qualquer outro histórico.

## Fora do escopo

- Sem mudança de UI, sem mexer no fluxo de "Vincular".
- Sem alterar o comportamento do `trg_cancelar_laudo_ao_cancelar_lanc` (continua cascateando origem → repasse).
- Sem migrações de dados além do saneamento acima.

## Detalhes técnicos

Arquivos:
- Nova migration em `supabase/migrations/` criando duas funções `SECURITY DEFINER` (`fn_reset_laudo_ao_remover_repasse`, `fn_reset_laudo_ao_cancelar_repasse`) e dois triggers em `fin_atendimentos`.
- UPDATE de saneamento no final da mesma migration.

Sem mudanças em código TS — a badge já lê `laudo_status`, então basta o dado ficar correto.
