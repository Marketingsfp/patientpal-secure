# Notas fiscais recusadas por falta de CPF do paciente — 31/08/2026

Correção feita em 31/08/2026 à tarde, depois de seis notas falharem no mesmo dia.
Diagnóstico feito nos dados de produção; **nenhum dado foi alterado**.

---

## Resumo em uma frase

Quando o paciente não tem CPF na ficha, a prefeitura recusa a nota — e a
mensagem que chegava na recepção era um erro técnico em inglês que não dizia o
que fazer. Agora o sistema avisa antes de enviar, com o texto certo: falta o CPF.

---

## 1. O que aconteceu hoje

Das 250 notas emitidas hoje, **9 tentativas falharam**, por duas causas
diferentes:

| Hora | Paciente | Valor | Causa |
|------|----------|------:|-------|
| 14:30 | ALEXANDRA SANTOS DE JESUS | 130,00 | sem CPF |
| 14:39 | ALEXANDRA SANTOS DE JESUS | 130,00 | sem CPF |
| 14:49 | CLAUTIDES RODRIGUES MOREI | 120,00 | sem CPF |
| 15:48 | ADRIANA PAULA DOS SANTOS | 110,00 | numeração repetida |
| 16:26 | SULAMITA BARBOSA DO NASCIMENTO | 110,00 | numeração repetida |
| 16:31 | ELIAS CONCEICAO FERREIRA | 130,00 | numeração repetida |
| 16:32 | GUSTAVO SANTOS DE SOUZA | 145,00 | sem CPF |
| 16:42 | VICTORIA ALVES DE OLIVEIRA | 30,00 | sem CPF |
| 16:42 | VICTORIA ALVES DE OLIVEIRA | 175,00 | sem CPF |

**Nenhum desses pacientes tem nota válida.** Todos precisam ser reemitidos.

Conferi as fichas: ALEXANDRA, CLAUTIDES, GUSTAVO e VICTORIA estão mesmo **sem
CPF cadastrado**. (Existe uma ficha "CLAUTIDES RODRIGUES MOREIRA", com CPF, mas
a nota foi emitida pela ficha "CLAUTIDES RODRIGUES MOREI", que está sem.)

## 2. Por que a nota era recusada

O arquivo da nota (o XML da DPS) exige que o bloco do tomador **comece pelo
CPF ou CNPJ** — o nome só é aceito depois dele. Sem CPF, o sistema mandava só o
nome, e a prefeitura devolvia:

```
Element '{http://www.sped.fazenda.gov.br/nfse}xNome':
This element is not expected. Expected is one of ( ...CNPJ, CPF... )
```

Ou seja: o sistema deixava tentar, a prefeitura recusava, e a recepção via uma
mensagem que não dizia nem que o problema era o CPF, nem de quem.

## 3. O que foi corrigido

**a) A tela avisa antes de enviar.** No diálogo "Em nome de quem emitir a
NFS-e?", a opção "Cliente do serviço (paciente)" fica bloqueada quando o
paciente está sem CPF, com o recado:

> Paciente sem CPF no cadastro — a prefeitura não aceita nota fiscal sem o CPF
> do tomador. Cadastre o CPF na ficha do paciente para liberar esta opção, ou
> emita em nome de um terceiro.

É o mesmo tratamento que já existia para paciente sem endereço.

**b) O servidor barra também.** São cinco telas que emitem nota (agenda,
financeiro, atendimentos, contratos, orçamentos). A verificação foi posta
também no servidor, que é por onde todas passam — assim uma aba aberta desde
antes da correção não escapa. A mensagem diz o nome do paciente, o que ajuda na
cobrança de vários atendimentos de uma vez.

**c) O botão "Reenviar" passou a funcionar nesses casos.** Antes ele repetia os
mesmos dados gravados na nota — inclusive o CPF vazio —, então dava a mesma
recusa para sempre. Agora, quando a nota está sem documento, o reenvio **busca
o CPF na ficha do paciente**. Basta cadastrar o CPF e clicar em Reenviar.

Arquivos: [nfse-tomador.ts](src/lib/nfse-tomador.ts) (a regra, com testes),
[nfse.functions.ts](src/lib/nfse.functions.ts) (trava do servidor e reenvio),
[use-pick-tomador.tsx](src/components/nfse/use-pick-tomador.tsx) (o diálogo).

Verificação de tipos limpa, 469 testes passando (6 novos).

## 4. O que a recepção faz com as 6 notas paradas

1. Abrir a ficha do paciente e cadastrar o CPF.
2. Ir em **Financeiro › Notas Fiscais (NFS-e)**, achar a nota com status de erro.
3. Clicar em **Reenviar**.

## 5. O que ainda está em aberto

- **As 3 recusas por "numeração repetida"** (ADRIANA, SULAMITA e ELIAS) têm
  outra causa: o número da DPS usado já tinha sido gasto em uma nota anterior.
  Não foi investigado ainda.
- **A nota duplicada 9831/9832** (mesmo atendimento, duas notas às 16:xx de
  hoje) só se resolve cancelando uma delas na prefeitura. A trava que impede
  isso de repetir já está pronta no código, esperando publicação.
