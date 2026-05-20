Remover a opção **"Reimprimir última via"** do menu de ações da agenda.

## Mudanças

- `src/routes/_authenticated/app.agenda.tsx`
  - Remover o `<DropdownMenuItem>` na linha ~1229 ("Reimprimir última via").
  - Remover a função `reimprimirGR` (linha ~597) que ficaria sem uso.
  - Remover o import `reimprimirGuiaAtendimento` de `@/lib/print-gr`.
