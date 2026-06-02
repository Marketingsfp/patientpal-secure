## Diagnóstico

Os cards de **Movimento de Caixa** estão errados porque a página busca a tabela `fin_lancamentos` e soma os valores no navegador (JavaScript). O Supabase tem um limite padrão de **1.000 linhas por consulta**, então quando o período tem mais de 1.000 lançamentos, a soma é calculada só sobre os primeiros 1.000 e o resto é ignorado.

**Evidência real (POLICLINICA MENINO JESUS, 03/05/2026 – 02/06/2026):**

| Tipo | Status | Qtd | Total real no banco | Exibido no card |
|---|---|---:|---:|---:|
| Receita | confirmado | 12.299 | **R$ 1.011.125,00** | R$ 59.854,00 |
| Despesa | confirmado | 976 | **R$ 718.352,00** | R$ 10.765,00 |

Ou seja, os cards estão mostrando ~6% do valor real.

O **mesmo erro estrutural** existe em todas as telas de Financeiro que somam `fin_lancamentos` no front:

- `app.financeiro.movimento.tsx` — cards Receitas / Despesas / Saldo
- `app.financeiro.index.tsx` — dashboard inicial (Receitas, Despesas, Saldo)
- `app.financeiro.estatisticas.tsx` — KPIs do mês
- `app.financeiro.analitico.tsx` — séries por dia/categoria
- `app.financeiro.bi.tsx` — série Receitas × Despesas
- `app.financeiro.relatorios.tsx` — totais do relatório

## Solução

Mover a agregação para o banco com 2 funções SQL (RPC) que somam direto no Postgres, sem limite de 1.000 linhas:

1. **`fin_resumo_periodo(p_clinica, p_ini, p_fim)`** → retorna totais agregados:
   `tipo, status, qtd, total`. Usada pelos cards e KPIs (Movimento, Dashboard, Estatísticas, Relatórios).

2. **`fin_serie_diaria(p_clinica, p_ini, p_fim)`** → retorna série por dia:
   `data, tipo, total`. Usada por Analítico e BI Financeiro.

Ambas com `SECURITY DEFINER` e validação de acesso à clínica via `clinica_membros` (mesmo padrão das outras RPCs do projeto).

## Mudanças no front

Em todas as 6 páginas listadas: substituir o `supabase.from("fin_lancamentos").select(...)` + `.reduce()` por uma chamada `supabase.rpc("fin_resumo_periodo", { ... })` (ou `fin_serie_diaria`) para calcular **só os totais/séries**.

A **tabela de lançamentos** em `Movimento de Caixa` continua usando a query atual, mas:
- Passa a aplicar `.range(0, 499)` (mostrando os 500 mais recentes do período) com aviso "Mostrando 500 de N lançamentos – use o filtro de data para refinar" quando o total exceder 500.
- O total real do período continua vindo da RPC, então os cards ficam corretos mesmo quando a tabela mostra só um subset.

## Critério dos cards

Por padrão, somar **apenas lançamentos com `status = 'confirmado'`** (que é o significado de "Movimento de Caixa" = caixa realizado). Cancelados e pendentes ficam fora. Hoje a página soma tudo, incluindo cancelados — esse também é um bug.

Se você preferir incluir pendentes (caixa projetado), ajusto depois com uma chave única.

## Validação

Após implementar, abrir Movimento (mesmo período da imagem) e confirmar:
- Receitas = R$ 1.011.125,00
- Despesas = R$ 718.352,00
- Saldo = R$ 292.773,00

E refazer a checagem nas outras 5 telas (Dashboard, Estatísticas, Analítico, BI, Relatórios).

## Fora de escopo

- Permissões / RLS (já estão corretas).
- Tela de Atendimentos (usa `fin_atendimentos`, não `fin_lancamentos` — preciso verificar separadamente se você confirmar que há números errados lá também).
- Cadastro e edição de lançamentos.
