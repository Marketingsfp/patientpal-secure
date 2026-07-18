---
name: Feature flags por clínica (independência controlada)
description: Toda nova feature, alteração de layout ou comportamento divergível nasce com flag por clinica_id; correções globais só para bugs críticos
type: preference
---
Modelo escolhido pelo usuário: **híbrido com feature flags por clínica** (Opção B).
Objetivo: alterar algo em uma clínica sem impactar as outras, mantendo 1 código + 1 banco (evita fork/triplicação de manutenção).

**Regras:**
- Toda nova feature, ajuste de layout/UX ou mudança de comportamento que **possa** divergir entre clínicas DEVE nascer atrás de uma flag/config escopada por `clinica_id` (tabela `clinica_feature_flags` ou config equivalente).
- Antes de alterar tela/fluxo já existente, perguntar: "essa mudança deve valer para todas as clínicas ou só para a que pediu?". Default = só para a clínica que pediu, atrás de flag.
- Correções globais (sem flag, valendo para as 3 clínicas) são permitidas APENAS para:
  - bugs de segurança / RLS / vazamento entre tenants;
  - bugs de LGPD / dados clínicos / prontuário;
  - bugs financeiros críticos (cobrança errada, duplicidade, estorno quebrado);
  - correções de schema/migrations estruturais;
  - bugs que impedem o sistema de carregar.
  Qualquer outra "correção global" deve ser confirmada explicitamente com o usuário antes.
- Nunca usar `if (clinica.nome === "...")` no código. Divergência = flag/config lida por `clinica_id`, nunca hardcoded por nome.
- Menino Jesus é a baseline atual: NÃO alterar seu comportamento retroativamente para "padronizar" com outras clínicas sem pedido explícito.
- Ao criar uma flag nova, registrar: chave, descrição, default (geralmente `false` = comportamento antigo preservado), clínicas onde está ligada.

**How to apply:**
1. Antes de qualquer alteração de layout/comportamento/regra, classificar: (a) correção crítica global permitida, ou (b) mudança divergível → flag por clínica.
2. Se (b), ler flag da clínica ativa e ramificar UI/lógica por ela. Fallback = comportamento anterior.
3. Nunca ligar uma flag em clínica que não pediu.

**Why:** o usuário quer independência operacional entre as 3 clínicas sem pagar o custo de 3 sistemas separados (que gera divergência descontrolada, bug fix triplicado e risco de segurança). Feature flag por tenant é o padrão da indústria para esse cenário.