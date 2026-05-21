## Corrigir overflow no card "Informações rápidas"

Em `src/routes/_authenticated/app.index.tsx`, os botões `Abrir tabela` e `Perguntar à Nina` usam `flex-1` sem `min-w-0`. Quando a sidebar é expandida (área disponível menor) os dois botões lado a lado não cabem e estouram o card.

### Mudança

Trocar o container dos botões para empilhar quando estreito:

```tsx
<div className="flex flex-col sm:flex-row gap-2">
  <Button asChild size="sm" variant="default" className="flex-1 min-w-0">
    <Link to="/app/consulta-rapida" className="truncate">
      <BookOpen className="h-4 w-4 mr-1 shrink-0" /> Abrir tabela
    </Link>
  </Button>
  <Button asChild size="sm" variant="outline" className="flex-1 min-w-0">
    <Link to="/app/nina" className="truncate">
      <Brain className="h-4 w-4 mr-1 shrink-0" /> Perguntar à Nina
    </Link>
  </Button>
</div>
```

### Verificar outros pontos

Os demais KPI cards no `app.index.tsx` (Alertas, Agendamentos, Clientes, Retornos, Mensagens, Confirmações, Vendas, Pagamentos) já usam `truncate` ou layout simples — sem overflow visível na screenshot. Não vou modificar.

Se aparecerem outros pontos com texto saindo do card, ajustaremos pontualmente quando o usuário indicar.
