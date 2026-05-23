## Mudanças no menu — subsistema "Gestão de Pessoas"

### 1. `src/components/app-shell.tsx`
- Adicionar novo grupo `"Gestão"` ao `navRows` contendo o item `Funcionários` apontando para `/app/funcionarios` (ícone `Users`).
- Esconder o rótulo do grupo `"RH"` apenas quando o subsistema ativo for `gestao-pessoas`: na renderização do menu, se `subsystem === "gestao-pessoas"` e `row.label === "RH"`, não renderizar o cabeçalho (botão com o nome do grupo), mantendo os itens listados normalmente e sempre expandidos.

### 2. `src/lib/subsystem.ts`
- Incluir `"Gestão"` na lista de `groups` do subsistema `gestao-pessoas` para que o novo grupo apareça nesse subsistema (além de continuar visível no subsistema Recepção via inclusão também em "recepcao", se quisermos manter consistência — confirmar abaixo).

Como o usuário pediu o novo menu "Gestão > Funcionários" dentro do subsistema Gestão de Pessoas, adicionarei `"Gestão"` aos `groups` de **`gestao-pessoas`**. O subsistema Recepção já possui um grupo "Gestão" próprio (Auditoria, Financeiro, etc.) — não será alterado.

### 3. Nova rota `src/routes/_authenticated/app.funcionarios.tsx`
- Criar página em branco com título "Funcionários" e um placeholder, pronta para receber conteúdo futuramente.
- Inclui `head()` com title próprio.

### Resultado
- No subsistema **Gestão de Pessoas**, o sidebar mostra os itens de RH sem o cabeçalho "RH", e um novo grupo **Gestão** com o item **Funcionários** levando a `/app/funcionarios`.
- Demais subsistemas permanecem inalterados.