# Dashboard Financeiro (Mês) — o que está errado — 01/09/2026

Clínica conferida: POLICLINICA MENINO JESUS
Período do print: aba "Mês" = 01/09/2026 a 30/09/2026
Conferência feita direto nos dados de produção.

## Resposta curta

Não, o dashboard não está certo. Três números estão errados:
Receitas/Saldo, Consultas Particulares e Repasse Médicos.

---

## Erro 1 — Receitas e Saldo contam dinheiro que ainda não entrou

O card mostra Receitas R$ 37.090,39 no mês. Mas dentro do mês de setembro
existem 233 lançamentos com data de 02/09 a 29/09 — ou seja, com data no
futuro — somando R$ 9.547,00. São parcelas de contrato importadas do sistema
antigo (observação IMPORT#..., criadas em 01/06/2026), já gravadas como
"confirmado" com a data de cada vencimento futuro.

O que realmente entrou até hoje (01/09):

| | Valor |
|---|---|
| Receita realizada (203 lançamentos com data 01/09) | R$ 27.783,39 |
| Parcelas com data futura (233 lançamentos, 02/09 a 29/09) | R$ 9.547,00 |
| Total que o card soma | R$ 37.330,39* |

*O card mostrou R$ 37.090,39 porque foi tirado alguns minutos antes; a
recepção lançou mais coisa depois. A diferença não é o problema.

Despesas R$ 1.232,00 estão certas.
Saldo correto de setembro até agora: R$ 27.783,39 − R$ 1.232,00 = **R$ 26.551,39**,
e não R$ 35.858,39.

## Erro 2 — "Consultas Particulares 297" conta contrato como consulta

O sistema classifica o atendimento pelo texto da descrição. A regra atual diz
que qualquer descrição com a palavra CONTRATO é consulta particular — isso veio
da planilha antiga, onde a palavra estava mesmo rotulada errado. Só que hoje
essa mesma palavra aparece em duas coisas que não são consulta:

- 226 linhas "NOME — CONTRATO" — são as parcelas do carnê importado (a mesma
  pessoa aparece 10, 9, 8 vezes no mesmo dia, com valores como R$ 24,00);
- 10 linhas "MENSALIDADE 2/12 - CONTRATO #20261466 - NOME" — mensalidade do
  Cartão Consulta, que não é atendimento nenhum.

Consultas de verdade lançadas hoje: **87** particulares + 5 do cartão.
O card mostra 297.

Pelo mesmo motivo, "Atendimentos (total) 410" está inflado. Atendimentos de
verdade hoje (lançamento ligado a um agendamento): **192**, somando
R$ 26.143,39. O resto (R$ 1.640,00) é mensalidade, adesão e venda de cartão —
receita da clínica, mas não é atendimento.

Como o Ticket Médio divide a receita pelo número de atendimentos, ele herda os
dois erros: mostra R$ 90,46 quando o real é R$ 26.143,39 ÷ 192 = **R$ 136,16**.

## Erro 3 — "Repasse Médicos R$ 0,00" está lendo a tabela errada

O card soma a coluna de repasse da tabela `fin_atendimentos`, que hoje quase
não é usada: guarda só atendimento externo lançado à mão. Para esta clínica ela
tem 13 linhas desde agosto e nenhuma em setembro — por isso dá zero.

O repasse de verdade é calculado pela grade cadastrada do médico em cima dos
lançamentos ligados à agenda (os mesmos 192 de hoje).

A prova está na própria tela: as duas despesas que formam os R$ 1.232,00 são
"REPASSE MEDICO — JOSE ROBERTO PINTO BARBOSA (9 ATEND.)" R$ 515,00 e
"REPASSE MEDICO — SAMUEL JOSE SOUZA (13 ATEND.)" R$ 717,00. Ou seja: a tela
mostra R$ 1.232,00 de repasse pago como despesa e R$ 0,00 no card de repasse,
ao mesmo tempo.

## Observação menor

O card de repasse filtra os atendimentos pela data em que a linha foi *digitada*
(`created_at`), enquanto a receita filtra pela data do lançamento (`data`). São
duas réguas diferentes na mesma tela — mesmo que o resto fosse corrigido, esses
dois números nunca fechariam entre si.

## O que precisa ser corrigido

1. Receita/Saldo do período: não somar lançamento com data futura (ou separar
   em "recebido" e "a receber").
2. Contagem de atendimentos: contar atendimento de verdade (lançamento ligado a
   agendamento), em vez de adivinhar pela palavra na descrição; e, na regra de
   classificação, parar de tratar CONTRATO e MENSALIDADE como consulta.
3. Repasse: calcular pela grade do médico, igual à aba Atendimentos e ao Rateio
   da Receita, em vez de ler `fin_atendimentos`.
4. Ticket médio: dividir só a receita de atendimento pelo número de
   atendimentos, tirando mensalidade, adesão e venda de cartão.

---

# Correção aplicada — 01/09/2026

## O que mudou no código

**`src/lib/atendimento-classify.ts`** — a regra que decide se um lançamento é
atendimento e de qual tipo:

- CONTRATO, MENSALIDADE e ADESÃO passam a não ser atendimento nenhum (antes
  CONTRATO virava consulta particular, e era o que trazia o carnê inteiro para
  dentro da contagem);
- lançamento sem o travessão que separa paciente e procedimento também não é
  atendimento — tira "[CAIXA] RECEBIMENTO" e "UBER IR SAO F. DE PAULA", que a
  regra antiga contava como exame;
- atendimento feito pelo convênio do cartão passa a contar. A regra antiga
  jogava fora tudo que tivesse "CARTAO CONSULTA + SEGUROS" na descrição por
  achar que era venda de cartão — só que é assim que a consulta de quem tem
  cartão é descrita. Eram 205 atendimentos jogados fora em agosto;
- a categoria (consulta ou exame) passa a sair do procedimento, e não da
  descrição inteira: o nome do convênio contém a palavra CONSULTA, e lido junto
  fazia todo exame de paciente com cartão virar consulta.

**`src/routes/_authenticated/app.financeiro.index.tsx`** — a tela:

- o período nunca passa de hoje, então parcela de carnê com vencimento futuro
  não entra em Receitas nem no Saldo;
- o ticket médio divide só a receita de atendimento pela quantidade de
  atendimentos (mensalidade, adesão e recebimento avulso ficam fora dos dois
  lados da conta);
- o card de Repasse médicos passou a usar a mesma conta do relatório Rateio da
  Receita — a grade cadastrada de cada médico aplicada aos atendimentos do
  período — no lugar da coluna `valor_medico` de `fin_atendimentos`. O
  detalhamento do card agora mostra data, médico, procedimento, receita e
  repasse;
- as datas do detalhamento saíam um dia atrasadas (`new Date("2026-09-01")` é
  meia-noite em UTC, que no fuso da clínica ainda é 31/08) — passaram a usar o
  formatador que já existia no projeto.

**`src/lib/atendimento-classify.test.ts`** — 10 testes novos, com descrições
reais da base de produção nos dois sentidos: o que deve entrar e o que não deve.

## Conferência contra a produção

Mesma clínica, mesmo período do print (Mês, com o corte em hoje), conta refeita
direto nos dados de produção:

| Card | Antes | Depois |
|---|---|---|
| Receitas | R$ 37.090,39 | R$ 29.598,39 |
| Despesas | R$ 1.232,00 | R$ 1.352,00 |
| Saldo do período | R$ 35.858,39 | R$ 28.246,39 |
| Atendimentos (total) | 410 | 199 |
| Consultas Cartão | 5 | 12 |
| Consultas Particulares | 297 | 77 |
| Exames | 108 | 110 |
| Ticket médio | R$ 90,46 | R$ 139,26 |
| Repasse médicos | R$ 0,00 | calculado sobre 197 atendimentos de 26 médicos |

As diferenças de centavos e de uma ou outra unidade em relação ao print são
lançamentos que a recepção fez ao longo da manhã — a tela é ao vivo.

Validação da regra nova em agosto inteiro (mês fechado, mesma clínica): dos
3.093 lançamentos ligados a um agendamento, 100% foram classificados como
atendimento, e todas as 535 linhas de carnê, mensalidade, adesão e recebimento
avulso ficaram de fora. Os 18 atendimentos sem agendamento que a regra manteve
são usos avulsos do cartão lançados à mão.

## Telas que também melhoram

A regra de classificação é a mesma usada em Financeiro > BI, Financeiro >
Estatísticas e no resumo de atendimentos da ficha do paciente. As três paravam
de contar carnê como consulta e passam a contar o atendimento pelo cartão.
