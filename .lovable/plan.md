## Diagnóstico (confirmado no banco e no código)

**Tipo:** erro de código + regra de negócio (financeiro/caixa).

O problema **não é o operador escolhendo data errada** — o sistema está trocando a data sozinho.

Em `src/components/financeiro/lancamento-dialog.tsx` (linhas 201-212), quando o pagamento vem de um agendamento, o campo "data" é sobrescrito com a **data do atendimento**, ignorando o `hojeBR()` definido logo acima (linha 141).

Evidência nos lançamentos da Nicolle Frota (criados hoje, 28/07/2026):

| Paciente | Criado em | Data gravada |
|---|---|---|
| ELIANA ARAUJO GOMES (2 itens) | 28/07 12:11 | **03/08/2026 (futuro)** |
| EVELYN SOUZA BARCELOS (2 itens) | 28/07 11:44 e 12:06 | **23/07/2026 (passado)** |
| Demais atendimentos | 28/07 | 28/07 (corretos) |

Ou seja: agendamento marcado para outro dia (antes ou depois) faz o recebimento nascer com data errada — e, com a mudança do turno anterior (`forcar_sessao_hoje: false`), esse "falso retroativo" ainda tenta jogar o movimento no caixa de outro dia, podendo criar sessão de caixa retroativa fantasma.

## O que será feito

1. **Data do lançamento = data do recebimento (hoje).**
   Remover a sobrescrita automática pela data do agendamento em `lancamento-dialog.tsx`. O caixa registra quando o dinheiro entrou, não quando o atendimento aconteceu. A data do atendimento continua rastreável pelo vínculo `agendamento_id`.

2. **Nunca permitir data futura.**
   Bloquear no diálogo qualquer data maior que hoje (São Paulo), com aviso claro. Hoje isso passa silenciosamente.

3. **Retroativo só quando o operador escolher de propósito.**
   O campo de data continua editável; ao escolher data anterior, mantém-se o aviso já existente e o movimento vai para o caixa daquele dia (regra atual, que é a desejada).

4. **Corrigir os registros já gravados errado (com sua confirmação).**
   - ELIANA (R$ 130 + R$ 60): 03/08 → 28/07
   - EVELYN (R$ 152 + R$ 152): 23/07 → 28/07, se de fato foram recebidos hoje
   Antes de mexer, apresento a lista completa dos lançamentos da clínica com `data` diferente do dia em que foram criados, para você validar quais são recebimento real do dia e quais foram retroativos legítimos.

## Detalhes técnicos

- Arquivo: `src/components/financeiro/lancamento-dialog.tsx` — remover o bloco que faz `setData(iso)` a partir de `agendamentos.inicio`; adicionar guarda `data > hojeBR()` no submit.
- Sem alteração na função `fn_registrar_lancamento_e_caixa`: ela já usa `America/Sao_Paulo` e trata corretamente o ramo retroativo. A causa raiz era exclusivamente de front-end.
- Correção de dados: migração/UPDATE pontual apenas nas linhas confirmadas por você (`fin_lancamentos.data`), sem tocar em `caixa_movimentos`, já que os movimentos caíram no caixa correto de hoje.

## Fora do escopo

- Regras de desconto, convênio e emissão de NFS-e.
- Sessões de caixa já fechadas de dias anteriores.
