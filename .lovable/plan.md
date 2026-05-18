## Identificar agendamentos pagos na coluna "Alertas"

Hoje, ao registrar um pagamento via `cobrarAgendamento`, o `LancamentoDialog` insere em `fin_lancamentos` sem amarrar o lançamento ao agendamento. Sem esse vínculo é impossível saber, no carregamento da Agenda, quais agendamentos já foram pagos. A solução tem 3 partes: schema, gravação e UI.

### 1. Banco (migration)
Adicionar a coluna `agendamento_id` em `fin_lancamentos`:

```sql
alter table public.fin_lancamentos
  add column if not exists agendamento_id uuid
    references public.agendamentos(id) on delete set null;

create index if not exists fin_lancamentos_agendamento_id_idx
  on public.fin_lancamentos(agendamento_id);
```

### 2. Gravação (`lancamento-dialog.tsx`)
- Adicionar prop opcional `agendamentoId?: string | null` em `LancamentoDialogProps`.
- Incluir `agendamento_id: agendamentoId ?? null` no objeto passado ao `supabase.from("fin_lancamentos").insert(...)` (linha ~153).

Em `app.agenda.tsx`, no `<LancamentoDialog ... />` (após o `pagamentoAgId` ser definido por `cobrarAgendamento`), passar:
```tsx
agendamentoId={pagamentoAgId}
```

### 3. UI da Agenda (`src/routes/_authenticated/app.agenda.tsx`)
- Após `load()` dos agendamentos, fazer um segundo fetch para descobrir quais foram pagos:

```ts
const ids = (data ?? []).map(a => a.id);
let pagos = new Set<string>();
if (ids.length) {
  const { data: pg } = await supabase
    .from("fin_lancamentos")
    .select("agendamento_id")
    .eq("clinica_id", clinicaAtual.clinica_id)
    .eq("tipo", "receita")
    .in("agendamento_id", ids);
  pagos = new Set((pg ?? []).map(r => r.agendamento_id).filter(Boolean) as string[]);
}
setPagosSet(pagos);
```

- Novo estado: `const [pagosSet, setPagosSet] = useState<Set<string>>(new Set());`

- Na célula da coluna "Alertas" (hoje renderiza apenas o badge de situação, linhas 934-936), exibir, quando `pagosSet.has(a.id)`, um badge "Pago" ao lado, com cor diferenciada (verde forte) usando os tokens do design system:

```tsx
<TableCell className="text-center">
  <div className="inline-flex items-center gap-1 flex-wrap justify-center">
    <Badge className={STATUS_COR[a.status]}>{STATUS_LABEL[a.status]}</Badge>
    {pagosSet.has(a.id) && (
      <Badge className="bg-emerald-600 text-white border border-emerald-700 hover:bg-emerald-600">
        Pago
      </Badge>
    )}
  </div>
</TableCell>
```

- Após salvar um novo pagamento (callback `onSavedWithData` do dialog), atualizar localmente: `setPagosSet(prev => new Set(prev).add(pagamentoAgId))`, para o badge aparecer imediatamente sem precisar recarregar.

### Resultado
- Cada agendamento que tiver pelo menos um lançamento de receita vinculado aparece com um badge **Pago** verde na coluna Alertas, ao lado do badge de situação atual.
- Lançamentos antigos sem vínculo continuam não marcados (não há como inferir retroativamente); a partir desta mudança, todo novo pagamento feito pela Agenda fica devidamente marcado.
