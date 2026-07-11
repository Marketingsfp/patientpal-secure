## Problema

Na aba **Resumo** do contrato, as parcelas estão sendo marcadas como **"Atrasado"** no próprio dia do vencimento (e até um dia antes, dependendo do fuso). Isso ocorre porque:

1. `new Date(m.vencimento)` interpreta a string `"2026-07-10"` como **UTC 00:00**, que em horário de Brasília (UTC-3) equivale a `2026-07-09 21:00` local. A comparação com `new Date()` (agora, local) considera a parcela vencida mesmo no dia do vencimento.
2. A regra do usuário: **só é "Atrasado" a partir do dia seguinte ao vencimento** sem pagamento. No dia do vencimento ainda é "Pendente".

## Correção

Em `src/components/pages/contratos-page.tsx`, criar um helper local `isAtrasado(vencimento)` que:

- Converte `vencimento` (`YYYY-MM-DD`) em uma data **local** (ano/mês/dia, sem fuso UTC).
- Compara com o **início do dia de hoje** (também local).
- Retorna `true` **somente se** `hoje > vencimento` (estritamente maior — dia seguinte em diante).

Substituir as duas ocorrências atuais que usam `new Date(m.vencimento) < new Date()` (linhas ~2279 e ~2286) pela chamada `isAtrasado(m.vencimento)`, tanto na cor do Badge (`variant`) quanto no texto ("Atrasado" / "Pendente").

Nada mais é alterado: contagem financeira, valor recebido, botões de pagar e demais status permanecem iguais.

## Resultado esperado

- Vencimento **hoje** e não pago → **Pendente**.
- Vencimento **futuro** → **Pendente**.
- Vencimento **anterior a hoje** e não pago → **Atrasado**.