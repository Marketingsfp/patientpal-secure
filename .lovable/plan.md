## Foto 1 — Agrupar regras por carência

Na aba **Regras de Preço** (`src/components/cartao-beneficios/regras-tab.tsx`), a tabela lista as regras em ordem plana. Vou agrupar visualmente por `carencia_mensalidades`, na seguinte ordem:

1. **Imediato** (0)
2. **Após 1ª mensalidade** (1)
3. **Após 2ª mensalidade** (2)
4. **Após 3ª mensalidade** (3)
5. **Após 6ª mensalidade** (6)
6. **Após 12ª mensalidade** (12)

Cada grupo terá um cabeçalho colorido dentro da tabela (linha `TableRow` de largura total, tipo "Após 6ª mensalidade — 4 regras") e as regras daquele grupo listadas abaixo. Dentro do grupo mantém a ordenação atual por prioridade desc. Regras novas (`new-…`) aparecem sempre no topo do grupo "Imediato" (ou do grupo escolhido, quando o usuário mudar a carência a linha muda de grupo automaticamente).

Nada muda no salvar / no cálculo — só ordenação e cabeçalhos.

## Foto 2 — "Um dos valores informados está fora do intervalo permitido"

Esse erro é o **23514** (CHECK constraint), traduzido em `src/lib/traduzir-erro.ts`. A tabela `cb_convenio_regras` tem esta restrição:

```
CHECK (limite_qtd IS NULL OR (
  limite_qtd > 0
  AND limite_periodo IN ('dia','semana','mes')
  AND limite_escopo  IN ('contrato','paciente')
  AND excedente_modo IN ('percentual_particular','valor_fixo','particular','bloquear')
))
```

Mas o diálogo de limite (LimiteDialog) oferece opções que **não estão** no CHECK:
- `limite_periodo = "contrato"` (não permitido pelo banco)
- `limite_escopo = "titular_ou_dependente"` (não permitido pelo banco)

As regras da foto 2 mostram badge **"1/contrato titular-ou-dep"** — ou seja, foram configuradas com essas opções. Ao salvar, o Postgres rejeita → aparece a mensagem genérica de "fora do intervalo".

Não tem nada a ver com "gratuito" — o campo `gratuito` só marca a regra como cortesia; o problema é o **limite de uso** dessa regra.

### Correção (migração)

Ampliar o CHECK para aceitar os valores que a UI já oferece:

```sql
alter table public.cb_convenio_regras
  drop constraint cb_convenio_regras_limite_ck;

alter table public.cb_convenio_regras
  add constraint cb_convenio_regras_limite_ck
  check (
    limite_qtd is null or (
      limite_qtd > 0
      and limite_periodo in ('dia','semana','mes','contrato')
      and limite_escopo  in ('contrato','paciente','titular_ou_dependente')
      and excedente_modo in ('percentual_particular','valor_fixo','particular','bloquear')
    )
  );
```

Isso libera "por contrato" (limite total no ciclo de vida do contrato) e "titular ou dependente" (mesmo consumo compartilhado), que já são referenciados na UI e no motor de agenda.

### Mensagem mais clara (bônus)

Em `src/lib/traduzir-erro.ts`, quando o 23514 for da constraint `cb_convenio_regras_limite_ck`, retornar uma mensagem específica: *"Configuração de limite inválida. Revise período/escopo/excedente."* Assim, se algum caminho ainda passar valor fora, o usuário sabe onde olhar.

## Arquivos afetados

- `src/components/cartao-beneficios/regras-tab.tsx` — agrupamento por carência.
- `supabase/migrations/<novo>.sql` — ampliar CHECK de `cb_convenio_regras_limite_ck`.
- `src/lib/traduzir-erro.ts` — mensagem específica para essa CHECK (opcional, mas útil).

## Fora do escopo

- Não vou mexer no motor de aplicação de regra / cálculo de valor.
- Não vou mudar nada nas telas de vendas, contratos ou faixas de preço.
