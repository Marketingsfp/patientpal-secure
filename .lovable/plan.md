## Problema (confirmado no banco)

Contrato **20261906** (MARLEIDE, CARTÃO CONSULTA + SEGUROS, Menino Jesus):
- Está **ativo** e é **renovação** do contrato 20261093 → carência é dispensada, ou seja, a carência **não** foi o motivo do bloqueio.
- No convênio existem **duas regras ativas** para o mesmo serviço ELETROCARDIOGRAMA (ECG):
  - gratuidade (1x/ano, carência 6) — **prioridade 10**
  - 10% de desconto (carência 2) — **prioridade 100**
- O desempate do motor soma especificidade + prioridade, então a regra de 10% (prioridade maior) vence a gratuidade. Resultado: R$ 51,00 − 10% = **R$ 45,90** em vez de gratuito.

Tipo do pedido: **regra de negócio + comportamento do motor de preços** (não é erro de dados isolado).

## O que será feito

Alterar o critério de desempate para que, entre regras que se aplicam ao **mesmo nível de especificidade**, a regra de **gratuidade sempre vença** a regra de desconto — independentemente da prioridade cadastrada. Vale para **as 3 clínicas** (comportamento global, sem feature flag).

A especificidade continua mandando: regra por **serviço** > por **especialidade** > por **tipo**. A prioridade continua desempatando entre regras do mesmo tipo (duas gratuitas ou duas de desconto).

## Arquivos afetados

1. `src/lib/cb-regras.ts` — função `findRegra`: nova pontuação
   `serviço 1000 + especialidade 100 + tipo 50 + gratuito 10 + prioridade × 0,001`.
2. `src/routes/_authenticated/app.agenda.tsx` (~linha 664) — `scoreRegra` local, usado no laço de escolha entre especialidades, alinhado à mesma pontuação.

Nada mais é tocado: carência, limites de uso (1x/ano), excedente e fallback continuam exatamente como estão. Se a gratuidade estiver em carência não cumprida ou com cota esgotada, o sistema continua caindo automaticamente para a regra de desconto seguinte.

## O que NÃO será feito

- Nenhum valor, prioridade ou regra do Cartão Consulta será alterado por prompt/script (Regra 1.11 do AGENTS.md). Se vocês quiserem, a regra de 10% do ECG pode ser desativada manualmente na tela — mas com esta correção isso deixa de ser necessário.
- Nenhum contrato, mensalidade ou lançamento será alterado.

## Validação prevista

- Simular o cálculo do ECG para o contrato 20261906 e confirmar retorno **gratuito**.
- Conferir alguns serviços onde só existe regra de desconto (ex.: consultas R$ 9,99) para garantir que nada mudou.
- Conferir um caso de gratuidade já usada no ano, para confirmar que o fallback para desconto continua funcionando.

## Pendência para o time

O atendimento do ECG de Marleide já faturado com R$ 45,90 precisa ser decidido: estorno/reemissão é ação manual de vocês no caixa — não faço isso sozinho.
