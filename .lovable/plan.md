## Objetivo

Na lista `/app/clientes`, exibir ao lado do nome do paciente um badge indicando que ele possui convênio (Cartão Benefícios) ativo — no mesmo padrão visual usado hoje na busca de pacientes (agenda/caixa): pill verde "Associado - titular — {Convênio}" ou "Associado - dependente — {Convênio}". Vale para todas as clínicas.

## Escopo

- **Somente** a coluna "Nome" da tabela em `src/routes/_authenticated/app.clientes.index.tsx`.
- Sem alteração em busca, filtros, exportação, edição ou visualização de paciente.
- Sem alteração de banco: usaremos as tabelas já existentes (`contratos_assinatura`, `contrato_dependentes`, `planos_assinatura`).

## Como identificar o convênio

Para cada página de resultados exibida (até 500 pacientes):

1. Buscar em `contratos_assinatura` os contratos com `status = 'ativo'` da clínica atual onde `paciente_id ∈ ids` → cada match = **titular** (guarda `plano_id`).
2. Buscar em `contrato_dependentes` (join com `contratos_assinatura` ativos) onde `paciente_id ∈ ids` e `ativo = true` → cada match = **dependente**.
3. Resolver `planos_assinatura.nome` pelos `plano_id` coletados.
4. Montar mapa `pacienteId → { tipo: 'titular' | 'dependente', convenio: string }`. Se o paciente for titular e dependente, prioriza **titular**.

Consulta feita via React Query, com `queryKey` baseada na lista de IDs visíveis, `staleTime` de 60s, e invalidação junto com `refrescar()`.

## UI

Ao lado do `<span>{p.nome}</span>` (linha ~419), adicionar (quando houver convênio):

```
<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
  Associado - {titular|dependente} — {Nome do plano}
</span>
```

Mesmas cores/tamanho já usados em `patient-search-input.tsx` para manter consistência com a agenda. Quando o paciente **não** tiver convênio ativo, nada é exibido (na lista de clientes não faz sentido marcar todos como "Particular").

## Fora do escopo

- Ficha do paciente, busca global, agenda e exportação Excel — não serão tocados.
- Nenhuma migration ou alteração em RPC.

## Detalhes técnicos

- Novo hook local `useConveniosDosPacientes(clinicaId, ids)` dentro do próprio arquivo da rota (ou em `src/lib/`), usando `supabase.from(...)` no cliente. RLS já filtra por clínica.
- A consulta roda **depois** que `items` chega, sem bloquear a renderização da tabela (o badge aparece assim que os dados de convênio chegam).
- Sem impacto nos dois caminhos existentes (manual e `ux_melhorias`): o badge lê do mapa, que fica vazio até o fetch retornar.
