## Objetivo

Adicionar campo **Bandeira** no formulário de conta em `/app/financeiro/contas` (Nova/Editar conta) que aparece somente quando o Tipo é **Cartão** (ou Maquininha), com as opções Visa, Mastercard, Elo, American Express, Hipercard, Diners, Outra.

## Mudanças

### 1. Banco de dados (migration)
- Adicionar coluna `bandeira TEXT NULL` na tabela `fin_contas`.
- Sem alteração de RLS/GRANT (coluna nova em tabela existente).

### 2. Formulário `src/routes/_authenticated/app.financeiro.contas.tsx`
- Adicionar `bandeira: ""` ao estado `form` (e ao reset `openNew` / `openEdit`).
- Renderizar condicionalmente o Select **Bandeira** logo abaixo do campo Tipo, apenas quando `form.tipo === "cartao"` ou `form.tipo === "maquininha"`.
- Opções: Visa, Mastercard, Elo, American Express, Hipercard, Diners, Outra (valores em minúsculas — `visa`, `mastercard`, etc — para consistência com o resto do sistema, onde o helper `montarSufixoCartao` já faz `.toUpperCase()` na exibição).
- No `submit`, incluir `bandeira: form.tipo === "cartao" || form.tipo === "maquininha" ? (form.bandeira || null) : null` no payload de insert/update.
- Ao trocar o Tipo para algo que não seja cartão/maquininha, limpar `bandeira` no estado.
- Exibir a bandeira no card da conta (linha discreta abaixo do nome) quando existir.

### 3. Sem impacto em outras telas
- As telas de Caixa e Lançamento Financeiro já têm seus próprios seletores de bandeira por transação — não são alteradas.

## Verificação
- Abrir "Nova conta" → escolher Tipo "Cartão" → Select "Bandeira" aparece com Visa/Mastercard/etc.
- Trocar Tipo para "Banco" → campo Bandeira some.
- Salvar e reabrir em edição → bandeira persistida corretamente.