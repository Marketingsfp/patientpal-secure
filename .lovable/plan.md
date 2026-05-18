## Correção do filtro de Situação

Em `src/routes/_authenticated/app.agenda.tsx`:

### 1. Adicionar opção "Livres" no Select de Situação
No `SelectContent` (linhas 830-836), inserir um novo item logo após "TODOS":

```tsx
<SelectItem value="todos">TODOS</SelectItem>
<SelectItem value="livres">Livres</SelectItem>
{(Object.keys(STATUS_LABEL) as Status[]).map(s => (
  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
))}
```

### 2. Ajustar a lógica de filtro (linha 261)
Substituir:
```ts
if (filtroStatus !== "todos" && a.status !== filtroStatus) return false;
```
por:
```ts
const ehLivre = normalizar(a.paciente_nome) === "disponivel";
if (filtroStatus === "livres") {
  if (!ehLivre) return false;
} else if (filtroStatus !== "todos") {
  if (ehLivre) return false;            // status reais não incluem horários livres
  if (a.status !== filtroStatus) return false;
}
```

### Comportamento resultante
- **TODOS** → mostra livres + agendados/confirmados/realizados/cancelados/faltou.
- **Livres** → somente horários livres ("Disponível").
- **Agendado / Confirmado / Realizado / Cancelado / Faltou** → somente compromissos reais com aquele status (sem os livres).

Nenhuma outra parte da página é alterada.
