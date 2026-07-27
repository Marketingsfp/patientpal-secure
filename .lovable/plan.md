# Ajustar linha de convênio/plano na GR

**Aplicação:** todas as 3 clínicas (SFP, Menino Jesus, São Francisco de Paula).

## Problema

A GR imprime duas linhas hoje:
- `CONV: PARTICULAR`
- `PLANO: CARTÃO CONSULTA + SEGUROS (TITULAR)`

O sistema não usa o conceito de "plano" — o cliente pediu que apareça apenas uma linha de convênio, com a regra correta.

## Regra final na GR

Uma única linha (a atual `CONV:`), decidida assim:

- Atendimento **particular** (valor cheio, sem desconto de convênio) → `CONV: PARTICULAR`, **mesmo que o paciente tenha convênio ativo**.
- Atendimento **convênio** (ou particular gravado indevidamente mas com desconto de convênio comprovado no caixa — caso Zilma) → `CONV: <NOME DO CONVÊNIO> (TITULAR)` ou `CONV: <NOME DO CONVÊNIO> (DEPENDENTE DE <NOME DO TITULAR>)`.
- Gratuidade continua como hoje (`CONV: <CONVÊNIO> — GRATUIDADE`).

Sem linha `PLANO:` em nenhum caso.

## Alterações (apenas frontend/impressão)

`src/lib/print-gr.ts`:
1. Remover a chamada `renderLinhaVinculo(vinculoConv)` do template da GR (linha ~890) — elimina a linha `PLANO:`.
2. Concatenar o sufixo `(TITULAR)` / `(DEPENDENTE DE X)` diretamente no `convLabel` quando ele já for o nome de um convênio (não `PARTICULAR` e não `CONVÊNIO` genérico), usando o `vinculoConv` já resolvido.
3. Não alterar a heurística que promove `PARTICULAR → nome do convênio` quando há evidência de desconto (mantém o fix da Zilma).
4. Remover a função `renderLinhaVinculo` se ficar sem uso.

## Validação

- Reimprimir GR da Zilma (Dr. Sandro, R$9,99) → deve sair `CONV: CARTÃO CONSULTA + SEGUROS (TITULAR)`, sem linha PLANO.
- Reimprimir uma GR particular de paciente com convênio ativo → `CONV: PARTICULAR`, sem linha PLANO.
- Reimprimir uma GR de dependente → `CONV: <CONVÊNIO> (DEPENDENTE DE <TITULAR>)`.
