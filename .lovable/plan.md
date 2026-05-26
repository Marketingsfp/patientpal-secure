## Diagnóstico

Os botões **Imprimir A4** e **Imprimir cartão** em `Cartão de Benefícios → Contratos` falham porque as queries em `src/lib/print-contrato.ts` e `src/lib/print-cartao.ts` usam *embeds* do PostgREST:

```ts
.select(`*, plano:planos_assinatura(*), clinica:clinicas(...), paciente:pacientes(...)`)
```

A tabela `contratos_assinatura` possui as colunas `clinica_id`, `paciente_id`, `plano_id`, mas **apenas `plano_id` tem foreign key**. Sem FK, o PostgREST devolve o erro visto no console:

> Could not find a relationship between 'contratos_assinatura' and 'clinicas' in the schema cache

Como a query inteira falha, nada é impresso.

## Correção

Refatorar as duas funções de impressão para buscar contrato + relações em chamadas separadas (sem depender de FK no schema cache). Sem migração — evita risco de FKs falharem por dados órfãos legados.

### `src/lib/print-contrato.ts`
- Trocar a query única por:
  1. `select("*")` em `contratos_assinatura` pelo `id`;
  2. `select(...)` em `planos_assinatura` por `plano_id`;
  3. `select(...)` em `clinicas` por `clinica_id`;
  4. `select(...)` em `pacientes` por `paciente_id` (quando existir).
- Manter a montagem do HTML idêntica — só muda a forma de obter `cl`, `pl`, `pa`.

### `src/lib/print-cartao.ts`
- Mesmo padrão: buscar contrato, depois plano, clínica e paciente titular por id, e os dependentes (já é query separada). Manter o restante do código de renderização inalterado.

## Fora do escopo
- Não vou adicionar FKs via migração (pode falhar por dados antigos órfãos e está além do que o usuário pediu).
- Não vou tocar nada além das duas funções de impressão.
