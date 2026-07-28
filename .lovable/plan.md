## O que está acontecendo (verificado no banco)

Paciente **SIDICLEI MARCIANO NISTALDO**, contrato **20261413** (CARTÃO CONSULTA + SEGUROS, ativo).

Atendimentos dele **hoje (28/07/2026)** já faturados:

| Serviço | Tipo do serviço | Médico | Valor |
|---|---|---|---|
| ELETROCARDIOGRAMA (ECG) | exame | cardiologia | R$ 0,00 (gratuidade) |
| RX TÓRAX AP/PERFIL | exame | — | R$ 0,00 (gratuidade) |
| ECOCARDIOGRAMA (ADULTO) | exame | cardiologia | R$ 144,40 (-5%) |

Nenhum deles é **consulta**. A consulta de R$ 9,99 realmente **não foi usada hoje**.

## Causa raiz (erro de código, não regra de negócio)

A regra do convênio para CARDIOLOGIA é: `tipo = consulta`, limite `1/dia` por titular-ou-dependente.

Na hora de contar quantas vezes o benefício já foi usado, o código da agenda filtra os atendimentos **apenas pela especialidade do médico** — ele nunca verifica se o atendimento era de fato uma **consulta**. Como ECG e Ecocardiograma foram feitos com médicos de cardiologia e estão pagos, o sistema contou 2 usos e disse "limite de 1/dia atingido", aplicando 50% em vez de R$ 9,99.

Ou seja: qualquer exame feito com um médico da mesma especialidade "queima" a consulta do dia do paciente. Isso afeta **todos os pacientes do Cartão Consulta**, não só o Sidiclei.

## Correção proposta

Arquivo: `src/routes/_authenticated/app.agenda.tsx`, no bloco que apura o consumo do limite.

1. Quando a regra escolhida tiver `tipo` definido (ex.: `consulta`), passar a considerar como consumo **somente** os atendimentos cujo serviço é do mesmo tipo. O tipo vem de `procedimentos.tipo` (`consulta` / `exame`), casando pelo nome do procedimento gravado no agendamento (normalizado, como já é feito em outros filtros do arquivo).
2. Esse filtro entra **em conjunto** com o filtro por especialidade e o de grupo de gratuidade que já existem — não substitui nenhum deles.
3. Sem alteração de valores, de regras cadastradas ou de dados do Cartão Consulta — apenas a contagem de uso.

## Verificação após a correção

- Reabrir o faturamento do Sidiclei hoje: a consulta de cardiologia deve sair **R$ 9,99 dinheiro / R$ 9,99 cartão**, sem o aviso "Limite de 1/dia atingido".
- Depois de faturar essa consulta, uma **segunda** consulta no mesmo dia deve voltar a mostrar o aviso e cobrar 50% — o limite continua funcionando.
- Um exame no mesmo dia deve continuar seguindo a própria regra (gratuidade / desconto), sem consumir a consulta.

## Fora do escopo (apenas relato)

Notei que a regra de CARDIOLOGIA está no grupo `consulta-diaria-cartao-consulta`, enquanto as outras 12 especialidades estão em `consulta-diaria-cartao-consulta-seguro`. Isso significa que hoje a cota da cardiologia **não** é compartilhada com as demais especialidades. Pode ser intencional ou erro de digitação no cadastro — **não vou alterar**; se quiser, o ajuste é manual na tela de regras do convênio.
