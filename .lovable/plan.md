## Diagnóstico

**O que está acontecendo:** O pagamento do repasse do Dr. Marcelo Barreto foi feito e existe no banco — o lançamento de despesa "REPASSE MEDICO — MARCELO BARRETO FRANCO DA SILVEIRA (9 ATEND.)" foi criado em 16/07/2026 (R$ 475,00) e os 9 atendimentos (datas 10/07, 14/07 e 15/07) estão corretamente marcados como `repasse_pago = true`, apontando para o mesmo `repasse_lancamento_id`.

**Por que não aparece na tela:** A aba **Comprovantes de repasse** (`src/components/financeiro/comprovantes-tab.tsx`, função `load()`) lê **apenas** da tabela `fin_atendimentos`. Só que os atendimentos do Dr. Marcelo Barreto (assim como praticamente todos os pagamentos vindos da agenda) ficam gravados em `fin_lancamentos` — não em `fin_atendimentos`. Resultado: o repasse existe, mas a lista o ignora.

Isso classifica como **erro de código** (fonte de dados incompleta na consulta), não regra de negócio nem dados inconsistentes. Os comprovantes dos dias 09/07 e 10/07 que aparecem hoje são justamente os que por acaso tinham origem em `fin_atendimentos`.

## O que vai mudar

Ampliar a consulta da aba Comprovantes de repasse para unificar as duas fontes que já são unificadas na tela de Atendimentos (`app.financeiro.atendimentos.tsx`): `fin_atendimentos` **e** `fin_lancamentos` com `repasse_pago = true`. Depois disso o agrupamento existente (por médico + `repasse_lancamento_id`) consolida naturalmente os N atendimentos em 1 comprovante — inclusive o do Dr. Marcelo com os 9 atendimentos e total de R$ 475,00.

## Escopo

**Dentro:**
- `src/components/financeiro/comprovantes-tab.tsx` → função `load()`: buscar em paralelo `fin_atendimentos` e `fin_lancamentos` (repasse_pago = true, filtrado por `repasse_pago_em` no período) e mapear ambos para o mesmo tipo `Row` que o resto do componente já usa. Nenhuma mudança no agrupamento, no filtro por médico, no modal ou na impressão.

**Fora:**
- Nenhuma migração de banco. Os dados já estão certos.
- Nenhuma alteração na RPC `pagar_repasse_medico`, no fluxo de pagamento, na tela de Atendimentos ou no caixa.
- Nenhuma refatoração ampla do componente.

## Validação

- Consulta manual no banco confirmando que o repasse de 16/07 do Dr. Marcelo aparece (`repasse_lancamento_id = fd9bb77f-…`, R$ 475,00, 9 itens).
- Reabrir a aba **Comprovantes de repasse** com o período que inclui 16/07 e confirmar visualmente que o comprovante aparece com médico, quantidade de pacientes, valor total, forma e conta corretos, e que o botão "Visualizar" lista os 9 atendimentos.
- Verificar que os comprovantes antigos (09/07 e 10/07) continuam aparecendo normalmente.
- Typecheck (`tsgo`).

## Riscos

- Como a fonte `fin_lancamentos` traz muitos registros, mantemos o filtro por `repasse_pago = true` + intervalo de `repasse_pago_em` + `clinica_id` e o mesmo `limit(5000)` já usado. A carga fica equivalente à da tela de Atendimentos, que já faz esse mesmo join com sucesso.
- Nenhum risco em módulos sensíveis (agenda, prontuário, permissões, LGPD). Alteração puramente de leitura, restrita a uma aba de relatório.
