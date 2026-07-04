## Objetivo

Nas Regras de Preço dos Convênios (Cartão Benefícios), adicionar:

1. Novo Período: **"Por contrato"** — a regra vale N vezes durante toda a vigência do contrato (sem janela diária/semanal/mensal).
2. Novo Escopo: **"Titular ou dependente (exclusivo)"** — apenas uma pessoa do contrato pode consumir a regra. Se o titular usou, nenhum dependente poderá usar (e vice-versa).

## O que muda

### 1. UI — `src/components/cartao-beneficios/regras-tab.tsx`
- No `<Select>` de **Período** acrescentar `<SelectItem value="contrato">Por contrato</SelectItem>` abaixo de "Por mês".
- No `<Select>` de **Escopo** acrescentar `<SelectItem value="titular_ou_dependente">Titular ou dependente (exclusivo)</SelectItem>` abaixo de "Por paciente".
- Ajustar o texto-resumo mostrado na tabela (linha 420) para exibir corretamente `contrato` como período (ex.: "1/contrato titular-ou-dep") e o novo escopo.
- Não é necessária migração: `limite_periodo` e `limite_escopo` já são `text nullable`.

### 2. Enforcement na agenda — `src/routes/_authenticated/app.agenda.tsx` (bloco de checagem de limite, ~linhas 424-527)

Hoje o código sempre filtra por `inicioDia..fimDia` e usa apenas escopos `paciente`/`contrato`. Ajustes:

- **Janela do período**:
  - `dia` (padrão atual): início/fim do dia da data de referência.
  - `semana`: segunda 00:00 a domingo 23:59 da semana da data.
  - `mes`: primeiro/último dia do mês.
  - `contrato`: sem filtro de data (conta todo o histórico não-cancelado do contrato).

  Hoje `limite_periodo` já era gravado mas ignorado no cálculo — passa a ser respeitado de fato para todos os valores.

- **Escopo dos pacientes da cota**:
  - `paciente`: só o próprio paciente (inalterado).
  - `contrato`: titular + dependentes ativos (inalterado).
  - `titular_ou_dependente`: mesma lista de titular + dependentes ativos, mas com uma regra extra — se já existir uso na janela por **outro** paciente do contrato (diferente do que está sendo agendado agora), a cota é considerada esgotada para este paciente (excedente entra em ação: bloquear/particular/valor fixo/percentual, conforme configurado).

- Textos de aviso (`avisoLimite`) atualizados para refletir o período correto ("por dia/semana/mês/contrato") e o novo escopo ("titular-ou-dependente").

### 3. Mensagens auxiliares
- Ajuste do rótulo `"1 consulta por dia por contrato"` no cabeçalho do popover para incluir exemplo do novo período: `Ex.: "1 consulta por contrato" ou "1 consulta por dia por contrato"`.

## Fora do escopo

- Sem alterações de schema/migração.
- Sem mudanças em `cb_beneficios` (aba Benefícios) — só afeta a aba **Regras** dos convênios, conforme prints.
- `src/lib/cb-regras.ts` comentários dos tipos aceitos podem ser ampliados, mas o tipo continua `string | null`.