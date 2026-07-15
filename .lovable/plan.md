## Alteração

Trocar a ordem das colunas **Ficha** e **Data** na tabela da agenda, deixando **Ficha** como primeira coluna após o checkbox.

## Onde

`src/routes/_authenticated/app.agenda.tsx` — dois pontos:

1. **Cabeçalho da tabela** (linhas ~6599-6603): mover o `<TableHead>` de "Ficha" para antes do de "Data".
2. **Corpo da linha** (linhas ~6677-6688): mover a `<TableCell>` da Ficha para antes da célula de Data.

## Fora do escopo

- Nenhuma outra coluna é reordenada.
- Filtros, largura das colunas, lógica de dados e regra de cálculo da ficha permanecem inalterados.
- A tela "Por médico" e outras visualizações não são tocadas.
