## Objetivo
Permitir que uma regra de preço de convênio se aplique a **um serviço específico** (ex.: "Preventivo"), além das opções atuais por especialidade e/ou tipo (consulta/exame/procedimento).

## Como vai funcionar (visão do usuário)
Na aba **Regras de Preço** do convênio, cada linha ganha uma nova coluna **Serviço**, ao lado de *Especialidade* e *Categoria*. O usuário pode escolher:

- **Qualquer serviço** (comportamento atual — vale por especialidade/tipo)
- **Um serviço específico** da lista de procedimentos da clínica (ex.: PREVENTIVO, ULTRASSOM MORFOLÓGICO, etc.)

Regra de precedência (mais específica vence, mantendo prioridade como desempate):

```
serviço específico  >  especialidade + tipo  >  especialidade  >  tipo  >  genérica
```

Ou seja: se existir uma regra para o serviço "Preventivo", ela é aplicada mesmo que haja outra regra genérica de "consulta" ou da especialidade dele.

Ao escolher um serviço, os campos *Especialidade* e *Categoria* ficam desabilitados (o serviço já os determina), evitando conflito.

## Onde muda

1. **Banco** — nova coluna `procedimento_id uuid` em `public.cb_convenio_regras` (nullable, FK para `procedimentos(id)` com `ON DELETE CASCADE`, índice para lookup rápido).
2. **`src/lib/cb-regras.ts`** — adicionar `procedimento_id` na interface `CbRegra`; `findRegra` passa a receber `procedimentoId` e prioriza match por serviço; score de especificidade ganha peso alto para `procedimento_id`.
3. **`src/components/cartao-beneficios/regras-tab.tsx`** — nova coluna Serviço com autocomplete de procedimentos da clínica; ao selecionar serviço, trava especialidade/categoria; salva/carrega `procedimento_id`.
4. **Callers de `findRegra`** — passar o `procedimento_id` quando disponível:
   - `src/routes/_authenticated/app.caixa.tsx` (ao adicionar item ao caixa)
   - `src/routes/_authenticated/app.procedimentos.tsx` (preview de valores por convênio e recálculo)
   - `src/components/cartao-beneficios/regras-tab.tsx` (coluna "Exemplo")

## Detalhes técnicos
- Migration: `ALTER TABLE public.cb_convenio_regras ADD COLUMN procedimento_id uuid REFERENCES public.procedimentos(id) ON DELETE CASCADE;` + índice parcial `WHERE procedimento_id IS NOT NULL`. RLS/GRANTS já existentes cobrem a nova coluna.
- `findRegra(regras, especialidadeId, tipo, procedimentoId?)`:
  - filtro: se `r.procedimento_id` estiver setado, só bate quando `procedimentoId === r.procedimento_id`; caso contrário mantém regra atual (esp/tipo).
  - score: `procedimento_id ? 100 : 0` + `especialidade_id ? 10 : 0` + `tipo ? 5 : 0` + `prioridade * 0.01`.
- UI: reutilizar o padrão de select já usado para especialidade; carregar `procedimentos` da clínica no `load()` da aba.
- Sem migração de dados: regras existentes permanecem com `procedimento_id = null` (comportamento inalterado).

## Fora de escopo
- Regras por combinações (serviço + convênio + faixa) além do que já existe.
- Alterar o cálculo em telas que não usam `findRegra` hoje.
