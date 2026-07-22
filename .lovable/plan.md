
## Objetivo
Ao clicar no lápis de editar em **Recursos Humanos → Contratos**, abrir uma **página dedicada** (não modal) com um botão **"← Voltar para funcionários"** no topo.

## Escopo

### 1. Nova rota de edição
- Criar `src/routes/_authenticated/app.hr-contratos.$id.tsx` como página de edição do funcionário.
- Estrutura da página:
  - Cabeçalho com botão **"← Voltar"** (navega para `/app/hr-contratos`) e título "Editar funcionário — NOME".
  - Abas **Dados** e **Login e perfil** (mesmas do modal atual), agora renderizadas em página cheia dentro do `AppShell`.
  - Rodapé fixo com **Cancelar** (volta) e **Salvar** (persiste e volta para a lista).
- Também criar `src/routes/_authenticated/app.hr-contratos.novo.tsx` para o botão "Novo funcionário" seguir o mesmo padrão (deixa de abrir modal).

### 2. Extrair o conteúdo do modal para um componente reutilizável
- Extrair o corpo de `FuncionarioDadosDialog.tsx` (formulário + validações + salvamento) para `src/components/funcionarios/FuncionarioForm.tsx` sem `Dialog`.
- Esse componente aceita `contratoId?`, `clinicaId`, `onSaved`, `onCancel` e é usado pela nova rota.
- Manter o `FuncionarioDadosDialog` como wrapper fino apenas se ainda for usado em outro lugar; caso contrário, remover.

### 3. Ajustar a lista
- Em `src/routes/_authenticated/app.hr-contratos.tsx`:
  - O botão **lápis** passa a navegar para `/app/hr-contratos/{id}` em vez de abrir o modal.
  - O botão **Novo funcionário** navega para `/app/hr-contratos/novo`.
  - Remover o state e a renderização do `FuncionarioDadosDialog`.
- Em `src/routes/_authenticated/app.equipe.index.tsx`: o atalho que hoje passa `?editUserId=` continua funcionando — apenas troca para redirecionar direto para `/app/hr-contratos/{id}`.

### 4. UX
- Preservar exatamente os mesmos campos, validações e comportamentos atuais do modal.
- Após salvar com sucesso: toast + `navigate({ to: "/app/hr-contratos" })`.
- Botão "Voltar" no topo esquerdo e um segundo botão "Cancelar" no rodapé (ambos voltam sem salvar).
- Layout responsivo: mesmo grid 2 colunas usado hoje, com scroll da página (não mais scroll interno de modal).

## Fora de escopo
- Alterações no formulário em si (campos, validações, regras).
- Mudanças nas outras telas de RH (Férias, Holerites, Ponto).
