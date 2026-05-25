## Objetivo
Na aba **Especialidades** do cadastro de médico, adicionar um terceiro bloco — **Procedimentos** — com a mesma dinâmica de RQE e Especialidades: botão "Adicionar procedimento" + seletor pesquisável por linha + botão de remover. A base da lista é a tabela `procedimentos` (mesma do menu "Procedimentos").

## Mudanças

### 1. Banco de dados (nova tabela `medico_procedimentos`)
Tabela de associação simples entre médico e procedimento:
- `medico_id` (FK → `medicos.id`, on delete cascade)
- `procedimento_id` (FK → `procedimentos.id`, on delete cascade)
- `UNIQUE (medico_id, procedimento_id)`
- RLS: membros da clínica do médico podem ler; gestores/admins podem inserir/atualizar/deletar (mesmo padrão de `medico_especialidades`).
- GRANTs apropriados para `authenticated`.

### 2. Formulário (`src/components/medicos/MedicoFormDialog.tsx`)
Na aba **Especialidades**, abaixo do bloco de Especialidades, adicionar um bloco "Procedimentos":
- Cabeçalho com título + botão **"Adicionar procedimento"**.
- Lista de linhas, cada uma com:
  - `SearchableSelect` listando todos os procedimentos cadastrados na clínica (já carregados em `procs`).
  - Botão de remover.
- Mensagem "Nenhum procedimento selecionado." quando vazio.
- Bloqueio de duplicatas.

Estado:
- `form.procedimentos: string[]` (IDs).
- Carregar no edit: `select procedimento_id from medico_procedimentos where medico_id = ...`.
- No `handleSubmit`: após salvar o médico, deletar todos os `medico_procedimentos` daquele médico e reinserir os atuais (mesmo padrão usado para `medico_especialidades`).

## Fora de escopo
- Não altera a tabela `medico_convenios` (continua sendo a base de repasse).
- Não altera UI da aba "Repasse" / "Convênios".
- Não muda RQE nem Especialidades.
