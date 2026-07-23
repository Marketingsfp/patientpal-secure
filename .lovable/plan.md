## Diagnóstico (confirmado)

A regra no banco está correta:
- Convênio **CARTÃO CONSULTA + SEGUROS** • **OFTALMOLOGIA** • consulta • valor_fixo
- `valor` = **R$ 80,00** (dinheiro) • `valor_cartao` = **R$ 95,00** (cartão/PIX)

O erro está **só no frontend da Agenda** (`src/routes/_authenticated/app.agenda.tsx`), na função `obterInfoConvenioPaciente`:

1. A query `cb_convenio_regras.select(...)` **não pede** as colunas `valor_cartao` nem `percentual_cartao` — então elas nunca chegam do banco.
2. Ao montar o objeto `desconto`, o código faz:
   ```ts
   const v = Number(regraMatch.valor) || 0;
   desconto = { tipo: "valor_fixo", valor: v, valorOutros: v };   // ← usa o mesmo valor nos dois
   ```
   Resultado: o diálogo "Forma de pagamento" mostra **R$ 80 dinheiro / R$ 80 outros**, mesmo com R$ 95 cadastrado para cartão.

O helper `computeValor` em `src/lib/cb-regras.ts` já sabe tratar `valor_cartao`/`percentual_cartao` — a tela da Agenda simplesmente não passa por ele nesse caminho.

## Escopo

- **Frontend only**, um único arquivo: `src/routes/_authenticated/app.agenda.tsx`.
- **Sem** alteração de banco, RLS, RPC ou schema.
- **Sem** mexer em outras telas (Orçamento, Odonto, Financeiro já usam `computeValor` corretamente ou já respeitam o campo — se você quiser, posso auditar depois em plano separado).
- **Global (as 3 clínicas)** — é correção técnica de bug de leitura, sem regra de negócio nova.

## O que muda

### 1. Query — adicionar as colunas que faltam
```ts
.select("id,convenio_id,especialidade_id,procedimento_id,tipo,modo,valor,valor_cartao,percentual,percentual_cartao,prioridade,ativo,carencia_mensalidades,gratuito,limite_qtd,limite_periodo,limite_escopo,excedente_modo,excedente_percentual,excedente_valor,grupo_gratuidade")
```

### 2. Tipo `DescontoConvenio` — permitir percentual diferente no cartão
Adicionar `percentualOutros?: number` na variante `percentual`, mantendo compatibilidade (fallback = mesmo valor de `valor`).

### 3. Montagem do `desconto` a partir da regra
- **valor_fixo** (regra principal e fallback `regra_padrao_convenio`):
  ```ts
  const v  = Number(regraMatch.valor) || 0;
  const vC = regraMatch.valor_cartao != null ? Number(regraMatch.valor_cartao) : v;
  desconto = { tipo: "valor_fixo", valor: v, valorOutros: vC };
  ```
- **percentual_desconto**:
  ```ts
  const p  = Number(regraMatch.percentual) || 0;
  const pC = regraMatch.percentual_cartao != null ? Number(regraMatch.percentual_cartao) : p;
  desconto = { tipo: "percentual", valor: p, percentualOutros: pC };
  ```

### 4. `aplicarDescontoPorForma` — usar o percentual do cartão quando aplicável
```ts
if (d.tipo === "percentual") {
  const ehDinheiro = forma === "dinheiro";
  const pct = ehDinheiro ? d.valor : (d.percentualOutros ?? d.valor);
  return Math.max(0, valor * (1 - Number(pct) / 100));
}
```

**Não altera** nada quando a regra é gratuidade, quando o excedente cai em "particular/bloquear/valor_fixo", nem o acréscimo de cartão configurado por convênio.

## Antes / Depois

- **Antes:** consulta OFTALMO desta paciente sai R$ 80 no cartão de crédito (deveria ser R$ 95). Perda de R$ 15 por atendimento nesse convênio + risco em toda regra com `valor_cartao`/`percentual_cartao` diferente.
- **Depois:** o diálogo mostra `R$ 80,00 dinheiro / R$ 95,00 outros`, e ao escolher Pix/Débito/Crédito o lançamento vai com R$ 95,00.

## Validação (produção, com cautela)

1. Reabrir o mesmo agendamento da MARIA HELENA (contrato 20261923) → clicar em pagar → conferir que o card mostra "R$ 80,00 dinheiro / R$ 95,00 outros" e que Cartão de Crédito exibe R$ 95,00. **Não confirmar o pagamento** nesse teste — só checar o valor apresentado.
2. Agendamento particular (sem convênio) continua igual: sem regra, sem diferença dinheiro/cartão.
3. Um convênio com regra percentual (ex.: 10% dinheiro / 5% cartão, se houver) — conferir cálculo. Se não houver regra assim ainda cadastrada, esse ramo continua funcionando pelo fallback `percentualOutros ?? valor` (comportamento igual ao de hoje).

## Risco

Baixo. Mudança isolada a uma função de leitura + um helper puro. Nenhum caminho de escrita foi tocado. Se algum campo `valor_cartao`/`percentual_cartao` estiver nulo (regra antiga), o comportamento é idêntico ao atual — o fallback preserva o valor de dinheiro.

## Pendências / decisões

- O ramo `excedente_modo === "valor_fixo"` (linha 907) usa o mesmo valor para dinheiro e cartão porque hoje o cadastro só tem um campo (`excedente_valor`). **Fora do escopo desta correção** — se quiser diferenciar excedente por forma de pagamento, precisa de nova coluna no banco; abro plano separado se for útil.
