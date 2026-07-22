## Escopo confirmado
- Aplicar em **todas as 3 clínicas** (correção técnica, sem regra de negócio específica).
- Contrato-alvo: **Gisele #20260594** — renumerar mensalidades mantendo dia 30 (pulando meses sem dia 30).

## O que vai mudar

### 1. Renomear aba "Resumo" → "Mensalidades"
Arquivo: `src/components/pages/contratos-page.tsx`
- Trocar apenas o rótulo visível do `TabsTrigger`.
- Manter `value="resumo"` interno para não quebrar estado, deep-link ou refs.

### 2. Validar datas antes de salvar
Arquivo: `src/components/pages/contratos-page.tsx` (função `salvarRascunhos` e handlers de "Pago em")
- Antes de enviar ao Postgres, verificar que cada data está no formato `YYYY-MM-DD` completo.
- Se alguma linha estiver com data incompleta (ex.: `2026-03-3` ou vazio parcial), abortar o salvamento com toast claro apontando **qual parcela** e **qual campo** (Vencimento / Pago em) está inválido.
- Isso evita o erro genérico "Uma das datas informadas está em formato inválido" vindo do banco.

### 3. Corrigir mensalidades do contrato #20260594 (Gisele)
Ação: consulta + atualização via ferramenta de dados (não é schema).
- Ler as 12 parcelas atuais para confirmar a duplicidade em 30/03/2026 e a ausência de fevereiro.
- Renumerar todas as datas de vencimento a partir da parcela 1, mantendo dia 30 e pulando meses sem dia 30 (fev vira 28 ou é pulado conforme a lógica atual de geração). Confirmar com você a **data-base** (mês/ano da parcela 1) antes de aplicar o UPDATE.
- Preservar `pago`, `pago_data`, `valor` e demais campos — só recalcular `data_vencimento` e `competencia`.

## Fora do escopo
- Não vou mexer em outras abas do contrato, motor de preços, RPCs de contratação ou renovação.
- Nenhuma alteração em outros contratos.

## Validação
- Após renomear: abrir Contratos e conferir que a aba aparece como "Mensalidades" e continua carregando a lista.
- Após validação: tentar salvar com data incompleta propositalmente e conferir o toast específico.
- Após correção da Gisele: reabrir o contrato #20260594, conferir 12 parcelas sequenciais sem duplicidade e cobertura correta dos meses.

## Pendência antes de executar
Confirmo com você a **data-base da parcela 1** do contrato #20260594 antes de rodar o UPDATE (para não presumir o mês inicial errado).