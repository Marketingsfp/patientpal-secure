## Objetivo

No cadastro de benefícios (regras de preço) dos convênios do Cartão Benefícios, cada regra passa a ter **dois valores**: um para pagamento em **dinheiro** e outro para **cartão/Pix**. O valor já existente vira o "dinheiro" e o novo campo "cartão/Pix" é preenchido manualmente pelo time. O acréscimo automático de cartão configurado no convênio é removido (foi criado errado).

Aplica-se às **3 clínicas** (arquivo/tabela única, sem feature flag).

## Escopo

Dentro:
- Tabela `cb_convenio_regras`: novas colunas para o segundo valor.
- Formulário de edição de regra em `src/components/cartao-beneficios/regras-tab.tsx`.
- Motor de preços da agenda que consome a regra (usa `computeValor` em `src/lib/cb-regras.ts`).
- Remoção do acréscimo automático de cartão do convênio (campos em `cb_convenios` e sua aplicação em `applyAcrescimoCartao`).

Fora:
- Convênio Funcionário (não usa cartão benefícios).
- Regras "gratuito" (permanecem 0 em ambos).
- Histórico de lançamentos já feitos.

## Comportamento

### Cadastro da regra
- Campo atual "Valor (R$)" é renomeado para **"Valor dinheiro (R$)"**.
- Novo campo ao lado: **"Valor cartão/Pix (R$)"**.
- Quando o modo é "Percentual de desconto", o mesmo desdobramento vale: **"% desconto dinheiro"** e **"% desconto cartão/Pix"**.
- Para regras já existentes, o segundo campo é pré-preenchido com o valor atual (mesma coisa que dinheiro) e o time ajusta manualmente quando precisar.

### Aplicação na agenda
- Base "dinheiro" da consulta usa `valor`/`percentual` (dinheiro).
- Base "outros" (PIX, débito, crédito) usa os novos `valor_cartao`/`percentual_cartao`.
- Nenhum acréscimo automático é somado por cima.

### Acréscimo automático (remoção)
- Deixa de ser aplicado em qualquer fluxo.
- Os campos ficam no banco por segurança de dados históricos, mas a UI de configuração do convênio deixa de exibi-los e a função `applyAcrescimoCartao` passa a retornar o valor sem alteração (no-op).

## Detalhes técnicos

### Banco (migration)
```sql
ALTER TABLE public.cb_convenio_regras
  ADD COLUMN valor_cartao numeric,
  ADD COLUMN percentual_cartao numeric;

-- backfill: card = dinheiro
UPDATE public.cb_convenio_regras
   SET valor_cartao = valor,
       percentual_cartao = percentual
 WHERE valor_cartao IS NULL AND percentual_cartao IS NULL;
```

### Frontend
- `src/lib/cb-regras.ts`
  - `CbRegra`: adicionar `valor_cartao?: number | null`, `percentual_cartao?: number | null`.
  - `computeValor`: passar a usar `valor_cartao`/`percentual_cartao` para o retorno `outros` (fallback no dinheiro se nulo, garantindo compatibilidade).
  - `applyAcrescimoCartao`: transformar em no-op (retorna `valorOutros`), preservando assinatura para não quebrar chamadas.
- `src/components/cartao-beneficios/regras-tab.tsx`
  - Renomear label do campo atual e adicionar o novo campo (valor OU percentual, conforme modo).
  - Persistir os novos campos no insert/update.
- Remover a seção de "Acréscimo cartão" do formulário de convênio (mantendo colunas no banco, sem uso).

### Verificação
- Editar uma regra existente: os dois campos aparecem iguais; alterar só o de cartão/Pix e salvar.
- Simular na agenda: valor em dinheiro e valor em cartão saem diferentes conforme regra; acréscimo automático não incide mais.

## Antes / Depois

- **Antes:** uma regra tinha um único valor; para diferenciar cartão, dependia de um acréscimo global por convênio.
- **Depois:** cada regra carrega explicitamente o valor de dinheiro e o valor de cartão/Pix; o acréscimo automático some.
