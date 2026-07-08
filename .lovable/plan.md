## Objetivo

Na 2ª via do comprovante de repasse, mostrar em cada linha da tabela a **data e hora do pagamento ao médico** (além dos campos já existentes: Data do atendimento, Médico, Paciente, Serviço, Valor pago).

## Mudanças em `src/routes/_authenticated/app.financeiro.atendimentos.tsx`

1. **Tipo `CompItem`** — adicionar `pagoEm: string | null` (data do pagamento, `YYYY-MM-DD`) e `pagoHora: string | null` (HH:mm quando disponível).

2. **`buildComprovante`** — ao montar cada `row`, derivar de cada `a` (Atend):
   - `pagoEm = a.repasse_pago_em ?? (a.repasse_pago_at ? a.repasse_pago_at.slice(0,10) : null)`
   - `pagoHora` calculado com a mesma regra anti-backfill já usada para `horaPagamento` do cabeçalho (comparar componentes em UTC; se `00:00:00 UTC`, tratar como "sem horário" e retornar `null`; senão formatar HH:mm em horário local).

3. **Tabela do comprovante (JSX ~linha 2155)** — inserir nova coluna **"Pago em"** entre "Data" e "Médico":
   - Cabeçalho: `<th>Pago em</th>`.
   - Linha: exibir `dd/mm/aaaa` + (quando houver) `` às HH:mm``; quando não houver hora, mostrar só a data.
   - Quando `pagoEm` for `null` (raríssimo — item sem registro de pagamento), mostrar "—".
   - Ajustar `colSpan` do rodapé Total de `4` para `5`.

## Fora de escopo

- Não altera cabeçalho do comprovante (que já mostra "Data e hora do pagamento" agregado).
- Nenhuma migration ou mudança em gravação.
- Sem mudar demais telas.
