## 1. Campo "Sexo" nos cadastros

Adicionar a coluna `sexo` em três tabelas e exibir um seletor nos três formulários.

**Banco de dados (migração):**
- `pacientes.sexo text` (valores: `masculino`, `feminino`, `outro`, `nao_informar`)
- `medicos.sexo text`
- `hr_contratos.sexo text`
- Check constraint em cada uma restringindo aos valores acima; default `nao_informar`.

**Formulários (UI):**
- `src/routes/_authenticated/app.medicos.tsx` — adicionar `<Select>` "Sexo" na seção de dados pessoais.
- `src/routes/_authenticated/app.hr-contratos.tsx` — adicionar `<Select>` "Sexo" na aba "Dados".
- `src/routes/_authenticated/app.clientes.tsx` (pacientes) — adicionar `<Select>` "Sexo".

Opções exibidas: **Masculino, Feminino, Outro, Prefiro não informar**.

## 2. Edição de funcionário abrindo a tela errada

Hoje, na aba **Equipe → Funcionários**, o lápis de editar leva para `/app/funcionario/$userId`, que é a página de perfil somente-leitura (foto 1). O usuário quer abrir o mesmo formulário de "Novo funcionário" (foto 2), em modo edição.

**Mudanças:**
- Em `src/routes/_authenticated/app.equipe.tsx`, trocar o link do lápis para `/app/hr-contratos` passando o `user_id` via search param (`?edit=<userId>`).
- Em `src/routes/_authenticated/app.hr-contratos.tsx`:
  - Ler o search param `edit`.
  - Se houver contrato para aquele `user_id` na clínica atual → abrir o dialog em modo edição com os dados carregados.
  - Se não houver contrato ainda → abrir o dialog em modo "novo" com o `user_id` e o `nome` (vindo de `profiles`) já pré-preenchidos, para o usuário só completar os demais campos.

Resultado: clicar no lápis abre o formulário completo de funcionário (Dados + Login e perfil) com os dados do membro selecionado.

## Fora do escopo

- Nenhuma alteração em relatórios, filtros ou exibições que usem esses cadastros (o campo `sexo` fica disponível, mas só aparece no formulário por enquanto).
