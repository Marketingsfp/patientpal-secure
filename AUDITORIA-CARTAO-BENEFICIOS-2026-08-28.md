# Auditoria do módulo Cartão Benefícios — 28/08/2026

**Somente leitura. Nada foi alterado no banco nem no sistema.**

Conferido: as 7 abas do módulo (Vendas, Convênios, Dependentes, Conferência,
Sem convênio, Relatórios, Importar planilha), as regras de preço e bloqueio
que o balcão usa, e os dados de produção.

Base: 1.987 contratos (1.882 ativos, 82 cancelados, 23 renovados) e 19.163
parcelas.

---

## Resumo em uma linha

O sistema está **funcionando corretamente** — as regras estão bem escritas e
não encontrei defeito na lógica de cobrança. O problema está nos **dados**:
três importações antigas deixaram cerca de **880 pessoas** com o cartão numa
situação em que o balcão cobra o valor errado, e ninguém percebe porque as
telas não avisam.

---

## PARTE 1 — O que está cobrando errado no balcão AGORA

### 1.1 — 207 pessoas do rateio MJ estão bloqueadas como inadimplentes

**O que aconteceu.** Em 11/06/2026 entrou a "planilha de rateios MJ". Ela criou
**213 contratos** em que cada pessoa virou titular do seu próprio cartão, com o
valor da mensalidade sendo **a fatia dela** — R$ 15,00, R$ 10,00, R$ 7,50,
R$ 5,00 — e não o valor do plano. Todos os contratos trazem a observação
"IMPORTADO DA PLANILHA DE RATEIOS MJ — CONFIRMAR IDENTIDADE DO PACIENTE".

**O estado hoje.** Os 213 têm as 12 parcelas geradas e **nenhum deles pagou uma
única parcela**. A parcela mais recente venceu em julho/2026, ou seja, estão
todos com mais de 40 dias de atraso.

**A consequência.** A regra do sistema é: passou de 5 dias de atraso, o cartão
não vale e o paciente é cobrado como Particular. Então essas pessoas chegam na
recepção, mostram o cartão, e **pagam o valor cheio**. Verifiquei se elas teriam
saída por outro cartão: só 6 das 213 são dependentes de um contrato mais novo e
válido. **207 pessoas estão sem benefício.**

Soma das mensalidades desses contratos: R$ 2.424,25/mês — o que também mostra
que o valor não é o do plano (207 cartões a R$ 110,00 seriam R$ 22.770,00).

> Isso não é defeito de programação: o sistema está aplicando a regra certa
> sobre um dado errado. A decisão é sua e da recepção — esses 213 são cartões de
> verdade que devem ser corrigidos para o valor do plano, ou são registros que
> deveriam ser cancelados?

### 1.2 — 505 pessoas com cartão ativo mas sem convênio vinculado

São **245 titulares** + **260 dependentes**. O contrato está ativo, mas sem
convênio o sistema não encontra nenhuma tabela de preço, e o paciente é cobrado
como Particular. Todos os 245 titulares foram conferidos: nenhum tem outro
contrato válido para cair.

Esses 245 são exatamente os que a aba **"Sem convênio"** existe para resolver —
ela foi feita para isso e continua com a fila cheia. São contratos de junho/2026,
todos com mensalidade R$ 0,00 e sem nenhuma parcela gerada.

### 1.3 — 164 cartões importados em 18/08 sem nenhuma cobrança gerada

Na importação de planilha de **18/08/2026** foram criados 187 contratos, e
**175 ficaram sem nenhuma mensalidade**. Destes, 164 continuam ativos (números
20262447 a 20262627, convênio CARTÃO CONSULTA + SEGUROS, média R$ 120,00).

Isso é **proposital no código**: a tela de importação não gera cobrança, porque
a ideia era lançar as mensalidades depois, com os valores reais. O que ficou
pendente foi o "depois" — passaram-se 10 dias e as parcelas não foram criadas.

**A consequência é o contrário do item 1.1:** como não existe parcela nenhuma,
não existe parcela vencida, então o sistema entende que está tudo em dia e
**libera o desconto do cartão integralmente**. Essas 164 pessoas usam o cartão
sem estar sendo cobradas, e não aparecem em nenhuma lista de inadimplentes.

Também não encontrei no sistema nenhuma tela ou botão para gerar as parcelas de
um contrato depois — hoje isso só sai por SQL.

---

## PARTE 2 — Números errados nas telas

### 2.1 — Os indicadores do topo da tela de Vendas mostram menos de um terço do real

Na visão em cards, o quadro "Contratos ativos" mostra hoje:

| Indicador | Mostra | Real |
|---|---|---|
| Contratos ativos | **483** | **1.882** |
| Receita prevista | **R$ 34.485,00** | **R$ 202.730,70** |

**Por quê.** A tela só baixa os 500 contratos mais recentes (limite de
performance, proposital). Mas quatro dos seis indicadores — Contratos ativos,
Receita prevista, Novos contratos e Cancelados — são contados em cima desses
500, enquanto os outros dois (Pagos no mês, A vencer, Inadimplentes) são
consultados no banco inteiro. Ou seja, **a mesma faixa de indicadores mistura
duas bases diferentes**, e quem lê acha que são todos o total.

É corrigível no código: basta esses quatro também perguntarem o total ao banco.
Não mexe em regra nenhuma, só no número exibido.

### 2.2 — Contratos "renovado" não entram em indicador nenhum

23 contratos estão com status `renovado`. O indicador "Contratos ativos" conta
só `ativo` e o "Cancelados / inativos" conta só `cancelado`, `inativo` e
`encerrado`. Os 23 somem da conta. No card individual eles aparecem em cinza,
como se estivessem cancelados.

### 2.3 — R$ 21.390,00 marcados como recebidos em datas do futuro

**14 contratos** têm cerca de **105 parcelas marcadas como PAGAS com data de
pagamento no futuro** — de setembro/2026 até **junho/2027**. Nenhuma tem
lançamento financeiro (foram todas marcadas como "paga histórica").

| Contrato | Paciente | Parcelas no futuro | Valor |
|---|---|---|---|
| 20261216 | PATRICIA FERREIRA ZEFERINO | 10 | R$ 2.950,00 |
| 20260857 | LUANA MOURA DA SILVA LOPES | 10 | R$ 2.550,00 |
| 20261080 | MARILDA PEREIRA LIMA | 10 | R$ 2.300,00 |
| 20260041 | ALEXANDRE DA SILVA CAMARGO | 10 | R$ 2.050,00 |
| 20260302 | CLAUDIA MAIA BORGES | 10 | R$ 2.050,00 |
| 20260940 | MARCIA DOS SANTOS | 10 | R$ 1.800,00 |
| 20261207 | ORLANDO PEREIRA GONCALVES | 10 | R$ 1.550,00 |
| 20261475 | TANIA TAVARES DA SILVA LI | 10 | R$ 1.550,00 |
| 20260893 | LUCILEA DOS SANTOS DE OLIVEIRA GOMES | 10 | R$ 1.550,00 |
| 20261560 | VIRGILANE DA SILVA COSTA | 10 | R$ 1.100,00 |
| 20262650 | MARIA DE FATIMA DINIZ CHA | 5 | R$ 875,00 |
| 20260318 | CLAUTIDES RODRIGUES MOREI | 7 | R$ 770,00 |
| 20260794 | KATIA CRISTINA SOARES DA SILVA | 1 | R$ 120,00 |
| 20261305 | ROBERTA DE SOUZA VIEIRA D | 1 | R$ 175,00 |

O padrão é sempre o mesmo: a data do "pagamento" é igual à data de vencimento da
parcela. Parece que alguém quitou o contrato inteiro de uma vez e o sistema
carimbou cada parcela com o vencimento dela em vez da data real do recebimento.

**Pode ser legítimo** (paciente que pagou o ano à vista) — mas do jeito que está,
esses R$ 21.390,00 entram no "Recebido" de meses que ainda não aconteceram, e
esses contratos nunca mais vão aparecer para cobrança. Precisa da recepção para
dizer se essas pessoas pagaram adiantado.

O contrato 20261305 (ROBERTA) tem uma parcela com data de pagamento em
**11/07/2202** — erro de digitação, dois séculos à frente.

### 2.4 — Duas parcelas com o status escrito errado

O contrato 20260642 (ISABEL LIMA LEITE, já cancelado) tem 2 parcelas com status
`cancelada` — no feminino. O sistema inteiro compara com `cancelado`, no
masculino. Resultado: essas duas parcelas de R$ 155,00 (R$ 310,00) contam como
**em aberto** em todas as telas, num contrato que já foi cancelado.

Existem ainda 30 parcelas com status `aberto` (3 contratos: 20260825, 20260876,
20261547), sobra de uma versão antiga. Essas **não causam problema** — o código
trata `aberto` como pendente em todos os lugares. Só estão fora do padrão.

---

## PARTE 3 — Cadastro e higiene

### 3.1 — Um convênio com nome de paciente aparece na lista de venda

Existe um convênio **ATIVO** chamado **"karina cristina santana freires"**, com
0 regras de preço cadastradas. Alguém digitou o nome da paciente no campo do
nome do convênio. Ele aparece na lista quando se vende um cartão novo, e se for
escolhido por engano o paciente fica com um cartão que não dá desconto nenhum.

### 3.2 — 79 contratos ativos já passaram da data de término

48 deles venceram há mais de 90 dias (o mais antigo em 31/12/2025). O sistema
**não olha a data de término** ao decidir se o cartão vale — ele olha só o
status. Então esses 79 continuam dando desconto normalmente depois de vencidos.

Isso pode ser proposital (a renovação é manual, pelo botão RENOVAÇÃO), mas vale
decidir: ou a recepção renova/encerra esses 79, ou o sistema passa a avisar.

### 3.3 — Conferência de vidas: 663 contratos fora do esperado

Dos 1.637 contratos ativos com convênio:

| Situação | Contratos |
|---|---|
| Certo (paga pelo mesmo tanto de gente que tem vinculada) | 974 |
| **Paga por mais gente do que tem vinculada** | 352 (**593 vagas órfãs**) |
| **Tem mais gente do que a faixa paga cobre** (cobrança a menor) | 33 |
| Valor não bate com nenhuma faixa do convênio | 278 |

Os 33 do meio são dinheiro que a clínica deixa de receber todo mês. Os 278 "sem
faixa" são, na maioria, os contratos de rateio do item 1.1.

Isso é justamente o que a aba **Conferência** mostra — a fila está grande.

### 3.4 — Dependentes fora do lugar

- **9 pessoas** são dependentes ativas em **dois contratos ativos ao mesmo
  tempo**. O sistema tem regra de desempate (vale o cartão mais novo), então não
  quebra nada, mas é cadastro duplicado.
- **50 dependentes ativos** estão pendurados em contrato cancelado (21) ou
  renovado (29). Destes, só **5 realmente ficaram sem cartão** — os outros 45 já
  estão também no contrato novo. Os 5 merecem conferência.

### 3.5 — Os 6 casos de cobrança dupla continuam abertos

O levantamento de 27/08 (arquivo `CARTAO-6-CASOS-COBRANCA-DUPLA-2026-08-27.md`)
segue válido: 6 pessoas com dois contratos ativos gerando parcela ao mesmo
tempo, cerca de R$ 10.625,00 inflando o "A Receber".

---

## PARTE 4 — O que está certo (conferido, sem problema)

Vale registrar o que passou no teste, para não virar suspeita depois:

- **Escolha de qual cartão vale**, quando a pessoa tem mais de um: a regra de
  desempate está bem feita (cartão com convênio ganha do sem convênio; depois o
  mais novo). Foi conferida e cobre inclusive o caso do contrato sem convênio.
- **Tolerância de 5 dias** de atraso: implementada corretamente, e considera os
  três nomes de status pendentes que existem no banco.
- **Taxa de adesão**: 32 linhas conferidas uma a uma. As 28 pagas estão
  coerentes com a 1ª parcela, e as 4 pendentes estão com a 1ª parcela também
  pendente (é o caso em que a adesão é cobrada junto). **Nenhum resíduo de
  cobrança dupla de adesão.**
- **Carência** conta só mensalidades de verdade (a linha da taxa de adesão fica
  de fora), como deve ser.
- **Importação de planilha** usa as mesmas funções de banco da tela de vendas —
  respeita limite de dependentes do plano e as permissões do usuário. Não fura
  regra.
- Todas as parcelas pagas têm data de pagamento preenchida (nenhuma órfã).

---

## Sugestão de ordem de ataque

Da maior dor para a menor:

1. **Decidir o que fazer com os 213 contratos do rateio MJ** (item 1.1) — são
   207 pessoas pagando particular hoje.
2. **Rodar a aba "Sem convênio"** para os 245 contratos (item 1.2) — a tela já
   existe e resolve sozinha.
3. **Gerar as mensalidades dos 164 contratos de 18/08** (item 1.3) — hoje
   precisa de SQL; se for virar rotina, vale uma tela.
4. **Corrigir os indicadores da tela de Vendas** (itens 2.1 e 2.2) — é só
   código, não mexe em dado.
5. **Conferir com a recepção as 105 parcelas pagas no futuro** (item 2.3).
6. Ajustes de cadastro: convênio com nome de paciente (3.1), 2 parcelas com
   status feminino (2.4), 5 dependentes órfãos (3.4).
7. Fila da Conferência (3.3) e os 6 casos de cobrança dupla (3.5).

Os itens 1.1, 1.3, 2.3 e 2.4 mexem em dinheiro e precisam da sua decisão antes
de qualquer gravação. Os itens 4 e 6 eu consigo entregar sem risco.
