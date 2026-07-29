## O que está acontecendo (verificado, não é suposição)

A tela do Caixa (`src/routes/_authenticated/app.caixa.tsx`) ficou lenta por causa de uma alteração de **24/07 às 18:28** (commit `d8b5fd3b3`) — exatamente a virada para o sábado, que é quando o time começou a sentir.

Essa alteração trouxe duas mudanças que, juntas, explodem o tempo de abertura:

1. **Passou a carregar as 20 últimas sessões de caixa do usuário** (antes só a sessão aberta) e todos os movimentos delas.
   - Conferido no banco: as 20 sessões mais recentes somam **890 movimentos / 811 lançamentos**.
2. **Passou a calcular o número da ficha "na mão"** quando o agendamento não tem `ficha_numero` gravado.
   - Para cada combinação de **dia + médico + agenda** encontrada, ele dispara **uma consulta separada** que lê **o dia inteiro de agendamentos** (até 10.000 linhas), **uma atrás da outra** (sem paralelismo).
   - Conferido no banco: **37.131 dos 37.725** agendamentos dos últimos 30 dias **não têm ficha gravada** (98%). Ou seja, quase todo movimento cai nesse caminho lento.

Resultado: abrir o Caixa dispara dezenas de consultas pesadas em sequência sobre `agendamentos`. Isso bate com o relatório de consultas lentas do banco, onde a leitura de `agendamentos` por clínica+data aparece no topo (média de 0,5 s e picos de 7 s por chamada).

Classificação do pedido: **performance / erro técnico** (não é regra de negócio). Nenhum valor financeiro é alterado.

## O que vou fazer

**1. Carregar o histórico sob demanda (ganho imediato)**
- Na abertura, buscar apenas a **sessão aberta atual** (saldo e totais, como era antes).
- As sessões anteriores continuam disponíveis, mas os movimentos delas só são buscados quando o usuário abre a aba "Movimentos" / seleciona a sessão. Nada de funcionalidade é removida.

**2. Acabar com o laço de fichas por dia**
- Trocar as N consultas sequenciais por **uma única consulta agregada** por dia (uma chamada cobrindo todos os médicos/agendas daquele dia), com a numeração calculada no navegador — mesmo resultado, mesma ordem (hora, depois nome).
- Limitar o cálculo aos movimentos realmente exibidos na tela.
- Ficha continua aparecendo igual; nada muda no que o usuário vê.

**3. Paralelizar o enriquecimento**
- As buscas de médico, paciente e agendamento hoje rodam uma depois da outra. Passam a rodar em paralelo (`Promise.all`), como era antes da alteração.

**4. Índice de apoio no banco**
- Conferir e, se faltar, criar índice em `agendamentos (clinica_id, inicio)` — é o filtro campeão de tempo total no banco hoje. Índice é aditivo, não altera dados.

## Fora do escopo

- Não mexo em valores, lançamentos, formas de pagamento, GR, repasse ou qualquer regra financeira.
- Não mexo em Cartão Consulta/Benefícios (regra 1.10/1.11).
- Não removo o histórico de sessões nem a coluna de ficha — só mudo **quando** e **como** os dados são buscados.

## Validação que vou apresentar

- Antes/depois: número de consultas disparadas ao abrir o Caixa e tempo até a tela ficar utilizável (medido no navegador).
- Conferência de que saldo, totais, ficha, paciente, médico e serviço aparecem idênticos aos de hoje em uma sessão real aberta.

## Detalhes técnicos

- Arquivo principal: `src/routes/_authenticated/app.caixa.tsx` (`load()`, `enrichMovsList()`, bloco `gruposFicha`).
- O laço problemático está entre as linhas ~936-966: `for (const grupo of gruposFicha.values())` com `await` dentro e `.range(0, 9999)`.
- `histRes` (`caixa_sessoes ... .limit(20)`) deixa de alimentar `enrichMovsList` na carga inicial.
- Migração apenas de índice (`CREATE INDEX IF NOT EXISTS`), sem alteração de schema nem de linhas.
