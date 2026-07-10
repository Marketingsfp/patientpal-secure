## Diagnóstico

Na rotina que vincula um orçamento a um agendamento (`src/routes/_authenticated/app.agenda.tsx`, ~linha 2409-2444), o código decide se abre o diálogo "Dividir orçamento" baseado em **grupos distintos** dos itens:

```ts
const grupoDe = (pid) => norm(proc.grupo) || norm(proc.tipo) || "OUTROS";
const gruposDistintos = new Set(its.map(i => grupoDe(i.procedimento_id)));
if (gruposDistintos.size > 1) { /* abre split */ }
```

Já existe, poucas linhas acima, a variável `todosLab` que verifica se **todos** os itens são de laboratório (por `grupo=LABORATORIO`, `tipo=EXAME` ou `tipo=LABORATORIO`).

No orçamento da foto, os exames de laboratório estão cadastrados com `grupo`/`tipo` inconsistentes entre si (ex.: uns com `tipo=EXAME`, outros com `grupo=LABORATORIO`, outros sem `grupo` mas com nome de lab). Como o agrupador só olha o texto bruto, cria 2-3 buckets → abre a divisão → o operador acaba distribuindo entre médicos diferentes.

## Correção

### 1. `src/routes/_authenticated/app.agenda.tsx` (bloqueio na origem)
Antes de comparar `gruposDistintos.size > 1`, se `todosLab === true` **não abrir o split**: cai direto no fluxo de 1 grupo (linha 2447+), que gera **um único agendamento** com descrição `LABORATÓRIO (N EXAMES): ...`. Isso já é o comportamento correto.

### 2. `src/components/agenda/dividir-orcamento-dialog.tsx` (defesa em profundidade)
Ajustar `agruparItens` para que, quando **todos** os itens tiverem categoria laboratório (via `categoriaDoProcedimento`/`buildCategoriaResolver` do helper existente em `src/lib/procedimento/categoria.ts`), sejam colapsados em um único grupo `LABORATÓRIO` — assim, mesmo que o dialog seja aberto por outro caminho, ele não permitirá dividir laboratório entre profissionais.

Se o dialog receber somente itens de laboratório e existir um profissional cujo nome normalizado contenha `LABORATORIO`/`LABORATÓRIO` (médico ou recurso de enfermagem), pré-selecionar automaticamente esse profissional no grupo.

### 3. Sem migração
Apenas mudança de lógica no frontend; nada muda no banco.

## Verificação
- Criar/recuperar orçamento com N itens de laboratório com `grupo/tipo` diferentes → botão de vincular na Agenda gera **um único** agendamento "LABORATÓRIO (N EXAMES)" e não abre a tela de divisão.
- Orçamento misto (lab + imagem) continua abrindo a divisão normalmente.
- Orçamento 100% imagem ou consulta continua abrindo a divisão como hoje.