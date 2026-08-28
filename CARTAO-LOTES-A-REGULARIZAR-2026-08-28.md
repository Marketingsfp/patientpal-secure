# Cartão Benefícios — os 3 lotes a regularizar

Mapeado em 28/08/2026. **Nenhum destes lotes foi alterado.** Este documento
existe para levar à diretoria/recepção e decidir a regra de regularização
antes de qualquer script.

## Onde está cada coisa

| Arquivo | O que é |
|---|---|
| `CARTAO-LOTE-A-RATEIO-MJ-213.csv` | Lista completa do lote A (abre no Excel) |
| `CARTAO-LOTE-C-IMPORTACAO-18-08-164.csv` | Lista completa do lote C (abre no Excel) |
| `docs/CARTAO-LOTES-CONSULTAS-2026-08-28.sql` | Consultas de leitura que regeram os três lotes a qualquer momento |
| `AUDITORIA-CARTAO-BENEFICIOS-2026-08-28.md` | A auditoria completa do módulo |

O lote B não tem CSV próprio porque a aba **"Sem convênio"** do próprio sistema
já mostra essa lista na tela, com filtro e exportação.

---

## Quadro geral

| Lote | Pessoas | O que está acontecendo | Quem perde |
|---|---|---|---|
| **A** — rateio MJ | 213 contratos (**207 sem saída**) | Mensalidade gravada como a *fatia* da pessoa (R$ 5 a R$ 15). Ninguém pagou. Vencidos desde julho → cartão bloqueado | **O paciente** — paga particular tendo cartão |
| **B** — sem convênio | 245 titulares + 263 dependentes (**505 sem saída**) | Contrato ativo sem convênio → sistema não acha tabela de preço | **O paciente** — paga particular tendo cartão |
| **C** — importação 18/08 | **164 contratos** | Contrato criado sem nenhuma parcela → nada é cobrado, e o desconto vale integral | **A clínica** — dá o benefício sem receber |

Repare que A e B doem no paciente, e C dói na clínica. São problemas opostos.

---

## LOTE A — 213 contratos do rateio MJ

**Como identificar:** contrato ativo com mensalidade menor que R$ 20,00. Todos
trazem a observação *"IMPORTADO DA PLANILHA DE RATEIOS MJ (2026-06-11) —
CONFIRMAR IDENTIDADE DO PACIENTE"*.

**O que a importação de 11/06/2026 fez:** transformou cada pessoa do rateio em
titular do seu próprio cartão, e gravou como mensalidade **a fatia dela** no
rateio da família, não o valor do plano. Daí os valores de R$ 15,00, R$ 12,50,
R$ 10,00, R$ 7,50, R$ 6,25, R$ 6,00, R$ 5,00 — e um caso de R$ 1,00.

**Estado hoje:** as 12 parcelas foram geradas em todos, e **nenhum dos 213 pagou
uma única parcela**. A parcela em aberto mais recente venceu em julho/2026 — mais
de 40 dias de atraso.

**Consequência:** a regra do sistema é que, passando de 5 dias de atraso, o
cartão não vale e o paciente é cobrado como Particular. Conferi um por um se
teriam saída por outro cartão válido: **só 6 das 213 têm**. Os outros **207
estão pagando particular hoje, com o cartão na mão.**

Soma das mensalidades do lote: R$ 2.424,25/mês. Se fossem 207 cartões ao valor
de tabela, seriam mais de R$ 22.000,00 — o que confirma que o valor gravado não
é o do plano.

### A decisão que a diretoria precisa tomar

Para cada pessoa do lote, ela é:

1. **Titular de verdade** de um cartão individual? → então o valor precisa subir
   para o de tabela e as parcelas serem refeitas.
2. **Dependente de um titular** que paga o plano da família? → então o contrato
   individual dela deve ser cancelado e ela vinculada como dependente do
   contrato do titular.
3. **Registro que não existe mais**? → cancelar.

A observação "CONFIRMAR IDENTIDADE DO PACIENTE" foi gravada pela própria
importação, o que sugere que nem os nomes estão confirmados. Vale começar por
aí.

---

## LOTE B — 505 pessoas sem convênio vinculado

**Como identificar:** contrato ativo com o campo de convênio vazio.

**Composição:** 245 titulares e 263 dependentes pendurados nesses contratos —
508 pessoas ao todo. Conferi uma a uma se teriam saída por outro cartão válido:
**nenhum dos 245 titulares tem**, e dos 263 dependentes só 3 têm. Ou seja, **505
pessoas estão sem benefício.**

**Origem:** contratos criados em junho/2026 pelo vínculo automático
titular–dependente da migração. Todos com mensalidade R$ 0,00 e sem nenhuma
parcela gerada.

**Consequência:** sem convênio, o sistema não encontra tabela de preço nenhuma e
devolve "sem benefício". As 505 pessoas pagam particular cheio.

### O caminho

Este é o lote **mais fácil dos três**: a aba **"Sem convênio"** do sistema foi
feita exatamente para isso. Ela faz uma coisa só — preencher o convênio. Não
gera mensalidade, não altera valor, não cancela nem recria contrato.

A decisão que falta é **qual convênio** cada um recebe. Se a diretoria definir
uma regra geral (ex.: "todos os que vieram da migração de junho entram como
CARTÃO CONSULTA"), a tela resolve em lote.

---

## LOTE C — 164 contratos da importação de 18/08 sem cobrança

**Como identificar:** contrato ativo criado em 18/08/2026 sem nenhuma parcela.
Números 20262447 a 20262627, convênio CARTÃO CONSULTA + SEGUROS, mensalidade
R$ 120,00 (um caso de R$ 175,00), 12 parcelas previstas.

**O que aconteceu:** naquele dia foram criados 187 contratos pela tela "Importar
planilha" e 175 ficaram sem mensalidade. A tela **não gera cobrança de
propósito** — está escrito no código que as parcelas seriam lançadas depois, com
os valores reais. O "depois" não aconteceu.

**Consequência — e é o contrário do lote A:** como não existe nenhuma parcela,
também não existe parcela vencida. O sistema entende que está tudo em dia e
**libera o desconto do cartão integralmente**. Essas 164 pessoas usam o
benefício sem estar sendo cobradas, e não aparecem em nenhuma lista de
inadimplente.

Valor não cobrado: cerca de **R$ 19.700,00 por mês** de mensalidade que deveria
estar sendo gerada (164 × R$ 120,00).

### A decisão que a diretoria precisa tomar

1. **A partir de que mês cobrar?** As datas de início gravadas são 01/01/2025 ou
   01/01/2026 — se as parcelas forem geradas a partir do início, essas pessoas
   recebem de uma vez uma dívida de vários meses que ninguém combinou com elas.
2. **Cobrar retroativo ou começar do mês que vem?** Essa é a pergunta central, e
   é comercial, não técnica.

**Observação técnica:** hoje não existe no sistema nenhuma tela ou botão para
gerar as parcelas de um contrato depois que ele foi criado. Se isso for virar
rotina (e com duas importações em dois meses, parece que vai), vale transformar
em tela — do jeito atual, cada lote desses depende de SQL rodado à mão.

---

## O que NÃO fazer por enquanto

Nenhum script de atualização em lote nos três lotes, conforme combinado. Em
especial:

- **Não subir o valor do lote A em massa** antes de saber quem é titular e quem
  é dependente — subir o valor de quem é dependente cria uma cobrança dupla na
  mesma família.
- **Não gerar as parcelas do lote C** antes de decidir a data de início — a
  diferença entre gerar de 01/2025 e de 09/2026 são vários meses de dívida
  aparecendo do nada na conta do paciente.
- **Não cancelar nada do lote B** — ali o contrato está certo, só falta o
  convênio.
