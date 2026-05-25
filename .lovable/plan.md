## Objetivo
Substituir a seleção atual de **Especialidades** (lista de checkboxes) pela mesma dinâmica usada no **RQE**: linhas adicionáveis com um seletor pesquisável da lista de especialidades cadastradas no sistema.

## Mudanças no formulário do médico (`src/components/medicos/MedicoFormDialog.tsx`)

Na aba **Especialidades**, abaixo do bloco de RQE, substituir o atual filtro + lista de checkboxes por:

- Cabeçalho com título "Especialidades" + botão **"Adicionar especialidade"** (ícone `Plus`).
- Lista de linhas, cada uma com:
  - `SearchableSelect` com todas as especialidades cadastradas no sistema (já carregadas em `esps`).
  - Botão de remover (ícone `Trash2`).
- Mensagem "Nenhuma especialidade selecionada." quando a lista estiver vazia.
- Impedir duplicatas: ao adicionar/alterar, se a especialidade já estiver em outra linha, mostrar aviso e ignorar.

## Comportamento

- `form.especialidades` continua sendo `string[]` (IDs), então **nenhuma mudança no payload** nem no banco — a tabela `medico_especialidades` continua sendo regravada do mesmo jeito no `handleSubmit`.
- Remove-se o estado `espFilter` (não é mais necessário, a busca acontece dentro do `SearchableSelect`).
- Validação opcional: exigir ao menos 1 especialidade? **Não** — manter o mesmo comportamento atual (opcional), a menos que você queira torná-la obrigatória.

## Fora de escopo
- Não altera RQE, repasse, convênios, banco de dados, RLS ou outras telas.
- Não muda a tabela `medico_especialidades`.
