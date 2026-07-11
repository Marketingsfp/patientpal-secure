## Diagnóstico

O ajuste anterior contava como "consumido" apenas agendamentos com `status = 'realizado'`. Mas o fluxo de pagamento na agenda **não altera o status** do agendamento — ele apenas:
- cria um `fin_lancamentos` (receita, confirmado) com `agendamento_id`
- seta `fluxo_etapa = 'triagem'`
- (o `data_pagamento` só é gravado se preenchido manualmente no formulário)

Ou seja, após pagar o 1º agendamento, ele continua `status = 'agendado'` e cai no bucket "pendente" da minha lógica → o 2º não vê ninguém pago e mantém o benefício.

## Correção

Em `src/routes/_authenticated/app.agenda.tsx`, no bloco de cálculo de limite (função que gera `beneficioInfo`, linhas ~434-520):

1. Após buscar `agsFiltrados` (agendamentos do dia na cota), consultar `fin_lancamentos`:
   ```
   supabase.from("fin_lancamentos")
     .select("agendamento_id")
     .eq("clinica_id", clinicaId)
     .eq("tipo", "receita")
     .eq("status", "confirmado")
     .in("agendamento_id", agsFiltrados.map(a=>a.id))
   ```
   Montar `Set<string> pagosIds`.

2. Redefinir "pago": `isPago(a) = a.status === 'realizado' || a.status === 'pago' || pagosIds.has(a.id)`. Isso pega tanto atendimentos já concluídos pelo médico quanto agendamentos que apenas foram cobrados no caixa.

3. `agsPagos` e `agsPendentes` usam esse novo critério. `usados = agsPagos.length` e a checagem de excedente / aviso informativo continuam como estão.

4. Para a query do passo 1 funcionar, incluir `id` no `.select()` de `agendamentos` (já vem `id`, mas garantir que `agsFiltrados` carregue `id`) — ajustar tipo local para incluir `id`.

## Fora do escopo
- Não alterar o fluxo de pagamento (não vamos passar a gravar `status='realizado'` na agenda — quebraria outros lugares).
- Não mexer em regras cadastradas nem no aviso informativo/duração do toast (já corretos).
