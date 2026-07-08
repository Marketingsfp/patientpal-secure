## Causa

Ao finalizar o atendimento pela IA (`src/routes/_authenticated/app.atendimento-ia.$agendamentoId.tsx`), o código sempre insere uma linha em `fin_atendimentos` — mesmo quando o pagamento já foi feito no caixa (que gerou um `fin_lancamentos` receita).

A tela **Financeiro › Atendimentos** unifica as duas tabelas:
- `fin_lancamentos` (origem `agenda`) — registro correto, pago via PIX
- `fin_atendimentos` (origem `manual`) — cópia duplicada, sem forma de pagamento

Resultado: duas linhas idênticas (paciente, serviço, valor), uma com pagamento e outra "A receber".

Confirmado no banco: 9 registros em `fin_atendimentos` com `lancamento_id` preenchido (ou seja, duplicando um `fin_lancamentos`), inclusive `RX COLUNA LOMBAR (RAIO-X)` de QUEDIMA SUELEN.

## Correção

### 1. Impedir duplicação na origem
Em `src/routes/_authenticated/app.atendimento-ia.$agendamentoId.tsx` (função `finalizar`, bloco `if (valorTotal > 0) { supabase.from("fin_atendimentos").insert(...) }`):

- Só inserir em `fin_atendimentos` quando **não** existir `fin_lancamentos` para o agendamento (ou seja, quando `lancExist` for nulo).
- Quando o pagamento já foi feito no caixa, o repasse do médico já vive em `fin_lancamentos` — não precisa espelhar.

### 2. Limpar duplicatas já existentes (migration)
Remover os 9 registros zumbis:
```sql
DELETE FROM public.fin_atendimentos
 WHERE lancamento_id IS NOT NULL;
```

### 3. Rede de segurança na listagem
Em `src/routes/_authenticated/app.financeiro.atendimentos.tsx` (função `load`), filtrar `manuais` para descartar linhas cujo `lancamento_id` já apareça em `fin_lancamentos` carregados. Isso protege contra qualquer duplicata legada que apareça no futuro sem depender de nova limpeza.

## Fora de escopo

- Regras de cálculo de repasse, laudo e comprovante permanecem inalteradas.
- Não altero triggers nem RLS das tabelas envolvidas.
