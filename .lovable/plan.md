## Ajuste

No cadastro de Convênio, o campo único **"Valor mensal"** vira uma **tabela de valores por nº de dependentes**, gerada automaticamente de acordo com o "Máx. dependentes" informado.

## Como vai funcionar na tela

Exemplo com "Máx. dependentes = 3":

| Nº de dependentes | Valor mensal (R$) |
|---|---|
| 0 (só titular) | 80,00 |
| 1 | 110,00 |
| 2 | 140,00 |
| 3 | 170,00 |

- Ao alterar "Máx. dependentes", as linhas se ajustam (preservando os valores já digitados nas faixas existentes).
- Os demais campos (Taxa de adesão, Nº parcelas, Fidelidade, Vigência, Benefícios, Modelo do contrato) permanecem como estão — único por convênio.
- Na listagem de Convênios, a coluna mostra "A partir de R$ X" usando a faixa de 0 dependentes.

## Detalhes técnicos

**Banco** — nova tabela `cb_convenio_valores`:
- `convenio_id` (FK → `cb_convenios`, ON DELETE CASCADE)
- `dependentes` (int)
- `valor_mensal` (numeric)
- UNIQUE (convenio_id, dependentes)
- RLS espelhando `cb_convenios` (membros leem, gestores escrevem)

Mantenho `cb_convenios.valor_mensal` como fallback/legado (não removo para não quebrar dados existentes), mas a UI passa a usar exclusivamente a nova tabela.

**Frontend** — `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`:
- Substituir o input "Valor mensal (R$)" por um bloco de tabela com uma linha por faixa de dependentes (0..max).
- Estado `valoresPorDep: Record<number, number>` sincronizado quando `maxDependentes` muda.
- No `save`, após upsert do convênio, deletar/inserir as linhas em `cb_convenio_valores`.
- No `openEdit`, carregar os valores existentes.
- Na listagem, exibir "A partir de R$ X" (linha de 0 dependentes).
