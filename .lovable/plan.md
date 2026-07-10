## Diagnóstico

O menu **Atendimentos** mostra dois `[LAUDO] ELETROCARDIOGRAMA` para o mesmo agendamento da paciente QUEDIMA porque a primeira movimentação foi cancelada mas o **repasse de laudo** derivado dela ficou órfão.

Dados atuais no banco (agendamento `633d3c5a…`):

| fin_lancamentos | valor | status | laudo_lancamento_id (fin_atendimentos) |
|---|---|---|---|
| criado 11:41 | R$ 51 | **cancelado** | 49d190bc… (LAUDO ativo ❌) |
| criado 12:14 | R$ 60 | confirmado | 2b396e92… (LAUDO ativo ✅) |

Quando o operador cancelou o lançamento de R$ 51 e criou um novo de R$ 60, o trigger `gerar_repasse_laudador_lanc` gerou um segundo `fin_atendimentos` de laudo — mas **não existe trigger que cancele o laudo espelhado quando o lançamento pai é cancelado**. Por isso os dois aparecem na lista de repasses do médico laudador.

## Correção

### 1. Corrigir dados existentes (via `supabase--insert`)

Marcar como `cancelado` todo `fin_atendimentos` de laudo cujo `fin_lancamentos` de origem esteja `cancelado`:

```sql
UPDATE public.fin_atendimentos fa
   SET status = 'cancelado',
       observacoes = COALESCE(observacoes,'') || ' [auto: lançamento origem cancelado]'
  FROM public.fin_lancamentos l
 WHERE l.laudo_lancamento_id = fa.id
   AND l.status = 'cancelado'
   AND fa.status <> 'cancelado';
```

Isso resolve imediatamente o caso da QUEDIMA (linha 49d190bc some da lista, restando só a linha 2b396e92 correta).

### 2. Prevenir recorrência (via `supabase--migration`)

Trigger novo em `fin_lancamentos` — quando `status` muda para `cancelado` (ou linha é deletada), cancelar o laudo filho:

```sql
CREATE OR REPLACE FUNCTION public.fn_cancelar_laudo_ao_cancelar_lanc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'cancelado'
     AND OLD.status <> 'cancelado'
     AND NEW.laudo_lancamento_id IS NOT NULL THEN
    UPDATE public.fin_atendimentos
       SET status = 'cancelado',
           observacoes = COALESCE(observacoes,'') || ' [auto: lançamento origem cancelado]'
     WHERE id = NEW.laudo_lancamento_id
       AND status <> 'cancelado';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_cancelar_laudo_ao_cancelar_lanc ON public.fin_lancamentos;
CREATE TRIGGER trg_cancelar_laudo_ao_cancelar_lanc
  AFTER UPDATE OF status ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_cancelar_laudo_ao_cancelar_lanc();
```

Reforçar também a exclusividade: garantir que só exista **um** `fin_atendimentos` de laudo ativo por agendamento — índice único parcial (ignorando cancelados) via coluna `laudo_de_atendimento_id` já existente **não** cobre este caso porque o vínculo é o inverso (`fin_lancamentos.laudo_lancamento_id`). Solução: índice único parcial em `fin_lancamentos(agendamento_id) WHERE laudo_status='emitido' AND status <> 'cancelado'` — já garantido de fato pelo fluxo (uma receita ativa por agendamento), então não é necessário adicionar.

### 3. Filtro na UI

Nenhuma alteração no front — a tela **Atendimentos** já filtra `status <> 'cancelado'`. Uma vez corrigido o dado no passo 1, a linha duplicada some sozinha.

## Escopo

- Nada de mudança visual/UX.
- Trigger novo apenas em `fin_lancamentos`; não altera o trigger de geração do laudo.
- Idempotente: o `UPDATE` do passo 1 pula linhas já canceladas.
