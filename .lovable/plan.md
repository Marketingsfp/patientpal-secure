## Objetivo

Alinhar o texto dos contratos ao juros que o sistema realmente cobra: **0,33% ao dia** (o texto atual diz "0,033% ao dia", que é 10× menor que o valor efetivamente aplicado). Vale para **todas as clínicas**.

O motor de cálculo (`calcValorComJuros` em `contratos-page.tsx`) e o carnê impresso (`print-carne.ts`, que já diz "0,33% ao dia") **não serão tocados** — eles já estão corretos.

## O que será alterado

### 1. Template HTML de impressão de contrato
Arquivo: `src/lib/print-contrato.ts` (Parágrafo Quinto, linha 197)
- Trocar `"juros de 0,033% ao dia"` → `"juros de 0,33% ao dia"`

### 2. Template Menino Jesus (Cartão Consulta + Seguros)
Arquivo: `src/lib/contract-templates/menino-jesus-cartao-consulta-seguros.ts` (linha 784)
- Trocar `"além de juros de 0,033% ao dia"` → `"além de juros de 0,33% ao dia"`

### 3. Templates armazenados no banco (`planos_assinatura.template_contrato`)
Migração SQL simples para todas as clínicas:
```sql
UPDATE public.planos_assinatura
SET template_contrato = replace(template_contrato, '0,033%', '0,33%')
WHERE template_contrato ILIKE '%0,033%';
```
Isso afeta 4 planos (2 da Menino Jesus, 1 da SFP, 1 da São Francisco) identificados na análise. Contratos **já assinados/impressos** não mudam retroativamente — a alteração vale para contratos futuros gerados a partir desses templates.

## Fora do escopo

- Não alterar `calcValorComJuros` (o cálculo já é 0,33%/dia).
- Não alterar `print-carne.ts` (o carnê já diz 0,33%).
- Não regravar contratos antigos já impressos/assinados.
- Não mexer no valor da multa (10%) nem na tolerância de 5 dias.

## Validação

- Grep confirmando que não sobrou "0,033%" em `src/lib/print-contrato.ts` nem no template Menino Jesus.
- `SELECT count(*)` em `planos_assinatura` mostrando 0 registros com `0,033%` após a migração.
