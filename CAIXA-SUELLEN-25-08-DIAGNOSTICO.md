# Caixa da Suellen — segunda-feira 25/08/2026

Diagnóstico feito em 26/08/2026 consultando o banco de produção.
**Somente leitura — nenhum dado foi alterado.**
Atendente: SUELLEN ALEXANDRE BATISTA.

## Resumo em uma frase

O sistema não errou nenhum lançamento: o fechamento bate centavo a centavo.
A diferença de R$ 300,00 está na **conferência do dinheiro físico**, e há
quatro coisas no dia 25 que fazem a gaveta dela divergir do cupom.

---

## 1. Ela teve DOIS caixas no dia 25, não um

| Caixa | Abriu | Fechou | Situação hoje |
|-------|-------|--------|---------------|
| nº 1 | 07:07 | 16:40 | fechado, diferença R$ 0,00 |
| nº 2 | 16:43 | — | **AINDA ABERTO** |

Quem olhar só o cupom das 16:40 não enxerga o caixa nº 2.

## 2. O caixa nº 1 — o que o cupom de R$ 6.786,75 realmente é

| Forma de pagamento | Qtd | Valor |
|--------------------|-----|-------|
| Dinheiro | 62 | 7.073,77 |
| Cartão de crédito | 17 | 2.493,00 |
| Cartão de débito | 13 | 1.519,98 |
| PIX | 10 | 1.105,00 |
| **Total recebido** | **102** | **12.191,75** |
| Estornos em dinheiro | 4 | −755,00 |
| Sangrias (08:54 de 1.900,00 e 15:11 de 2.750,00) | 2 | −4.650,00 |
| **Fechamento calculado = informado** | | **6.786,75** |

**O R$ 6.786,75 do cupom NÃO é dinheiro — inclui cartão e PIX.**

O dinheiro em espécie que o sistema espera na gaveta ao fechar é:

    7.073,77 (dinheiro recebido) − 755,00 (estornos) − 4.650,00 (sangrias) = R$ 1.668,77

Os 4 estornos conferem: todos correspondem a cobranças repetidas ou canceladas
no mesmo dia (Alexandra R$ 480, Rosani R$ 110, Eny R$ 110, Luís Victor R$ 55).
Nenhuma cobrança duplicada ficou sem estorno.

## 3. Achado nº 1 — faltou a sangria final do dia

Este é o ponto mais forte.

Em **todos** os outros dias a Suellen termina o expediente com uma sangria de
valor "quebrado" que zera exatamente o dinheiro da gaveta:

| Dia | Última sangria | Dinheiro que sobrou |
|-----|----------------|---------------------|
| 19/08 | 5.983,84 | 0,00 |
| 20/08 | 1.439,35 | 0,00 |
| 24/08 | 400,98 | 0,00 |
| **25/08** | **2.750,00 (redonda)** | **1.668,77** |

No dia 25 ela parou na sangria redonda de 2.750,00 e **não lançou a sangria
final**. Se o dinheiro foi entregue mas a sangria não foi digitada, o sistema
continua achando que há 1.668,77 na gaveta que já não está lá.

## 4. Achado nº 2 — R$ 887,00 de guias retroativas no caixa nº 2

Três minutos depois de fechar, às 16:43, ela abriu o caixa nº 2 e lançou seis
guias de atendimentos de **outros dias**, todas em dinheiro:

| Paciente | Procedimento | Dia do atendimento | Valor |
|----------|--------------|--------------------|-------|
| ODAIZA DOS SANTOS | Risco cirúrgico | 20/08 | 120,00 |
| ROBERTO DA SILVA | Teste ergométrico | 20/08 | 250,00 |
| MONIQUE GRAÇA BRITO | Ecocardiograma | 20/08 | 152,00 |
| ALIRA SILVA DOS SANTOS | Consulta | 20/08 | 110,00 |
| LIDIANE DA SILVA ALMEIDA | Laudo aptidão física | 20/08 | 145,00 |
| MARIA VITÓRIA COSTA PEREIRA | Consulta | 22/08 | 110,00 |
| | | **Total** | **887,00** |

Regra da casa: guia retroativa entra na gaveta de hoje **só se o dinheiro foi
recebido hoje no balcão**. Se o paciente pagou lá atrás, no dia 20 ou 22, esse
dinheiro não está na gaveta e os R$ 887,00 são sobra fantasma.

**Isso o banco não sabe responder — só a Suellen sabe.**

## 5. Achado nº 3 — a ODAIZA: a conta está certa, mas nos caixas errados

A Odaiza foi atendida em 20/08 e pagou naquele dia, no caixa da própria Suellen:
ECG R$ 51,00 e "consulta" R$ 110,00, ambos em dinheiro — R$ 161,00 no total.

No dia 25 a Suellen corrigiu o procedimento: estornou a consulta de R$ 110,00 e
lançou o correto, risco cirúrgico de R$ 120,00. Ou seja, a paciente devia pagar
apenas os **R$ 10,00 de diferença**.

Somando os dois movimentos, a clínica ganhou exatamente R$ 10,00 — a conta
global está certa. O problema é **onde** cada metade foi parar:

| Movimento | Caiu no caixa de | Efeito |
|-----------|------------------|--------|
| Recebimento R$ 120,00 | SUELLEN | +120,00 |
| Estorno R$ 110,00 | **JOÃO PEDRO** | −110,00 |

Como o estorno saiu do caixa errado, o caixa da Suellen ficou com
**R$ 110,00 de sobra fantasma** e o do João Pedro com **R$ 110,00 de falta
fantasma**. Se o estorno tivesse ficado no caixa dela, sobraria +R$ 10,00 —
exatamente a diferença que a paciente pagou.

## 6. Achado nº 4 — defeito do sistema: estorno caiu no caixa de outra pessoa

O estorno de R$ 110,00 da Odaiza, digitado pela Suellen às 16:44, foi gravado
no caixa do **JOÃO PEDRO NEVES CANTARELA** (que estava aberto desde as 13:00).

Ou seja, saiu R$ 110,00 de um caixa onde esse dinheiro nunca entrou. O caixa do
João Pedro está hoje R$ 110,00 negativo por causa disso.

Isso é defeito de programa, não erro da atendente: quando o lançamento original
é de um caixa já fechado, o estorno procura qualquer sessão aberta e pode pegar
a errada. Vale corrigir no código.

---

## 7. A conta para conferir com a Suellen

Dinheiro que o sistema diz que deveria estar na gaveta dela no fim do dia 25:

    Caixa nº 1 .......................... 1.668,77
    Caixa nº 2 (retroativas) ...........   887,00
    (−) estorno da Odaiza, que saiu
        do caixa do João Pedro .........  −110,00
    ------------------------------------------------
    Dinheiro real esperado .............. 2.445,77

**Três perguntas para ela, nesta ordem:**

1. Você conferiu a gaveta contra o número **1.668,77** ou contra o **6.786,75**
   do cupom? (O 6.786,75 inclui cartão e PIX — não serve para contar dinheiro.)
2. Você entregou a última remessa de dinheiro sem lançar a sangria no sistema?
3. Das seis guias retroativas de R$ 887,00, quais o paciente pagou **hoje**
   no balcão e quais já tinham sido pagas nos dias 20 e 22?

## 8. O que NÃO é a causa

Descartei, consultando o banco:

- **Cobrança em dobro:** nenhuma. As repetições encontradas são procedimentos
  diferentes do mesmo paciente, ou já foram estornadas.
- **Lançamento perdido:** nenhum. Todo recebimento em dinheiro digitado por ela
  no dia 25 gerou o movimento de caixa correspondente.
- **Erro de arredondamento:** nenhum. Os totais fecham exatos.
- **Troco ou pagamento misto:** nenhum lançamento do dia teve troco declarado
  nem foi dividido em duas formas de pagamento.
- **Uma linha de R$ 300,00:** não existe nenhum lançamento em dinheiro de
  R$ 300,00 no caixa dela no dia 25.

## 9. Pendências para arrumar

1. **Fechar o caixa nº 2 da Suellen**, que segue aberto desde 25/08 às 16:43.
   Enquanto estiver aberto, qualquer lançamento retroativo dela cai lá dentro.
2. **Fechar o caixa do João Pedro**, aberto desde 25/08 às 13:00 e hoje com
   R$ 110,00 negativos por causa do estorno da Odaiza.
3. **Fechar o caixa do Luan**, aberto desde 25/08 às 14:40 (saldo zero).
4. **Corrigir no código** o roteamento do estorno de lançamento antigo, para
   não cair no caixa de outra pessoa.

---

## 10. Como o sistema trata guia retroativa — a regra, já implementada

Existem **dois tipos** de guia retroativa, e eles têm efeitos opostos no caixa.
A regra está em `src/lib/financeiro/registro-no-caixa.ts` e é aplicada em
`src/components/financeiro/lancamento-dialog.tsx`.

| Situação | Entra na gaveta de hoje? | O que o sistema grava |
|----------|--------------------------|------------------------|
| Atendido dia 20, **pagando agora** no balcão | **SIM** | movimento `recebimento`, valor cheio |
| Atendido dia 20, **já tinha pago** no dia 20 | **NÃO** | movimento `registro`, pesa R$ 0,00 |
| Pago no sistema anterior (Clínica Total) | **NÃO** | nenhum movimento de caixa |

Em **todos** os casos a receita é faturada na **data do atendimento** (a
competência), e o repasse do prestador é calculado normalmente. O que muda é
só se o dinheiro conta ou não na conferência da gaveta de hoje.

O sistema **não adivinha** qual é o caso — a tela pergunta na hora do
lançamento e mostra um aviso de confirmação explicando o que vai acontecer.
Se a atendente marca que já foi pago antes, o sistema ainda exige a data do
pagamento ou o número do recibo, para o financeiro conseguir auditar depois.

### O que a Suellen respondeu nas seis guias do dia 25

As seis linhas foram gravadas como **`recebimento`**, com a marcação
`[DATA RETROATIVA: 20/08/2026]` na descrição. Isso é a resposta
"**o paciente está pagando agora**".

Consequência: o sistema está afirmando que **entraram R$ 887,00 em espécie na
gaveta dela no fim do dia 25**. Se foi isso mesmo que aconteceu, está tudo
certo e esse dinheiro tem que ser encontrado na gaveta. Se alguma dessas guias
já tinha sido paga lá atrás, a resposta na tela foi a errada e aquele valor
vira sobra fantasma.

**Não é defeito do programa — é a resposta dada na tela.** O único defeito real
encontrado no dia é o do item 6 (estorno indo para o caixa de outra pessoa).
