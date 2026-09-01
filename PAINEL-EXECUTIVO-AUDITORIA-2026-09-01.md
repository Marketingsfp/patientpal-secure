# Painel Executivo — auditoria contra a produção — 01/09/2026

Clínica conferida: POLICLINICA MENINO JESUS.
Tudo abaixo foi medido nos dados reais de produção, não no código.

Telas e arquivos auditados:

- [app.painel-executivo.tsx](src/routes/_authenticated/app.painel-executivo.tsx)
- [blocos.tsx](src/components/painel-executivo/blocos.tsx)
- [use-dashboard-blocos.ts](src/hooks/use-dashboard-blocos.ts)
- [indicadores.ts](src/lib/cartao/indicadores.ts)
- funções do banco `dashboard_blocos_periodo`, `painel_executivo_periodo`,
  `fin_serie_diaria`

## Resumo

| Indicador | Estava | Deveria estar | Onde está o erro |
|---|---|---|---|
| Atendimentos realizados (setembro) | 23 (9 consultas, 13 exames) | 246 (100 consultas, 77 exames, 69 sem tipo) | função do banco |
| Inadimplência real do cartão | 0,0% — R$ 0,00 em 0 parcelas | 53,5% — R$ 243.370,95 em 2.150 parcelas de 1.194 contratos | função do banco + hook |
| Faturamento total do mês | R$ 29.753,39 | **já estava certo** | — |
| Sem tipo cadastrado | 96 atendimentos no balde | 69 (os outros 27 tinham tipo e a função não conhecia) | função do banco + cadastro |

---

## 1. Atendimentos realizados — 23 em vez de 246

### O que a query fazia

`dashboard_blocos_periodo` decide se a marcação foi atendida assim:

```sql
(a.status::text = 'realizado' OR a.executado_em IS NOT NULL) AS realizado
```

### O que os dados mostram

Setembro/2026, marcações de verdade na agenda (fora horário livre):

| Situação | Quantidade |
|---|---|
| Total de marcações no mês | 278 |
| Com status `realizado` | 23 |
| Com `executado_em` preenchido | **0** |
| Com recebimento de receita confirmado no caixa | **244** |
| Ainda com status `agendado`, mas já pagas | 220 |

A recepção recebe o pagamento e chama o próximo paciente; voltar na agenda para
mudar o status é a exceção. E o carimbo de horário de execução (`executado_em`)
está vazio em 100% das marcações do mês — nunca chegou a ser usado.

Não é um problema só de setembro, mas em setembro ficou gritante:

| Mês | Marcações | Com status `realizado` | Já pagas |
|---|---|---|---|
| julho/2026 | 6.279 | 2.338 | 5.223 |
| agosto/2026 | 3.392 | 2.503 | 3.079 |
| setembro/2026 | 278 | 23 | 244 |

### A correção

`realizado` passa a ser: status `realizado`, **ou** horário de execução
registrado, **ou** recebimento de receita confirmado ligado àquele agendamento.
O pagamento é a prova mais forte de que o paciente passou pela clínica — a
tabela `fin_lancamentos` tem índice único de uma receita não cancelada por
agendamento, então não há risco de contar duas vezes.

Resultado da conta refeita:

| | Antes | Depois |
|---|---|---|
| Setembro — total | 23 | 246 |
| Setembro — consultas | 9 | 100 |
| Setembro — exames | 13 | 77 |
| Agosto — total | 2.501 | 3.073 |

A mesma falha estava em `painel_executivo_periodo`, na aba Produção: o
"Compareceram" saía de `status = 'realizado'` e mostrava 23 de 281 agendados
(8,2% de comparecimento). Com a correção vai para 246 de 281 (87,5%), e o
No-show, que é calculado em cima dele, deixa de ficar distorcido.

## 2. Inadimplência real do cartão — 0,0% com 1.881 contratos ativos

### O que a query fazia

O hook lê `contrato_mensalidades` **filtrando pelo mês corrente**:

```ts
.gte("vencimento", mes.ini)   // 2026-09-01
.lte("vencimento", mes.fim)   // 2026-09-30
```

e depois `resumirMensalidades` marca como inadimplente a parcela vencida há
mais de 5 dias. No dia 1º do mês, nenhuma parcela de setembro venceu ainda —
logo, zero. O card mostrava 0,0% num mês em que a clínica tem 2.150 parcelas
efetivamente vencidas e não pagas.

### O que os dados mostram

`contrato_mensalidades` da Menino Jesus, situação real:

| | Parcelas | Valor |
|---|---|---|
| Já venceram até hoje (fora as canceladas) | 3.570 | R$ 454.754,90 |
| Dessas, pagas | 1.226 | R$ 191.593,50 |
| Dessas, vencidas há mais de 5 dias e não pagas | **2.150** | **R$ 243.370,95** |
| Contratos ativos atingidos | 1.194 de 1.881 | — |

Inadimplência real = 243.370,95 / 454.754,90 = **53,5%**.

Vale registrar de onde vem esse número: é a tabela `contrato_mensalidades`, a
mesma que governa o balcão — parcela vencida além da tolerância é o que faz o
paciente ser atendido como Particular. Ou seja, a clínica já opera com essa
régua todo dia; o painel é que não estava mostrando. Se a recepção estiver
recebendo carnê por fora sem dar baixa na parcela, o número sai alto; dá para
checar isso pela tela de contratos, comparando as parcelas em aberto de um
paciente que a recepção sabe que está pagando.

### A correção

Um indicador novo, separado, que olha **toda parcela já vencida, de qualquer
mês**, somado dentro do banco (são milhares de linhas e o número cresce todo
mês — trazer isso para o navegador viraria uma paginação cada vez mais longa a
cada carga da tela).

Os cards do bloco "Gestão do Cartão Benefícios" (pagas / a vencer / em atraso)
continuam sendo do mês corrente de propósito: eles dizem "deste mês" no próprio
texto de ajuda, e são a leitura de fechamento do mês.

## 3. Faturamento total do mês — já estava certo

A conta vem de `fin_serie_diaria`, chamada assim:

```ts
p_ini: `${ano}-01-01`,
p_fim: hojeIso,        // hoje, não o fim do mês
p_status: "confirmado"
```

O corte em hoje já existia. Nenhuma parcela futura de carnê entra: o problema
que existia no dashboard do Financeiro (somar vencimentos de 02/09 a 29/09) não
existe aqui. Conferido: receita confirmada da clínica com data de 01/09 é a
mesma que o card publica, e os R$ 29.753,39 do print são o total daquele
instante — a tela é ao vivo e a recepção seguiu lançando.

Uma observação que fica fora deste ajuste: para os meses **já fechados** do
gráfico de evolução, as parcelas de carnê importadas do sistema anterior entram
como receita porque foram gravadas como "confirmado" na importação. Isso não
afeta o mês corrente e não foi mexido aqui.

## 4. Serviços sem tipo cadastrado

São três causas diferentes caindo no mesmo balde.

**a) Serviço com o tipo em branco — 2.514 dos 4.522 serviços ativos.**
É a causa principal e é saneamento de cadastro. A lista completa dos que
apareceram em atendimento desde 01/07/2026 está em
[PAINEL-EXECUTIVO-SERVICOS-SEM-TIPO-2026-09-01.csv](PAINEL-EXECUTIVO-SERVICOS-SEM-TIPO-2026-09-01.csv)
— 127 nomes, 1.851 atendimentos. Os dez primeiros já resolvem mais da metade:

| Serviço | Atendimentos |
|---|---|
| INFILTRACAO DR PAULO ROBERTO (CADA) | 326 |
| PREVENTIVO | 225 |
| ECOCARDIOGRAMA (ADULTO) | 210 |
| EXAMES LABORATORIAIS | 131 |
| RISCO CIRURGICO | 87 |
| FISIOTERAPIA (5 SESSOES) | 46 |
| RESTAURACAO RESINA FOTOPOLIMERIZAVEL | 44 |
| OCT (GLAUCOMA, RETINA, MACULA, DISCOS OU PAPILA) | 43 |
| ENDOSCOPIA | 41 |
| LAUDO CARLOS EDUARDO | 40 |

Chama atenção "EXAMES LABORATORIAIS" estar sem tipo: é ele que deveria acionar
a regra de agrupar os exames de sangue do mesmo paciente no mesmo dia como um
atendimento só.

**b) Serviço com o tipo `equipamento` — 106 serviços. Isso era defeito da
função, não do cadastro.** A função só conhecia `laboratorio`, `imagem`,
`exame`, `consulta`, `procedimento` e `cirurgia`; qualquer outro valor virava
"sem tipo". Caíam aí ELETROCARDIOGRAMA (ECG), HOLTER 24 HORAS, MAPA 24 HORAS e
TESTE ERGOMETRICO. São exames feitos com aparelho e passam a contar como exame
— foi por isso que os exames de setembro subiram de 47 para 77 e o balde "sem
tipo" caiu de 96 para 69.

**c) Nome que não existe no cadastro — 17 casos.** A função quebra o texto do
procedimento no sinal `+` para dar conta de fichas como "HEMOGRAMA + RX TORAX".
Quando o nome do serviço tem um `+` dentro dele, ou parênteses que a recepção
digitou aberto, a quebra corta o nome no meio: aparecem pedaços como `PELVE)`,
`TC ABDOME TOTAL (SUPERIOR`, `LIMPEZA ( PROFILAXIA` e `FLUOR ) (ODONTOLOGIA)`.
Junto vêm textos de outro formato, que o cadastro não tem, como
`LABORATORIO (1 EXAMES): HEMOGRAMA COMPLETO` e `2 ITENS: EAS, URINOCULTURA`.
São 17 nomes e poucas dezenas de atendimentos — ficaram registrados no CSV
marcados como `NAO ESTA NO CADASTRO`, mas não foram mexidos: mudar a regra de
quebra do `+` mexeria na classificação de toda a base e merece ser tratado em
separado.

**Observação:** a fatia "Procedimentos" da pizza é sempre zero nesta clínica —
nenhum serviço está cadastrado com o tipo `procedimento` ou `cirurgia`. Os
tipos em uso são `laboratorio` (1.721), `imagem` (156), `equipamento` (106) e
`consulta` (25).

## 5. Achado extra — os dois painéis liam o cadastro de formas diferentes

`dashboard_blocos_periodo` tentava casar o nome do serviço de duas maneiras: o
nome inteiro e, se não achasse, o nome sem o último parênteses (a especialidade
que a agenda anexa, como em "CONSULTA (ORTOPEDIA)"). Já
`painel_executivo_periodo` só tentava o nome inteiro. O mesmo agendamento era
classificado de um jeito num painel e de outro no outro. As duas funções foram
igualadas.

---

# O que foi alterado

## No banco — `APLICAR-PAINEL-EXECUTIVO-CORRECOES-2026-09-01.sql`

Precisa ser rodado no SQL editor do Lovable Cloud. São duas funções trocadas
por `CREATE OR REPLACE`; **não apaga nem altera nenhum dado**.

- `dashboard_blocos_periodo`: nova definição de "atendido"; tipo `equipamento`
  passa a contar como exame; passa a devolver também a inadimplência da
  carteira inteira.
- `painel_executivo_periodo`: mesma definição de "atendido" no Compareceram, no
  tempo médio e no ranking por médico; mesma leitura do cadastro de serviços.

## No código

- [use-dashboard-blocos.ts](src/hooks/use-dashboard-blocos.ts): passa a expor a
  inadimplência da carteira vinda do banco.
- [blocos.tsx](src/components/painel-executivo/blocos.tsx): o card do topo usa
  esse número; enquanto o SQL não for rodado ele cai no número do mês corrente
  e **diz no texto que é só do mês**, para ninguém ler 0,0% como "está tudo
  pago". Os textos de ajuda do card de Atendimentos e da pizza foram corrigidos.

Os cards do bloco "Gestão do Cartão Benefícios" não mudaram: eles são do mês
corrente de propósito.

## Ordem de aplicação

O código novo funciona antes do SQL (cai no número do mês e avisa). O SQL
sozinho também funciona. Mas os números só ficam certos com os dois: rodar o
SQL e publicar o código.
