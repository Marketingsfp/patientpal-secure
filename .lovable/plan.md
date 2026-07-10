# Levantamento Cluster A — Divergência de valores GR ↔ Financeiro Atendimentos

**Modo:** somente leitura. Nenhuma correção, migration ou alteração de código será proposta neste turno.

## Escopo

5 sintomas reportados em 09/07/2026:

| # | Prompt | Sintoma |
|---|--------|---------|
| A1 | #5396 | GR = R$ 10,40 (correto) vs Financeiro Atendimentos = R$ 52,00 |
| A2 | #5370 | Serviço na aba Especialidade do médico não aparece na aba Repasse |
| A3 | #5178 | 1 agendamento 09/07 aparece como 2 registros 08/07 no Financeiro |
| A4 | #5166 | Número da GR impressa diferente do número na agenda |
| A5 | #5040 | GR nº 10 impressa, sistema mostra nº 11; auditoria em branco |

## O que o levantamento vai entregar (por sintoma)

Para cada A1–A5:

1. **Superfície(s) afetada(s)** — arquivo:linha do componente que renderiza o valor divergente.
2. **Fonte de dados de cada superfície** — tabela(s) e coluna(s) lidas (dentre `procedimento_split_regras`, `regras_rateio`, `medico_procedimentos`, `medico_convenios`, `procedimento_cb_convenio_valores`, `procedimento_unidade_regras`, `fin_atendimentos`, `agendamentos`, `gr_impressoes`).
3. **Função de cálculo** — RPC ou query `.select()` que computa o valor / número / data em cada superfície.
4. **Ponto de divergência provável** — se as duas superfícies leem tabelas diferentes, cálculos diferentes, timezones diferentes ou snapshots congelados em momentos diferentes.
5. **Evidência de banco** — 1 SELECT read-only por sintoma, mostrando as linhas reais que produzem a divergência (paciente/GR citados nas evidências do usuário quando possível).

## Formato final

Para cada sintoma:

```
### A<n> — <título>
Superfície A: <arquivo:linha> lê <tabela.coluna> via <query/RPC>
Superfície B: <arquivo:linha> lê <tabela.coluna> via <query/RPC>
Divergência: <onde bifurca>
Evidência SQL: <resultado do SELECT>
Validação humana necessária: <sim/não + o quê>
```

Sem recomendações de correção. Sem alteração de arquivos.

## Próximo passo

Aguardar o subagente de exploração de código terminar, cruzar com SELECTs read-only no banco, e entregar o relatório. Após entrega, aguardo seu comando para atacar A1, A2… ou pular para outro cluster.
