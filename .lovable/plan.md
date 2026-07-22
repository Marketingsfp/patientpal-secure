## Problema (confirmado no código)

Em `src/components/pages/contratos-page.tsx` a lista de contratos usa **busca no servidor** quando o termo digitado tem 2+ caracteres (linha 300–309). Sem termo, o servidor devolve apenas os **500 contratos mais recentes** (linha 311).

O bug acontece assim:
1. Usuário digita um nome → `load(qDebounced)` roda uma busca `ilike` no servidor e a lista mostra o(s) resultado(s).
2. Usuário clica num contrato → abre `DetalheContrato`.
3. Ao voltar (`onBack`, linha 582–586), o código chama `load()` **sem argumento** → o servidor devolve os 500 contratos mais recentes, ignorando o termo. O `input` continua com o texto, o filtro client-side roda em cima desses 500, e como a clínica tem mais de 500 contratos o paciente buscado (mais antigo) não aparece.
4. Ao alterar uma letra, `qDebounced` muda, o `useEffect` da linha 412–414 chama `load(qDebounced)` novamente e os resultados voltam.

O mesmo padrão existe em várias outras chamadas `load()` sem argumento (após salvar, renovar, cancelar, marcar pago, etc. — linhas 570, 585, 1087, 2328, 2387, 2446, 2484, 2493, 2576, 2616, 2687, 2899, 3015, 3041, 3070, 3112, 3593, 3640, 4595, 5373), então qualquer ação em fluxo com filtro ativo pode "sumir" com o resultado.

## Correção

Aplicar em `src/components/pages/contratos-page.tsx`:

1. Alterar a assinatura do helper para usar o termo atual como padrão:
   ```ts
   const load = async (termo: string = qDebounced) => { ... }
   ```
   Como `load` é redefinido a cada render dentro do componente, o default sempre refere ao `qDebounced` mais recente. Chamadas explícitas com string (ex.: no `useEffect` da linha 413) continuam funcionando.

2. Nenhuma outra alteração necessária: todas as chamadas `load()` sem argumento passam automaticamente a respeitar o filtro atual.

## Escopo e impacto

- **Clínicas afetadas:** aplicar nas 3 clínicas (código compartilhado, é bug técnico puro, sem regra de negócio nova). Confirmar antes de executar conforme regra 1.10.
- **Área tocada:** apenas frontend, arquivo único.
- **Sem mudança de UI/UX**, sem migração de banco, sem alteração de RLS.
- **Risco:** muito baixo. Comportamento fica igual quando não há filtro ativo (`qDebounced` = `""` → mesmo default de antes).

## Validação

- Reproduzir o cenário do vídeo: buscar paciente, abrir contrato, voltar → conferir que a lista continua mostrando o resultado filtrado.
- Repetir após: salvar edição de mensalidade, renovar contrato e cancelar contrato — todos devem preservar o filtro.
- Confirmar que limpar o campo de busca volta a listar os 500 mais recentes normalmente.
