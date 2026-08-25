# Divergência de R$ 0,01 no fechamento — 9,99 x 10,00

Data: 25/08/2026
Modo: auditoria de leitura. Nenhum dado foi alterado, nenhum comando gravou no banco.

## Resumo em uma frase

O R$ 9,99 **não é uma conta que deu errado** — é o preço que está digitado no
cadastro do convênio. Nenhum cálculo do sistema transforma 10,00 em 9,99.

## 1. De onde vem o 9,99

O valor está cadastrado como preço fixo do Cartão Consulta, na tela
**Cartão Benefícios → Regras de Preço** (tabela `cb_convenio_regras`,
modo `valor_fixo`): **R$ 9,99 em dinheiro e R$ 12,00 em cartão/PIX**.

Isso aparece em três lugares independentes do projeto, o que confirma que foi
uma decisão de cadastro e não um acidente:

- a migração que criou o preço, com o comentário
  `"Converte regras com valor de consulta R$9,99 (dinheiro) → preço fixo dinheiro 9,99 / outros 12,00"`
  (`supabase/migrations/20260614020234_...sql`);
- o código de cobrança, que cita `"a regra correta (DERMATOLOGIA R$9,99)"`
  como o preço esperado (`src/lib/convenio/info-convenio-paciente.ts:302`);
- o comentário do controle de limite: `"1 consulta R$9,99/dia/contrato"`
  (`src/lib/convenio/info-convenio-paciente.ts` item 5).

Ou seja: o sistema está cobrando exatamente o que mandaram cobrar. Se a
operação combinou R$ 10,00, quem está desatualizado é o **cadastro do preço**,
não a fórmula.

## 2. Regra de arredondamento — verificada, está correta

Auditei as três camadas onde dinheiro é calculado. Não encontrei nenhum
truncamento.

**Colunas do banco.** As tabelas do financeiro usam `numeric(14,2)` e
`numeric(12,2)` — decimal exato de 2 casas, que **arredonda e nunca trunca**.
Não é ponto flutuante, então o erro clássico de 10,00 virar 9,99 não é
possível nessas colunas.

**Cálculo de preço do convênio.** `computeValor` em `src/lib/cb-regras.ts`
arredonda com `Math.round(n * 100) / 100` tanto no valor fixo quanto no
desconto percentual. No modo valor fixo ele devolve o número cadastrado sem
tocar nele — mais uma confirmação de que o 9,99 vem do cadastro.

**Repasse, desconto e fechamento de caixa.** `src/lib/repasse-calc.ts` fecha
todo percentual com `.toFixed(2)`. `src/lib/caixa/fechamento.ts` arredonda em
duas casas o saldo dos movimentos (`saldoDeMovimentos`), o total conferido
(`totalConferido`) e a diferença (`classificarDiferenca`) — e trata qualquer
diferença abaixo de meio centavo como "caixa confere". Ao todo há 214 pontos
de arredondamento explícito no código.

**Varredura de truncamento.** Procurei `Math.floor`, `Math.trunc` e `parseInt`
aplicados a dinheiro em todo o `src/`. Os únicos casos são o valor por extenso
do recibo e a máscara do campo de moeda, que trabalham em centavos inteiros de
propósito. Nenhum arredonda valor financeiro para baixo.

**Testes.** Rodei as 52 provas automáticas de fechamento de caixa, repasse,
máscara de moeda e saldo de atendimento: **52 passaram, 0 falharam.**

## 3. Um ponto para arrumar depois (não é a causa)

As colunas de dinheiro de `caixa_sessoes` e `caixa_movimentos` são `numeric`
**sem casas fixas**, diferente das tabelas do financeiro, que são
`numeric(14,2)`. Hoje isso não causa problema porque o sistema já arredonda
antes de gravar, mas essas colunas *aceitariam* um valor quebrado como
9,99499 se algum caminho novo esquecesse o arredondamento.

O bloco 4 do arquivo de diagnóstico verifica se isso já aconteceu alguma vez.
Se voltar vazio, nunca aconteceu, e a mudança de tipo vira só um reforço
preventivo — que eu recomendo fazer num momento calmo, não junto com esta
correção de preço.

## 4. Arquivos entregues

- `CAIXA-CONVENIO-999-DIAGNOSTICO.sql` — **só lê.** Mostra onde o 9,99 está
  cadastrado e prova, com dado de produção, se algum valor quebrado existe.
- `CAIXA-CONVENIO-999-MUDAR-PRECO-PARA-10.sql` — **a Parte 2 grava.**
  Muda o preço de 9,99 para 10,00. Só rodar depois de decidir que o preço
  deve mesmo mudar.

## 5. O que falta decidir

Trocar 9,99 por 10,00 é **mudar o preço cobrado do paciente**, não corrigir um
defeito. Por isso não alterei nada: essa é uma decisão da clínica, e o preço
novo passa a valer para todos os atendimentos seguintes daquele convênio.

Atendimentos já cobrados e caixas já fechados não são tocados em nenhuma
hipótese.
