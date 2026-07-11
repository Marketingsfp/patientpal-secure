## Contexto

Você confirmou:
- Todas as regras corretas **já estão em Convênios → Regras de Preço** (tabela `cb_convenio_regras`).
- A aba **"Benefícios (regras)"** (tabela `cb_beneficios`) foi cadastrada por engano.
- As regras do **cartão terapêutico** que hoje estão em Benefícios (regras) serão relançadas por você **manualmente em Regras de Preço** depois.

Objetivo: tornar **Regras de Preço a única fonte** de descontos aplicados na Agenda, nos pagamentos e nos contratos. Aba "Benefícios (regras)" some do menu.

## Escopo (código)

### 1. Agenda — trocar o motor de desconto

`src/routes/_authenticated/app.agenda.tsx` (linha ~333 em diante) hoje lê `cb_beneficios` como fonte primária e usa `cb_convenio_regras` só como *overlay* de carência/gratuidade.

Vai passar a:
- Ler **apenas** `cb_convenio_regras` (mesma consulta que o Caixa já faz).
- Usar `findRegra` + `computeValor` de `src/lib/cb-regras.ts` para escolher a regra mais específica (procedimento > especialidade+tipo > especialidade > tipo).
- Continuar aplicando **carência** (`carencia_mensalidades`) e **gratuidade** (`gratuito`) exatamente como já faz.
- Continuar aplicando **limite de uso** (`limite_qtd` / `limite_periodo` / `limite_escopo`) e **excedente** (`excedente_modo` / `excedente_percentual` / `excedente_valor`) — esses campos existem em `cb_convenio_regras`, então a lógica atual é preservada, só troca a origem dos dados.

Efeito prático: a Agenda passa a calcular o desconto exatamente do mesmo jeito que o Caixa calcula hoje.

### 2. Aba "Benefícios (regras)" — remover do menu

`src/routes/_authenticated/app.cartao-beneficios.tsx`: retirar o item `{ to: "/app/cartao-beneficios/beneficios", … }` da lista de tabs.

O arquivo da página (`app.cartao-beneficios.beneficios.tsx`) permanece por enquanto (não quebra nada), mas fica órfão do menu. Podemos deletar em um passo seguinte se você quiser.

### 3. Editor embutido de Benefícios dentro do Convênio

`src/routes/_authenticated/app.cartao-beneficios.convenios.tsx` também tem um **editor de benefícios embutido** no formulário do convênio (grava em `cb_beneficios`). Vai ser removido — sobra o cadastro por Regras de Preço.

### 4. Leituras órfãs de `cb_beneficios`

`src/components/pages/contratos-page.tsx` carrega `cb_beneficios` para um `state` que não é usado em tela. Removida a chamada.

`src/routes/api/public/hooks/backup-diario.ts` continua incluindo `cb_beneficios` no backup diário (a tabela permanece existindo por segurança/histórico).

## Escopo (dados)

- **Nenhum lançamento existente é reprocessado** — desconto gravado nos agendamentos, pagamentos, fin_atendimentos e mensalidades **permanece intacto**.
- **`DELETE` em `cb_beneficios`** — apaga os 84 registros da aba errada. A tabela em si fica (para não quebrar tipos/backup), mas vazia. Você reintroduz as regras do cartão terapêutico manualmente em Regras de Preço quando quiser.
- **Regra órfã PREVENTIVO** — já foi migrada no passo anterior, então nada se perde ao apagar `cb_beneficios`.

## O que NÃO muda

- Caixa, orçamentos, contratos, mensalidades, cartões, inadimplência: nenhum código tocado.
- `cb_convenio_regras` e a aba **Regras de Preço**: nenhuma alteração, é a fonte que passa a valer para todo mundo.
- Convênios, faixas, dependentes, relatórios BI: intactos.

## Passos de execução

1. Editar `app.agenda.tsx`: trocar o bloco de leitura/aplicação de `cb_beneficios` por leitura+`findRegra`/`computeValor` de `cb_convenio_regras`, preservando toda a lógica de limite/excedente/carência/gratuidade que já existe.
2. Editar `app.cartao-beneficios.tsx`: remover a tab "Benefícios (regras)".
3. Editar `app.cartao-beneficios.convenios.tsx`: remover o editor de benefícios embutido no formulário do convênio.
4. Editar `contratos-page.tsx`: remover a leitura órfã de `cb_beneficios`.
5. `DELETE FROM cb_beneficios` (via ferramenta de dados) — apaga os 84 registros errados.
6. Teste manual rápido na Agenda: 1 agendamento particular, 1 com convênio ativo, 1 com convênio em carência, 1 com gratuidade — para confirmar que os valores calculados batem com o Caixa.

## Rollback

Se algo der errado depois do passo 1, basta reverter o commit dessa mudança na Agenda — o resto (menu, editor embutido, `DELETE`) não afeta o cálculo em tempo de execução.

Confirma que posso executar nessa ordem?