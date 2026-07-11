## Objetivo

Impedir edição acidental das regras na aba "Benefícios". Cada linha só entra em modo edição quando o usuário clicar num ícone de lápis.

## Comportamento

- Nova coluna de ações no início/fim da linha com um ícone de lápis (`Pencil` do lucide-react) ao lado do ícone de lixeira.
- Por padrão, todos os campos da linha (Especialidade, Categoria, Serviço, Modo, Valor/%, Prioridade, Carência, Gratuito, botão "Limite") ficam **desabilitados/somente-leitura**.
- Clique no lápis → a linha entra em modo edição: os controles ficam habilitados e o ícone vira um `Check` (concluir edição). Clicar de novo volta ao modo leitura (os valores continuam no state; o "Salvar" do rodapé persiste tudo, como já funciona hoje).
- Apenas uma linha por vez em modo edição (state `editingIdx: number | null`). Trocar de linha fecha a anterior.
- Regras novas (`id` começando com `new-`) entram já em modo edição automaticamente.
- Botão de excluir (lixeira) continua sempre disponível.
- Filtros de topo e botões "Adicionar regra" / "Reaplicar" / "Salvar" não mudam.

## Arquivos afetados

- `src/components/cartao-beneficios/regras-tab.tsx` — único arquivo alterado.
  - Adicionar `const [editingIdx, setEditingIdx] = useState<number | null>(null)`.
  - No `addRegra`, após inserir a nova regra no state, setar `editingIdx` para o índice da nova linha.
  - Em cada célula editável do `<TableRow>`, passar `disabled={editingIdx !== idx}` (nos `SearchableSelect`, `Select`, `Input`, `CurrencyInput`, `Checkbox` e no botão "Limite"/"Sem limite").
  - Adicionar botão de lápis/check na coluna de ações que alterna `editingIdx`.
  - Adicionar `<TableHead>` correspondente (pode ser vazio) para não quebrar o alinhamento.

## Fora de escopo

- Não altero regras de negócio, migrations, nem a lógica de `salvar`/`reaplicar`.
- Não mexo em outras abas do convênio.