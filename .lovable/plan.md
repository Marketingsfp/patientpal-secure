## Diagnóstico (verificado no banco)

Contrato **#20261898** — Isabel Lima Leite:
- `data_inicio = 18/06/2026`, `dia_vencimento = 25`.
- 1ª parcela gerada em `25/07/2026` (deveria ser `25/06/2026`).
- 12 parcelas vão de 25/07/2026 até 25/06/2027, uma acima do correto.

Causa raiz confirmada na RPC `renovar_contrato_extensao` (arquivo do banco, linhas 78–82):

```
FOR i IN 0 .. v_num_parcelas - 1 LOOP
  v_ano := EXTRACT(YEAR FROM (v_data_base + ((i + 1) || ' month')::interval))::int;
  v_mes := EXTRACT(MONTH FROM (v_data_base + ((i + 1) || ' month')::interval))::int;
```

O loop **sempre soma no mínimo 1 mês** à data base, mesmo quando o `dia_vencimento` do mês corrente ainda não chegou. Com `data_base = 18/06` e `dia_venc = 25`, o dia 25/06 ainda está no futuro e deveria ser a 1ª parcela — mas o `+1 month` empurra tudo para julho.

A mesma falha existe em **`trocar_convenio_contrato`** (linhas 86–90), que gera parcelas usando `v_data_inicio + (i || ' month')` para `i IN 1..N` — também sempre pula o mês corrente. Ou seja, todo contrato criado via **Renovação** ou **Troca de convênio** herda o problema.

`criar_contrato_assinatura` (venda nova) **não é afetada**: recebe o array de mensalidades já calculado do frontend.

## Regra correta da 1ª parcela

Dado `data_base` (data de início/renovação) e `dia_vencimento`:
- Se `dia(data_base) <= dia_vencimento` → **1ª parcela = mesmo mês** de `data_base`, no `dia_vencimento`.
- Se `dia(data_base) > dia_vencimento` → **1ª parcela = mês seguinte**, no `dia_vencimento`.
- Demais parcelas seguem mês a mês, com ajuste para mês curto (fev/30-31).

## Escopo de aplicação (Regra 1.10)

Como é **bug técnico** (fórmula de data errada) sem regra de negócio dependente de clínica, a correção deve valer para **todas as clínicas**. Confirmar antes de aplicar.

## Alterações previstas

### 1. Migration — corrigir as duas RPCs

- **`renovar_contrato_extensao`**: substituir o cálculo de `v_ano/v_mes/v_dia` por lógica que:
  1. Define `v_data_ancora` como o `dia_vencimento` do mês de `v_data_ren` se `EXTRACT(DAY FROM v_data_ren) <= v_dia_venc`, senão do mês seguinte.
  2. No loop `i IN 0..v_num_parcelas-1`, soma `i` meses (não `i+1`) sobre a âncora, com o `LEAST(dia_venc, último_dia_do_mês)` já existente.
- **`trocar_convenio_contrato`**: mesma correção, loop `i IN 0..v_num_parcelas-1` sobre a âncora, ajustando o `INSERT` para usar `numero_parcela = i + 1`.
- Manter carência isenta, taxa zero e demais regras já implementadas.

### 2. Insert — corrigir o contrato #20261898 já criado

- Recalcular as 12 mensalidades para 25/06/2026 … 25/05/2027 (`UPDATE contrato_mensalidades … WHERE contrato_id = '0faaab61-…' AND numero_parcela BETWEEN 1 AND 12`).
- Atualizar `contratos_assinatura.data_fim` de 25/06/2027 → 25/05/2027.
- Nenhuma mensalidade desse contrato está paga ainda, então o ajuste é seguro (na foto 2 aparece "Pagas 0/12"; a marcação "pago" que apareceu no meu SELECT era só o status inicial já revisado — vou revalidar antes do UPDATE).

### 3. Validação

- Após a migration, testar chamando manualmente as duas RPCs para um contrato-espelho com combinações de datas (dia < venc, dia = venc, dia > venc, fev, dez→jan) e conferir as parcelas geradas.
- Conferir contrato #20261898 lista 25/06/2026 como 1ª parcela.

## Antes vs Depois

- **Antes:** renovação e troca de convênio sempre pulam o mês corrente, mesmo quando o dia de vencimento ainda não passou. A 1ª parcela vence 1 mês depois do esperado, e o contrato termina 1 mês além.
- **Depois:** 1ª parcela cai no mês da própria renovação/troca quando o dia de vencimento ainda não passou; caso contrário, no mês seguinte. As 12 parcelas ficam distribuídas corretamente.

## Pendências / confirmações

1. Confirmar aplicação **global** (todas as clínicas). Não é regra de negócio, é fórmula de data — mas peço confirmação por conta da Regra 1.10.
2. Confirmar que posso reescrever as 12 mensalidades do contrato #20261898 (todas ainda pendentes).