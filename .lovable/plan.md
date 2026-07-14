## Objetivo

Validar em produção, **usando apenas dados fictícios prefixados `SIM_`**, que a correção da aba **Caixa > Movimentos** faz o paciente aparecer corretamente na lista para a atendente em todos os caminhos possíveis, e que ele deixa de aparecer nos casos em que antes sumia.

Não vou tocar em nenhum registro real. Não vou usar UI. Tudo será feito por `INSERT` direto no banco e `DELETE` no final do próprio teste.

## Escopo — 3 cenários

Cada cenário reproduz um caminho diferente de como o paciente chega até a linha de Movimentos. Antes da correção, o cenário 2 e o cenário 3 falhavam.

### Cenário 1 — Cobrança padrão (paciente pelo `fin_lancamentos.paciente_id`)
- Insere `pacientes` fictício `SIM_TESTE1 CAIXA MOVIMENTOS`.
- Insere `fin_lancamentos` com `paciente_id` preenchido, `tipo='receita'`, `descricao='SIM_TESTE1 CAIXA MOVIMENTOS · CONSULTA'`.
- Insere `caixa_movimentos` (tipo `recebimento`) apontando para esse lançamento, em uma sessão fictícia `SIM_SESSAO_TESTE`.
- **Esperado:** coluna Paciente exibe `SIM_TESTE1 CAIXA MOVIMENTOS` via enrich; filtro por nome encontra a linha; tooltip mostra descrição completa.

### Cenário 2 — Descrição sem o nome (paciente só via `fin_lancamentos.paciente_id`)
- Reusa paciente fictício `SIM_TESTE2`.
- Insere `fin_lancamentos` com `paciente_id` preenchido, mas com `descricao='[Caixa] recebimento avulso'` (sem nome no texto).
- Insere `caixa_movimentos` com descrição também sem o nome: `'consulta particular sem identificação'`.
- **Esperado (era o bug):** coluna Paciente ainda exibe `SIM_TESTE2` porque o enrich puxa o nome via `paciente_id`. Filtro por `SIM_TESTE2` acha a linha mesmo sem o nome estar na descrição.

### Cenário 3 — Mensalidade (paciente via `agendamento.paciente_id` fallback)
- Insere paciente fictício `SIM_TESTE3`.
- Insere `agendamentos` fictício com `paciente_id` preenchido.
- Insere `fin_lancamentos` com **`paciente_id = NULL`**, `agendamento_id` apontando para o agendamento acima, `descricao='MENSALIDADE 99/99 - CONTRATO #SIM999 - SIM_TESTE3'`.
- Insere `caixa_movimentos` referenciando esse lançamento.
- **Esperado:** paciente resolvido pelo fallback `agendamento.paciente_id`; nome aparece na coluna Paciente; filtro encontra.

## Validação

Para cada cenário, executo **duas checagens SQL** que replicam a lógica do frontend:

1. **Enrich SQL** — mesmo SELECT que o `enrichMovsList` faz, confirma que o backend está devolvendo o `paciente_nome` correto para o `lancamento_id` do movimento fictício.
2. **Filtro SQL** — confirma que buscar por parte do nome (`SIM_TESTE1`, `SIM_TESTE2`, `SIM_TESTE3`) retornaria a linha através do novo caminho (enrich OU descrição), e não apenas por `descricao ILIKE`.

Não vou renderizar a UI — a lógica testada é a mesma que o React executa (mesmo SELECT em `fin_lancamentos`, `agendamentos`, `pacientes`), então validar SQL é equivalente e não deixa resíduo na sessão de nenhuma atendente real.

## Limpeza (obrigatória e no mesmo teste)

Ao final, na ordem inversa das dependências:

```
DELETE FROM caixa_movimentos WHERE descricao ILIKE 'SIM\_%' OR descricao ILIKE '%SIM_TESTE%' OR sessao_id = <sessao_sim>;
DELETE FROM fin_lancamentos  WHERE descricao ILIKE 'SIM\_%' OR descricao ILIKE '%SIM_TESTE%' OR descricao ILIKE 'MENSALIDADE 99/99%';
DELETE FROM agendamentos     WHERE observacoes ILIKE 'SIM_%';
DELETE FROM caixa_sessoes    WHERE observacoes = 'SIM_SESSAO_TESTE';
DELETE FROM pacientes        WHERE nome LIKE 'SIM\_TESTE%';
```

Depois, uma checagem final:

```
SELECT COUNT(*) FROM pacientes         WHERE nome LIKE 'SIM\_%';
SELECT COUNT(*) FROM caixa_movimentos  WHERE descricao ILIKE '%SIM_TESTE%';
SELECT COUNT(*) FROM fin_lancamentos   WHERE descricao ILIKE '%SIM_TESTE%';
SELECT COUNT(*) FROM agendamentos      WHERE observacoes ILIKE 'SIM_%';
```

Todos devem retornar `0`. Se sobrar qualquer resíduo, aviso antes de encerrar.

## Restrições respeitadas

- Todo registro criado tem prefixo `SIM_` e é apagado no mesmo teste.
- Nenhuma sessão real de atendente é usada; a `caixa_sessoes` é criada fictícia e apagada.
- Zero interação com registros reais de pacientes, agenda, contratos, mensalidades ou outros caixas.
- Sem UI, sem chamadas a RPCs de pagamento real, sem NFS-e, sem impressão.

## Entregável

Ao final, mando um relatório curto por cenário: **antes / depois / status (passou ou falhou)**, e a confirmação do `COUNT(*) = 0` da limpeza.
