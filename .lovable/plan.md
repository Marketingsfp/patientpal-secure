Em `src/components/app-shell.tsx`, reduzir o espaço do rodapé da sidebar (área com Recolher / e-mail / Sair):

- Container do rodapé: trocar `p-3` por `px-2 py-1` para diminuir o padding.
- Botão "Recolher": usar `size="sm"`, altura compacta (`h-8`), remover `mb-1`.
- Linha do e-mail: reduzir para `px-2 py-1 text-[11px]` (em vez de `px-3 py-2 text-xs`).
- Botão "Sair": usar `size="sm"` e `h-8`.

Resultado: rodapé fica visualmente colado e ocupa cerca de metade da altura atual, sem alterar o restante do menu.