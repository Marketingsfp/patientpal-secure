## Ajustes no cadastro de Funcionário (`src/routes/_authenticated/app.hr-contratos.tsx`)

### 1. Tamanho fixo do diálogo
- Adicionar altura mínima fixa ao conteúdo das abas (ex.: `min-h-[480px]`) e manter `max-w-2xl` no `DialogContent`, para que ao alternar entre "Dados" e "Login e perfil" o diálogo não mude de tamanho.

### 2. Aba "Login e perfil" — campos sempre visíveis
- Renderizar os campos **Perfil de acesso**, **E-mail (login)** e **Senha inicial** sempre, mesmo com o checkbox desmarcado.
- Quando "Criar login de acesso ao sistema para este funcionário" estiver **desmarcado**, os três campos ficam `disabled` (visualmente apagados).
- Ao marcar o checkbox, os campos passam a ser editáveis.
- Em modo edição (`editing` definido), manter a mensagem informando que o login não pode ser alterado por aqui (sem alterar comportamento atual).

### 3. Aba "Dados" — unificar "Clínica" e "Unidade"
Como foi feito anteriormente em `app.unidades.tsx`, "Clínica" e "Unidade" passam a representar a mesma entidade (a `clinicas` agora carrega endereço/geolocalização das unidades).
- **Remover** o campo `Unidade` (select de `unidades`) do formulário.
- **Renomear** o label do campo `Clínica *` para `Unidade *` (continua escrevendo em `clinica_id`, que é a coluna usada para escopo/RLS).
- Manter `unidade_id = null` ao salvar (não enviar mais esse campo no payload).
- Remover o estado `unidades`, a query de `unidades` em `load()` e o tipo relacionado para limpar o código.

### Detalhes técnicos
- Tudo permanece no arquivo `src/routes/_authenticated/app.hr-contratos.tsx`. Sem alterações de banco e sem mudanças em outras telas.
- A coluna `unidade_id` em `hr_contratos` continua existindo no banco; apenas deixa de ser preenchida pela UI (registros antigos permanecem intactos).
- O grid da aba "Dados" passa a ter um espaço a menos (Cargo + Setor ocupam a linha onde antes havia Unidade), mantendo o layout `grid-cols-2`.
