## O que corrigir

Duas correções, ambas em telas do Financeiro:

### 1. Desfazer a baixa da ficha 004 realmente "desmarca como pago"

Hoje, na aba **Financeiro → Atendimentos**, o botão "Desfazer baixa" só volta o `agendamentos.status` para `confirmado`. Só que a ficha 004 (Glicemia) tem também um `fin_lancamentos` **sombra de R$ 0,00** ("SEM COBRANÇA") vinculado ao agendamento — e é ele que faz o `$` da agenda continuar verde e o sistema considerar "pago no caixa".

Ajuste em `desfazerBaixa` (`src/routes/_authenticated/app.financeiro.atendimentos.tsx`):

- Além de reverter o status, apagar qualquer `fin_lancamentos` vinculado ao `agendamento_id` (ou ao `fin_atendimentos.id`) que tenha valor **R$ 0,00** (lançamento-sombra sem impacto no caixa).
- Se existir `fin_lancamentos` com valor > 0, **não** apagar automaticamente — mostrar toast pedindo estorno pelo Mov. Caixa antes (mantém a trilha financeira íntegra).
- Atualizar o texto de confirmação para deixar claro: "O atendimento volta para 'Confirmado' e deixa de constar como pago."

Resultado: a ficha 004 volta a aparecer como pendente de pagamento na agenda e nas telas dependentes.

### 2. Mov. Caixa sem limite fixo, com paginação de 100/página

Em `src/routes/_authenticated/app.financeiro.movimento.tsx` hoje há três limitadores: `.range(0, 499)` nos dois `select` (fin_lancamentos e caixa_movimentos) e `merged.slice(0, 500)` no merge final.

Mudanças:

- Remover o corte fixo de 500.
- Adicionar estado `page` (1-based) e constante `PAGE_SIZE = 100`.
- Buscar as duas fontes com `.range(0, N)` grande o suficiente para o período filtrado (usar `count: "exact", head: true` para saber o total real) e paginar **após o merge/ordenação** no cliente — mantém a ordenação cronológica correta entre `fin_lancamentos` e `caixa_movimentos`.
- Guardar `totalRows` do merge para exibir "Página X de Y — N lançamentos".
- Rodapé da tabela: botões **Anterior / Próxima** + seletor de página; resetar para página 1 sempre que qualquer filtro (tipo, data, status, usuário, forma, paciente) mudar.
- Para períodos muito grandes (>5.000 linhas), aplicar fetch em chunks de 1.000 com `.range(offset, offset+999)` em loop, igual já é feito em `loadResumo`, para evitar o teto do PostgREST.

Sem mudanças no schema nem no backend.

## Detalhe técnico

- `desfazerBaixa`: após o `update` do status, rodar:
  ```ts
  const { data: sombra } = await supabase
    .from("fin_lancamentos")
    .select("id, valor")
    .eq(a.origem === "agenda" ? "agendamento_id" : "atendimento_id", a.origem === "agenda" ? a.agendamento_id : a.id);
  const zero = (sombra ?? []).filter(l => Number(l.valor) === 0);
  const naoZero = (sombra ?? []).filter(l => Number(l.valor) > 0);
  if (naoZero.length) { toast.error("Há lançamento pago no caixa — estorne pelo Mov. Caixa antes."); return; }
  if (zero.length) await supabase.from("fin_lancamentos").delete().in("id", zero.map(l => l.id));
  ```
  (Ajustar nomes de coluna conforme o schema real de `fin_lancamentos` — validar se é `agendamento_id`/`atendimento_id`.)

- Mov. Caixa paginação: manter o cálculo do resumo (cards Receita/Despesa/Saldo) inalterado — ele já usa RPC agregado e chunks de 1.000, então continua correto independente da paginação da tabela.
