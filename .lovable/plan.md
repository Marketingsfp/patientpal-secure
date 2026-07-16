## Problema

Na lista da agenda (`/app/agenda`), o ícone que indicava que o paciente tem cartão de convênio da clínica sumiu do lado do nome.

O código responsável ainda carrega os dados: existe um estado `convenioMap` (linha ~891 de `src/routes/_authenticated/app.agenda.tsx`) populado a partir de `contratos_assinatura` (titular) e `contrato_dependentes` (dependentes) — mapa `paciente_id → nome do convênio`. Porém, esse `convenioMap` **não é lido em lugar nenhum do JSX**, então o indicador visual não aparece.

O ícone `IdCard` (lucide) continua importado (linha 63), mas também não é usado na renderização.

## Correção

No `<TableCell>` do cliente (arquivo `src/routes/_authenticated/app.agenda.tsx`, por volta da linha 6753-6769), acrescentar — dentro do botão do nome do paciente, entre o `IdadeIcon` e o `<span>` do nome — um ícone `IdCard` que aparece somente quando o paciente tem cartão:

```tsx
{a.paciente_id && convenioMap.has(a.paciente_id) && (
  <IdCard
    className="h-3.5 w-3.5 text-emerald-600 shrink-0"
    aria-label={`Cartão ${convenioMap.get(a.paciente_id)}`}
  >
    <title>{`Cartão ${convenioMap.get(a.paciente_id)}`}</title>
  </IdCard>
)}
```

(A `<title>` interna funciona como tooltip nativo no SVG; se o Lucide não repassar filhos, uso um `<span title=...>` envolvendo o ícone.)

Regra visual:
- Só aparece quando `convenioMap` tem o `paciente_id` (paciente titular ou dependente com contrato ativo na clínica).
- Cor discreta (esmeralda) para diferenciar dos outros badges existentes (estrela de confirmado, ORÇ).
- Tooltip com o nome do convênio ao passar o mouse.

## Fora do escopo

- Não altera lógica de preço, `tipo_atendimento`, filtros ou busca.
- Não mexe na GR nem no caixa.
- Só a lista principal da agenda clássica — outras telas (agenda-v2, drawer) não estão no pedido.
