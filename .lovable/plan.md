## Problema
Hoje é possível clicar em "Cobrar" no mesmo agendamento mais de uma vez e gerar dois lançamentos de receita, mesmo já estando marcado como "Pago" na Agenda.

## Solução (frontend + checagem no banco)

### 1. `src/routes/_authenticated/app.agenda.tsx`
- Em `cobrarAgendamento(a)`, antes de abrir o diálogo, verificar `pagosSet.has(a.id)`. Se já estiver pago, exibir `toast.info("Este agendamento já foi pago.")` e **não** abrir o `LancamentoDialog`.
- Aplicar a mesma checagem nos dois pontos que chamam `cobrarAgendamento` (botão direto e item do DropdownMenu) — basta centralizar na função.

### 2. `src/components/financeiro/lancamento-dialog.tsx`
Defesa adicional para evitar corrida (duplo clique antes do `pagosSet` ser atualizado, ou pagamento iniciado por outra aba):
- No handler de salvar, quando `agendamentoId` estiver definido e `tipo === "receita"`, consultar antes do `insert`:
  ```ts
  const { data: jaPago } = await supabase
    .from("fin_lancamentos")
    .select("id")
    .eq("agendamento_id", agendamentoId)
    .eq("tipo", "receita")
    .limit(1)
    .maybeSingle();
  if (jaPago) {
    toast.error("Este agendamento já possui um pagamento registrado.");
    onOpenChange(false);
    return;
  }
  ```
- Também desabilitar o botão "Salvar" enquanto a requisição estiver em andamento (se ainda não estiver), para evitar duplo clique.

### Fora do escopo
- Não vou criar constraint única no banco agora (poderia quebrar casos legítimos de estorno + novo pagamento). Se quiser, posso adicionar um índice único parcial em `fin_lancamentos(agendamento_id) WHERE tipo='receita'` num passo seguinte.
