
# Hardening do módulo Orçamentos

Escopo: aplicar as validações e melhorias solicitadas + as correções ALTA/MÉDIA da auditoria da Rodada 3, sem alterar regras de negócio de Agenda, Caixa, Financeiro, NFS-e ou Comissões.

Antes de começar, farei uma **análise de impacto cruzado** (leitura only) para garantir que nada quebra fora de Orçamentos.

---

## Fase 0 — Análise de impacto (read-only, 1 rodada)

Investigar como Orçamentos conversa com o resto do sistema:

- **Agenda** → `agendamento_orcamento_itens`, botão "Transformar em agendamento" (será criado; hoje o link é do lado da agenda).
- **Caixa** → orçamento não gera movimento no caixa diretamente; só via `fin_atendimentos`/`pagamentos`. Confirmar.
- **Financeiro** → `orcamentos.forma_pagamento` e `valores_pagamento` são informativos até virar atendimento; nada é lançado.
- **NFS-e** → nunca emite direto de orçamento. Confirmar que não há gatilho.
- **Comissões / splits** → `procedimento_split_regras` só aplica no fechamento do atendimento, não no orçamento. Confirmar.

Entrego mini-relatório de impacto antes de escrever qualquer código.

---

## Fase 1 — Validações de dados (regras rígidas)

### 1. Desconto
- `desconto >= 0`
- `desconto <= subtotal` (nunca gera total negativo)
- Se o input for percentual (novo toggle "% / R$"): `0 ≤ % ≤ 100`
- Recalcula `valor_total` em tempo real
- Toast/inline error claro em PT-BR

### 2. Validade
- Default: 30 dias
- `validade_dias >= 1`
- Bloqueia salvar se `< 1`

### 3. Observações
- `maxLength = 1000`
- Contador `x / 1000` abaixo do textarea
- Trunca no paste

### 4. Quantidade e valor unitário dos itens
- `quantidade >= 1` (inteiro)
- `valor_unitario >= 0`
- Se `procedimento.permite_valor_zero = false` (regra existente), bloqueia zero
- `valor_total = quantidade * valor_unitario` (recálculo automático)

### 5. Formas de pagamento (UX)
- Máximo 2 formas simultâneas (regra já existente).
- Ao selecionar a 2ª, **desabilitar visualmente** as demais (não desmarcar).
- Ao desmarcar uma, reabilitar as outras **sem limpar** os valores digitados.
- Preservar `valores_pagamento` e `valores_formas` no state.

### 6. Bloqueio de edição/exclusão
- Orçamento com status `aprovado`, `convertido`, `cancelado` → somente leitura.
- Exclusão: `AlertDialog` com confirmação obrigatória (já existe em alguns lugares — padronizar).

---

## Fase 2 — Auditoria e histórico

### 7. Auditoria administrativa de categorização
Nova tabela `orcamento_auditoria_categoria` (log, não bloqueante):
- Quando salvar item cujo procedimento tem `categoria` suspeita (regra: valor médio muito fora do padrão da categoria, ou `categoria IS NULL`), registrar linha para revisão do admin.
- Página `/app/auditoria` ganha aba "Categorização de procedimentos".
- **Não bloqueia** o usuário.

### 8. Histórico de alterações do orçamento
Já existe `audit_log` global via trigger. Ação:
- Confirmar que `orcamentos` e `orcamento_itens` têm `fn_audit_trigger`. Se não, adicionar.
- Nova aba "Histórico" no dialog do orçamento lendo `audit_log` filtrado por `record_id`.
- Mostrar: quem criou, quem alterou, data/hora, campos alterados.

Para "quem criou/alterou" preciso das colunas `created_by uuid` e `updated_by uuid` em `orcamentos`. Adicionar via migration + trigger para preencher automaticamente com `auth.uid()`.

---

## Fase 3 — Ações rápidas

### 9. Vencimento
- Badge no card do orçamento:
  - `vencido` (>= validade) → vermelho
  - `vence em ≤ 3 dias` → âmbar
  - resto → neutro
- Filtro rápido "Vencidos" e "Vencendo".

### 10. Duplicar orçamento
- Botão "Duplicar" no card e no dialog.
- Cria novo orçamento com os mesmos itens, `numero` novo, `status='rascunho'`, `created_at=now()`.
- Mantém procedimentos, quantidade, valores, desconto, formas — troca só o número e a data.

### 11. Converter em agendamento
- Botão "Agendar" abre o dialog de novo agendamento pré-preenchido com paciente + procedimento principal + valor.
- Após criar agendamento, grava vínculo em `agendamento_orcamento_itens` e marca orçamento como `convertido`.

### 12. Converter em venda (atendimento/caixa)
- Botão "Registrar venda" abre modal para criar `fin_atendimentos` direto, sem passar pela agenda (para vendas balcão).
- Aplica formas de pagamento definidas no orçamento.
- Marca orçamento como `convertido`.

---

## Fase 4 — Performance de salvamento

### 13. Atualização otimista
- Hoje: `queryClient.invalidateQueries(['orcamentos'])` → refetch da lista inteira.
- Depois: mutation retorna o registro atualizado; `queryClient.setQueryData` faz merge in-place; refetch em background só se necessário.
- Reduz tempo percebido de save em ~70%.

---

## Fase 5 — Impressão moderna

### 14. Alternativa a `window.open`
- Manter `printOrcamento` como fallback.
- Nova rota `/imprimir/orcamento/$id` (dentro de `_authenticated`) renderiza o cupom em HTML/CSS pronto para `window.print()` na própria aba, sem popup.
- Botão "Imprimir" abre a rota em nova aba com `<a target="_blank">` (não bloqueado por popup blocker moderno pois é iniciado por clique direto).
- Se o browser permitir, chama `window.print()` no `useEffect`.

---

## Fase 6 — Segurança final (checklist)

Confirmar via testes automatizados:
- ❌ valor negativo em qualquer campo numérico
- ❌ quantidade negativa ou zero
- ❌ preço zero quando `permite_valor_zero=false`
- ❌ desconto > subtotal
- ❌ edição de orçamento `convertido`/`cancelado`
- ❌ exclusão sem confirm

Todos os inputs numéricos com `min`, `step`, e validação Zod no submit.

---

## Fase 7 — Testes e comparativo final

- Rodar `bunx vitest run` (suíte existente).
- Adicionar testes novos:
  - `orcamento-validations.test.ts` (desconto, validade, observações, quantidade)
  - `orcamento-formas-pagamento.test.ts` (UX 2 formas)
  - `orcamento-auditoria.test.ts` (log de categoria suspeita)
- Medição:
  - tempo p/ abrir dialog
  - tempo p/ salvar (antes vs depois)
  - cliques necessários para ações comuns
  - bugs encontrados vs corrigidos

Entrego tabela **ANTES / DEPOIS** ao final.

---

## Ordem de execução

1. Fase 0 — impacto cruzado (só leitura, entrego relatório).
2. **Ponto de aprovação** — você valida o relatório.
3. Fases 1 → 7 em sequência, cada fase com commit lógico próprio.
4. Ao fim, testes + comparativo.

---

## Fora de escopo (intencional)

- Não altero regras de comissão/split.
- Não altero fluxo de NFS-e.
- Não altero fluxo de caixa/fin_atendimentos além de criar o gancho "Registrar venda" (que usa o mesmo caminho já existente).
- Não mexo em Agenda além de reusar o dialog "Novo agendamento".

Aprova para eu começar pela Fase 0 (análise de impacto)?
