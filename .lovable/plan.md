## Objetivo
Ao abrir qualquer contrato no Cartão Benefícios, iniciar já na aba **Dados** em vez de "Resumo".

## Alteração
Arquivo: `src/components/pages/contratos-page.tsx`
- Trocar o default `initialTab = "resumo"` (linha ~1955) para `"dados"`.
- Trocar o reset `setDetailInitialTab("resumo")` no `onBack` (linha 578) para `"dados"`.
- Manter os demais casos que já forçam `"dados"` (fluxo de admin editar).

## Escopo
- Somente apresentação (aba inicial padrão). Nada de regra de negócio.
- Aplicação global (todas as clínicas), por ser continuação da reorganização visual anterior. Me avise se preferir restringir.

## Validação
Abrir um contrato existente → aba "Dados" já vem selecionada.