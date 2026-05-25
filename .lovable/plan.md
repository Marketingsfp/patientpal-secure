## Renomear "Grupo" → "Especialidade" no formulário de Serviço

### 1. Diálogo "Novo/Editar serviço" (`app.procedimentos.tsx`)
- Renomear o label `Grupo` para `Especialidade`.
- Trocar o `Input` + `datalist` por um `Select` populado com a lista de `especialidades` (ativas) carregadas via `supabase.from("especialidades").select("id,nome").eq("ativo", true).order("nome")`.
- O valor selecionado continua sendo gravado na coluna existente `procedimentos.grupo` (texto), preservando dados atuais — sem migração de banco.
- Permitir "Nenhuma" (limpa o campo).

### 2. Consistência na listagem
- Renomear o filtro "Grupo" / "Todos os grupos" da toolbar para "Especialidade" / "Todas as especialidades".
- Renomear o cabeçalho da coluna `Grupo` na tabela para `Especialidade`.
- A label da coluna no Excel export também passa a ser "Especialidade".

### 3. Campo "Tipo"
- Já carrega dinamicamente de `tipos_servico` (feito no passo anterior). Nenhuma mudança necessária.

### Fora deste passo
- Não vou alterar a coluna `grupo` no banco nem outras telas que exibem `grupo` (caixa, agenda, etc.). Apenas o cadastro de Serviços.
