## Recomendação

Adotar o **modelo híbrido**: cada médico tem N **agendas nomeadas** (ex.: "Consultas", "Exames", "USG"), e cada agenda pode ter procedimentos vinculados opcionalmente. Ao escolher um procedimento ao marcar, o sistema sugere automaticamente a agenda compatível — sem travar o usuário. É o mais simples para o caso "agenda de consulta + agenda de exames" e flexível o bastante para o caso "agenda por serviço".

Permitir sobreposição entre agendas do mesmo médico (já decidido). Visualização única: **dropdown "Agenda"** ao lado do filtro de médico na tela de agenda.

## O que muda

### 1. Banco

Nova tabela `medico_agendas`:
- `medico_id`, `clinica_id`, `nome` (ex.: "Consultas", "Exames"), `cor`, `ativo`, `ordem`
- Para cada médico, criar 1 agenda padrão "Consultas" na migração (back-fill).

Nova tabela `medico_agenda_procedimentos` (N:N opcional):
- `agenda_id`, `procedimento_id`
- Se um procedimento estiver vinculado a uma agenda, marcar nessa agenda passa a ser a sugestão padrão.

Alterações:
- `medico_disponibilidades.agenda_id` (uuid, FK → `medico_agendas`, NOT NULL após back-fill apontando para a agenda padrão).
- `agendamentos.agenda_id` (uuid, FK, nullable; back-fill para a agenda padrão do médico).
- Remover a regra de "1 agenda por médico no mesmo horário" — sobreposição permitida.

### 2. Cadastro de médico
- Aba/seção "Agendas" no perfil do médico (CRUD simples: nome, cor, ativo).
- Cada agenda lista os procedimentos vinculados (multi-select de `procedimentos`).

### 3. Tela "Horários médicos" (`app.disponibilidades`)
- Acima da tabela de disponibilidades, seletor **Agenda** (default: primeira ativa).
- Tabela e formulário passam a operar sempre dentro da agenda selecionada.
- Botão "Nova agenda" abre dialog para criar mais agendas do médico.

### 4. Tela "Agenda" (`app.agenda`)
- Novo filtro **Agenda** ao lado do filtro de médico, condicional (só aparece quando o médico tem >1 agenda).
- Os slots disponíveis passam a vir das disponibilidades da agenda selecionada.
- Ao marcar: se o procedimento escolhido tem vínculo com uma agenda, pré-seleciona essa agenda; caso contrário, usa a agenda atualmente filtrada (ou a padrão).

### 5. Outras telas
- Perfil do médico, relatórios e financeiro continuam funcionando sem alteração (campo `agenda_id` é opcional para leitura). Onde fizer sentido (relatório de produção, perfil do médico), exibir a agenda como coluna/badge extra.

## Detalhes técnicos

- Migração em uma única transação: cria tabelas → GRANTs (`authenticated`, `service_role`) → RLS (mesmas policies de `medico_disponibilidades`: `is_member` para SELECT, `can_manage_clinica` para INSERT/UPDATE/DELETE) → back-fill da agenda padrão por médico → adiciona `agenda_id` em `medico_disponibilidades` (NOT NULL após back-fill) e em `agendamentos` (nullable).
- Slot computation: hoje a lógica usa `medico_disponibilidades` filtrada por `medico_id`; passa a filtrar adicionalmente por `agenda_id`.
- Conflitos: a checagem atual de sobreposição (se existir) por médico deve passar a ser por `(medico_id, agenda_id)`. Entre agendas diferentes do mesmo médico, sobreposição é permitida.
- Nenhuma mudança em `procedimentos`, `medico_servicos` ou nas regras de repasse.

## Fora do escopo (não vou mexer agora)
- Visualização "colunas lado a lado por agenda".
- Bloqueio inteligente de sobreposição com aviso.
- Migração automática dos exames já cadastrados para uma agenda separada — isso pode ser feito depois, agenda por agenda, na UI.

Posso seguir e implementar?