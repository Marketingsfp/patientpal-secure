## Problema

No card "Entradas por forma de pagamento" do Caixa (`/app/caixa`), R$ 2.549,50 estão indo para **Outros** em vez de aparecer em Dinheiro / PIX / Débito / Crédito.

Duas causas independentes no arquivo `src/routes/_authenticated/app.caixa.tsx`:

### 1. Aliases errados de forma de pagamento

O agrupamento (linhas 549–562) compara com `debito` / `credito`, mas o banco grava `cartao_debito` / `cartao_credito`. Dados atuais:

```
dinheiro         241 linhas   R$ 31.002,02
cartao_credito    59          R$  8.680,00   -> hoje cai em "Outros"
pix               31          R$  3.747,00
cartao_debito     24          R$  3.444,00   -> hoje cai em "Outros"
misto              8          R$    995,00   -> hoje cai em "Outros"
```

Todo `cartao_*` e `misto` está sendo classificado como "Outros".

### 2. Pagamento misto não é decomposto na exibição

Quando o operador escolhe "Dividir em mais de uma forma" no diálogo de recebimento, o sistema grava um único `caixa_movimentos.forma_pagamento = 'misto'` e detalha as partes em `fin_lancamentos.observacoes` no formato `Pagamento misto: Dinheiro R$ 60,00; PIX R$ 50,00 | ...`.

Já existe lógica que decompõe isso — mas só no **comprovante impresso do fechamento** (linhas 714–759). Os cards ao vivo não decompõem, então parte de "dinheiro + PIX" acaba em "Outros".

## Correção

Editar apenas `src/routes/_authenticated/app.caixa.tsx` (apresentação; nenhuma regra financeira muda).

### Passo 1 — Normalizar aliases e cobrir todas as formas

Substituir o `useMemo` `entradasPorForma` (linhas 547–562) para:

- aceitar `cartao_credito` == `credito`, `cartao_debito` == `debito`;
- ter buckets nomeados para todas as formas reais em uso: `dinheiro`, `pix`, `debito`, `credito`, `boleto`, `transferencia`, `convenio`, e um `outros` residual só para valores realmente sem categoria;
- guardar também os `lancamento_id` das movimentações `misto` para decompor.

### Passo 2 — Decompor `misto` também na tela do caixa

Extrair a lógica de parsing de `observacoes` (linhas 723–759) para uma função reutilizável e disparar um efeito que, quando existirem movimentações `misto` na sessão, busca `fin_lancamentos.observacoes` e soma cada parte no bucket certo (`dinheiro`, `pix`, `debito`, `credito`, `boleto`, `convenio`, `transferencia`).

O comprovante de fechamento continua usando a mesma função — sem duplicar código.

### Passo 3 — Cards separados por forma

Substituir a lista fixa de 5 cards (linhas 925–938) por uma renderização dinâmica que mostra um card por forma com valor > 0, na ordem: Dinheiro, PIX, Débito, Crédito, Boleto, Transferência, Convênio, Outros. Formas com R$ 0,00 ficam ocultas para não poluir; "Outros" só aparece quando sobrar valor genuinamente não classificado.

## Verificação

Após a mudança, com os dados atuais do print, esperado no card:

- Dinheiro: R$ 5.760,00 (mantém)
- PIX: R$ 312,00 (mantém)
- Débito: R$ 3.444,00 (era 0)
- Crédito: R$ 8.680,00 (era 0)
- Outros: R$ 0,00 (era R$ 2.549,50) — ou oculto

Vou rodar o Playwright em `/app/caixa` após o fix e capturar screenshot para conferir que os cards batem com os totais do banco.

## Escopo

- Muda: `src/routes/_authenticated/app.caixa.tsx` (apresentação apenas).
- Não muda: fluxo de gravação de pagamento, `lancamento-dialog.tsx`, schema, políticas RLS, comprovante impresso (reaproveitado via função compartilhada).