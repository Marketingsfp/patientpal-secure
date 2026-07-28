## Objetivo
Exibir, no cabeçalho da tela **Clientes**, o total de pacientes cadastrados na clínica atual, atualizando automaticamente a cada ~15s.

## Escopo
- Somente frontend/presentação. Sem alterações de regra de negócio, RLS ou schema.
- Escopo do contador: `pacientes` da `clinica_id` atualmente selecionada em `useClinica()`.
- Frequência: polling de 15s (leve; usa `count: "exact", head: true`, sem trafegar linhas).

## Alterações
1. **Novo hook** `src/components/clientes-v2/use-total-pacientes.ts`
   - Recebe `clinicaId`.
   - Faz `supabase.from("pacientes").select("id", { count: "exact", head: true }).eq("clinica_id", clinicaId)`.
   - `useQuery` com `refetchInterval: 15_000`, `refetchOnWindowFocus: true`, `staleTime: 10_000`.
   - Retorna `{ total, loading }`.

2. **Cabeçalho da tela Clientes** (arquivo da rota/página que já renderiza o título "Clientes" — a localizar entre `src/routes/_authenticated/app.clientes*.tsx` / `src/components/clientes-v2/`).
   - Adicionar ao lado do título um badge discreto:
     `Pacientes: 12.345` (formatado `pt-BR`), com um pontinho verde pulsante indicando "ao vivo".
   - Enquanto `loading` e sem valor prévio, mostrar `…`.
   - Sem quebrar layout mobile (o badge quebra linha abaixo do título em telas < 480px).

## Fora do escopo
- Não altera a `ResumoBar` nem o `KPI Bar` já existentes (que refletem filtros/lista).
- Não altera `useClientesKpis` (RPC agregada), para não onerar o banco a cada 15s.
- Não mexe em Painel, Sidebar, nem em outras telas.

## Validação
- Abrir a tela Clientes, conferir que o número aparece e bate com `SELECT count(*) FROM pacientes WHERE clinica_id = :id`.
- Criar um paciente de teste em outra aba → em até 15s o número incrementa.
- Trocar de clínica no seletor → o número recarrega imediatamente.
- Sem erros no console; sem regressão visual no cabeçalho existente.

## Riscos
- Baixo. `head:true count:exact` é barato e respeita RLS. Se a tabela ficar muito grande no futuro, dá para trocar por `count: "estimated"` sem mudar a UI.
