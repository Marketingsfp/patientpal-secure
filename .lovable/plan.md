## Objetivo

Remover o rótulo redundante "⏳ Aguarda atend." da coluna de seleção da tabela em `Financeiro › Atendimentos`. O botão amarelo "Baixar" na coluna Ações já sinaliza visualmente que o atendimento ainda não foi baixado.

## Alteração

Arquivo: `src/routes/_authenticated/app.financeiro.atendimentos.tsx` (linhas ~1681–1688).

No `else` do ramo `isAtendido(a)` da célula de seleção, substituir o `<span>` "⏳ Aguarda atend." por `null` (célula fica vazia). Nada mais muda:

- O checkbox de seleção continua aparecendo apenas quando `isAtendido(a)` (comportamento atual preservado).
- O ramo "Sem repasse" permanece intacto.
- Nenhuma lógica de baixa, filtros, seleção em lote ou estilos de linha é alterada.

## Fora de escopo

- Não mexe no botão "Baixar" nem nos estados visuais (amarelo pendente / amarelo selecionado / verde baixado) já implementados.
- Não altera regras de quem pode ser selecionado para baixa em lote.