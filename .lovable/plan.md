# Unificação do motor de descontos — Agenda + Caixa lendo a mesma fonte

## Diagnóstico dos 4 eixos

- 💰 **Financeiro**: hoje a agenda e o caixa podem aplicar descontos diferentes para o mesmo paciente/procedimento (duas tabelas paralelas). Risco de perda ou cobrança inconsistente. A unificação elimina esse gap.
- ⏱️ **Operacional**: recepção deixa de precisar editar em dois lugares. Uma alteração de valor de convênio passa a valer imediatamente em toda a jornada.
- 😊 **Experiência**: paciente não recebe orçamento com um valor e é cobrado com outro no caixa.
- 🛡️ **Auditoria**: fonte única facilita log de alteração de valor (por regra, com histórico).

**Nada do que já foi lançado é reprocessado.** Agendamentos, pagamentos, `fin_atendimentos`, mensalidades e caixa do dia ficam intactos — o valor gravado no ato do lançamento continua valendo. A mudança vale só para lançamentos futuros.

---

## Comparativo das duas tabelas (dados de hoje)

**Volumetria**

| Tabela | Registros | Ativos |
|---|---|---|
| `cb_beneficios` (usada pela Agenda) | 84 | 84 |
| `cb_convenio_regras` (usada pelo Caixa) | 103 | 103 |

**Diff por chave `(convênio + especialidade + procedimento)`**

| Situação | Qtd |
|---|---|
| Em ambas as tabelas (mesma chave) | 83 |
| Só em `cb_convenio_regras` (Caixa tem, Agenda não) | 20 |
| Só em `cb_beneficios` (Agenda tem, Caixa não) | **1** |

**A única regra órfã na Agenda:**

| Convênio | Procedimento | Tipo | Valor | Nome |
|---|---|---|---|---|
| `36af070b…` | `e25d3119…` | percentual | 10% | PREVENTIVO |

→ ao migrar, precisa ser criada em `cb_convenio_regras` para não perder esse desconto.

As 20 regras que só existem em `cb_convenio_regras` já não estavam sendo aplicadas pela agenda hoje — a unificação **passa a aplicá-las**, o que é o comportamento correto (o convênio foi cadastrado, mas a agenda não enxergava).

---

## Plano de execução (5 passos, controlado)

### Passo 1 — Migrar a regra órfã
Inserir em `cb_convenio_regras` o equivalente da regra "PREVENTIVO" 10% do convênio `36af070b…`. Um único INSERT, sem tocar em nenhum outro dado.

### Passo 2 — Trocar o motor da Agenda
Em `src/routes/_authenticated/app.agenda.tsx` (bloco ~linha 333, onde hoje lê `cb_beneficios`), substituir pela mesma dupla que o caixa já usa:
- `findRegra()` + `computeValor()` de `src/lib/cb-regras.ts`
- lendo `cb_convenio_regras` filtrado pelo convênio do contrato do paciente
- respeitando `carencia_mensalidades`, `limite_qtd/periodo/escopo`, `excedente_*`, `gratuito` — tudo já implementado

Nenhuma mudança na criação/edição do agendamento (`criar-agendamento.functions.ts` fica intacto — regras contratuais do Passo B preservadas).

### Passo 3 — Feature flag de segurança
Ligar via flag (`motor_descontos_unificado`) com default OFF. Ativar primeiro para admin/gestor e observar 1–2 dias antes de liberação geral. Rollback = desligar a flag.

### Passo 4 — Aba "Benefícios (regras)" vira read-only
Mantém a aba visível como **catálogo de marketing** (o que o cartão anuncia), mas o CRUD passa a acontecer só em "Regras de Preço". Um botão "Sincronizar do motor" gera a lista do catálogo a partir de `cb_convenio_regras`.

### Passo 5 — Validação e encerramento
- Playwright: 6 cenários (particular, convênio ativo, convênio com carência, gratuidade, excedente, inadimplência).
- Conferir no banco: 0 divergência entre valor da agenda e valor do caixa em 20 lançamentos de teste.
- Relatório de encerramento (funcionalidades, rollback, impacto, docs).

---

## O que NÃO muda

- Lançamentos de hoje e anteriores: intocados.
- Estrutura de `cb_beneficios`: tabela permanece (fonte do catálogo/marketing) — nada é deletado nesta fase.
- `criar-agendamento.functions.ts`: intocado (contratual Passo B).
- Caixa/orçamento: já usa `cb_convenio_regras` — nenhuma mudança.
- Mensalidades, cartões, contratos, inadimplência: intocados.

## Detalhes técnicos

- Arquivo afetado principal: `src/routes/_authenticated/app.agenda.tsx` (~linha 333).
- Reutiliza `src/lib/cb-regras.ts` (`findRegra`, `computeValor`, `carenciaCumprida`).
- Migração SQL: 1 INSERT em `cb_convenio_regras`.
- Feature flag: novo hook `use-motor-descontos-flag.ts` (mesmo padrão de `use-agenda-v2-flag.ts`).
- Zero mudança de schema além do INSERT de dados.

## Tempo estimado
- Migração da regra órfã + código: ~1h
- Testes Playwright + validação: ~1h
- Liberação gradual: 1–2 dias de observação

## Ganho esperado
Fim das divergências agenda × caixa. Um único lugar para editar valor de convênio. Base pronta para log de auditoria de alteração de preço.
