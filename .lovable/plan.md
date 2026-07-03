## Objetivo

Permitir que cada convênio do Cartão Benefícios tenha **regras de limite** (ex.: "só 1 consulta de R$ 9,99 por dia, por contrato") com **fallback automático** quando o limite for atingido (ex.: "cobrar 50% do valor particular"). O caso concreto é o convênio "CARTÃO CONSULTA + SEGUROS", mas a estrutura precisa servir para qualquer convênio futuro.

## Como o usuário vai usar

Na tela **Cartão Benefícios → Convênios → (editar) → aba Regras**, ao editar/criar uma regra de preço já existente (ex.: "consulta R$ 9,99 por especialidade"), aparecem novos campos opcionais:

- **Limite de uso**
  - Quantidade por período: `1`
  - Período: `dia` (futuro: semana / mês)
  - Escopo do limite: `Contrato inteiro` (titular + todos os dependentes) | `Por paciente`
- **Quando exceder o limite, cobrar:**
  - `% do valor particular` → campo percentual (ex.: `50`)
  - `Valor fixo`
  - `Valor particular cheio` (100%)
  - `Bloquear agendamento` (não permite marcar)

Campos em branco = sem limite (comportamento atual).

## Onde a regra é aplicada

1. **Agenda** (`src/routes/_authenticated/app.agenda.tsx`, função `obterInfoConvenioPaciente` e cálculo do valor sugerido ao escolher paciente/procedimento): antes de aplicar o desconto da regra, conta quantos agendamentos do mesmo contrato (titular + dependentes) já existem no dia em que a mesma regra se aplicaria. Se `count >= limite`, aplica o fallback em vez do preço da regra e mostra um aviso no formulário ("Limite de 1 consulta R$ 9,99/dia atingido neste contrato — cobrado 50% do particular: R$ X,XX").
2. **Caixa** (`app.caixa.tsx`) e **Procedimentos** (`app.procedimentos.tsx`), que já usam `findRegra`/`computeValor`: passam a chamar uma função nova `resolvePrecoConvenio(...)` que encapsula a checagem de limite + fallback.

A checagem consulta `agendamentos` do dia por `contrato_id` (via titular/dependentes → paciente_id) filtrando por especialidade/tipo da regra e status ≠ cancelado.

## Dados existentes hoje

- `cb_convenios` — 2 convênios: `CARTÃO CONSULTA` e `CARTÃO CONSULTA + SEGUROS`.
- `cb_convenio_regras` — já tem R$ 9,99 cadastrado para várias especialidades do "CARTÃO CONSULTA + SEGUROS".
- Faltam apenas os campos de **limite** e **fallback**.

## Detalhes técnicos

### Migração

Adicionar em `cb_convenio_regras`:

```
limite_qtd            integer            -- null = sem limite
limite_periodo        text               -- 'dia' (default), 'semana', 'mes'
limite_escopo         text               -- 'contrato' | 'paciente'
excedente_modo        text               -- 'percentual_particular' | 'valor_fixo' | 'particular' | 'bloquear'
excedente_percentual  numeric
excedente_valor       numeric
```

CHECK para consistência (`excedente_modo` obrigatório quando `limite_qtd` não é nulo).

### Helper novo — `src/lib/cb-regras.ts`

```
resolvePrecoConvenio({
  supabase, clinicaId, contratoId, pacienteId,
  especialidadeId, tipo, dataRef,
  regra, valorParticular
}) → { valor, motivo, limiteAtingido, aviso? }
```

- Se `regra.limite_qtd` for null → retorna `computeValor(regra, ...)` como hoje.
- Senão, faz `SELECT count(*) FROM agendamentos` do dia (`dataRef`), do `contrato_id` (via `contratos_assinatura.paciente_id` + `contrato_dependentes.paciente_id`), status ativo, com serviço da mesma especialidade/tipo. Se atingiu, aplica o fallback (`percentual_particular` → `valorParticular * pct/100`; `valor_fixo`; `particular`; `bloquear` → retorna sinalizador para a UI impedir salvar).

### UI

- `src/components/cartao-beneficios/regras-tab.tsx`: adicionar seção "Limite de uso" e "Quando exceder" no modal de edição da regra.
- `app.agenda.tsx`: `obterInfoConvenioPaciente` retorna também `avisoLimite?: string` e `bloquear?: boolean`. O card do convênio no formulário exibe o aviso; se `bloquear`, desabilita salvar.

### Seed do caso atual

Depois da migração, atualizar as 13 regras de R$ 9,99 do convênio "CARTÃO CONSULTA + SEGUROS" com:
`limite_qtd = 1`, `limite_periodo = 'dia'`, `limite_escopo = 'contrato'`,
`excedente_modo = 'percentual_particular'`, `excedente_percentual = 50`.

## Fora do escopo (por enquanto)

- Limites por semana/mês (campo já preparado, mas UI só oferece "dia").
- Contagem cruzando agendamentos de outras clínicas.
- Regras acumulativas entre convênios diferentes (cada contrato conta isolado).

## Pergunta antes de implementar

1. **Escopo do limite**: confirmar que a regra vale para **o contrato inteiro** (titular + dependentes somam juntos). Você descreveu assim no exemplo — só quero confirmar antes de mexer.
2. **Cancelados contam?** Se um agendamento de R$ 9,99 foi marcado e depois cancelado, ele libera a "cota" do dia? (Minha proposta: cancelado NÃO conta.)
3. **Realizado x agendado**: o limite deve considerar qualquer agendamento do dia (mesmo só "agendado" sem pagamento) ou só os que já foram pagos/realizados? (Minha proposta: qualquer agendamento não-cancelado, para evitar burlar marcando dois e cancelando um depois do atendimento.)
