## Objetivo

Permitir cadastrar 1 benefício gratuito que cobre **Mamografia OU USG Mama** dentro do mesmo contrato, com estas regras:

- Libera após 6 mensalidades **pagas** (carência já existente).
- Cota única de 1 uso **por contrato inteiro** (titular + todos os dependentes disputam a mesma cota).
- Se qualquer um consumir Mamo grátis, USG Mama deixa de ser gratuita (e vice-versa).
- Quando a gratuidade foi consumida (ou ainda está na carência), o exame cai automaticamente na **regra padrão do convênio** (o desconto normal já cadastrado para aquele procedimento).

O sistema atual só suporta cota por procedimento isolado. Precisamos de um mecanismo de **grupo compartilhado** entre regras, config-first (sem hard-coding "mama").

## Modelagem (config-first)

### 1. Migration — novo campo `grupo_gratuidade` em `cb_beneficios`

- `grupo_gratuidade text NULL` — identificador livre do grupo (ex.: `mama-preventivo`). Regras com o mesmo valor compartilham a mesma cota.
- Novo valor para `excedente_modo`: `regra_padrao_convenio` — em vez de bloquear/aplicar particular, o motor procura a próxima regra não-gratuita do convênio para aquele procedimento.
- Índice em `(clinica_id, convenio_id, grupo_gratuidade)` para o motor consultar rápido.

Sem grupo (`NULL`) = comportamento atual, nada muda.

### 2. Motor de regras (`src/lib/cb-regras.ts` + contagem de uso)

Ao decidir se a regra gratuita se aplica a um agendamento:

1. Já cumpriu carência? (função existente `carenciaCumprida`).
2. Contar consumos considerando **todas** as regras do mesmo `grupo_gratuidade` no contrato — não só o `procedimento_id` da regra atual. Consumo = agendamentos concluídos + pendentes cobrados pelo benefício.
3. Se `usados >= limite_qtd`, aplicar `excedente_modo`. No modo novo `regra_padrao_convenio`, `findRegra` retorna a próxima melhor regra **não-gratuita** do convênio para aquele procedimento.

Ajustar também `aviso-limite-pendentes.ts` para agrupar pendentes por grupo (não só por procedimento normalizado) quando `grupo_gratuidade` existir.

### 3. UI — aba Benefícios (`src/components/cartao-beneficios/regras-tab.tsx`)

- Novo campo opcional **"Grupo de gratuidade"** no editor da regra (input texto com autocomplete dos grupos já usados no convênio).
- Quando 2+ regras compartilham grupo, mostrar badge "Compartilha cota com: Mamografia, USG Mama".
- No seletor de `excedente_modo`, adicionar opção **"Aplicar regra padrão do convênio"**.
- Validação: se `grupo_gratuidade` preenchido em uma regra, exigir `gratuito=true` e `limite_qtd>=1`.

### 4. Cadastro do caso do usuário (feito na UI depois da migration)

O usuário cria 2 regras no convênio:

| Regra | Procedimento | Gratuito | Carência | Limite qtd | Escopo | Grupo | Excedente |
|---|---|---|---|---|---|---|---|
| 1 | Mamografia | ✔ | 6 | 1 | contrato | `mama-preventivo` | regra_padrao_convenio |
| 2 | USG Mama | ✔ | 6 | 1 | contrato | `mama-preventivo` | regra_padrao_convenio |

Pré-requisito: já existirem regras não-gratuitas cadastradas para Mamografia e USG Mama (o desconto normal do convênio) — sem elas o fallback vira "sem benefício".

## Detalhes técnicos

- Migration: `ALTER TABLE cb_beneficios ADD COLUMN grupo_gratuidade text;` + índice parcial `WHERE grupo_gratuidade IS NOT NULL`.
- `findRegra` recebe um parâmetro opcional `excludeGratuito` para o fallback.
- Contagem de uso hoje já roda por `procedimento_id`; refatorar para receber lista de procedimentos do grupo.
- Audit log: registrar alterações de `grupo_gratuidade` e do novo modo de excedente (padrão da plataforma).
- Sem impacto em regras existentes (todos os campos novos são opcionais/nulos).

## Riscos e rollback

- **Risco:** contratos com muitos dependentes podem gerar corrida (2 pessoas marcam no mesmo instante). Mitigação: contagem inclui pendentes + trava otimista no momento da confirmação do agendamento (mesma que já é feita para `limite_qtd`).
- **Rollback:** coluna é opcional; dropar coluna e reverter dois arquivos (`cb-regras.ts`, `regras-tab.tsx`) restaura o estado atual.

## Testes

- Unit: `findRegra` retorna corretamente a regra não-gratuita quando `excludeGratuito=true`.
- Unit: contagem soma consumos de todos os procedimentos do grupo.
- E2E manual: criar contrato, pagar 6 mensalidades, agendar Mamo grátis → tentar USG Mama grátis para dependente → sistema deve oferecer só o desconto padrão.
