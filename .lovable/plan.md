## Objetivo
Ao renovar um contrato, o botão "RENOVAÇÃO" deve ficar desabilitado, e ao passar o mouse deve exibir a data em que a renovação foi feita.

## Escopo
Somente frontend. Arquivo: `src/components/pages/contratos-page.tsx` (bloco do botão RENOVAÇÃO, linhas ~2968-2985).

## Como detectar que já foi renovado
A tabela `contrato_renovacoes` já registra cada renovação com `contrato_id` (contrato de origem) e `created_at`. Buscar a renovação mais recente onde `contrato_id = contrato.id`:
- Se existir → botão desabilitado, com tooltip "Renovado em DD/MM/AAAA".
- Se não existir → mantém comportamento atual (habilitado quando as 12 parcelas estão pagas).

## Alterações
1. Adicionar `useQuery` na view do contrato para buscar a renovação existente:
   ```
   supabase.from('contrato_renovacoes')
     .select('created_at, tipo, contrato_novo_id')
     .eq('contrato_id', contrato.id)
     .order('created_at', { desc: true })
     .limit(1).maybeSingle()
   ```
2. No bloco do botão RENOVAÇÃO:
   - Continuar exigindo `podeRenovar` (12/12 pagas) para exibir.
   - Se houver renovação registrada: renderizar o botão com `disabled`, estilo esmaecido, envolto em `Tooltip` do shadcn mostrando `Renovado em {dd/MM/yyyy}` (usar `format` do date-fns já disponível no arquivo).
   - Sem renovação: botão vermelho ativo como hoje.
3. Invalidar essa query no `onSuccess` do fluxo de renovação (mesmo padrão de invalidação já usado após renovar) para o botão desabilitar imediatamente após a ação.

## Fora de escopo
- Nenhuma mudança em RPCs, banco, permissões ou no fluxo do diálogo de renovação.
- Não altera o botão "Cancelar contrato".

## Validação
- Contrato já renovado (ex.: da Quédima após renovar): botão aparece desabilitado com tooltip da data.
- Contrato quitado ainda não renovado: botão continua clicável e vermelho.
- Após concluir uma nova renovação, o botão passa a desabilitado sem precisar recarregar a página.