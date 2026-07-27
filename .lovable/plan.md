## Situação verificada

O contrato 20261032 (CARTÃO CONSULTA + SEGUROS) da MARIA HOSANA foi cancelado em 22/07/2026 por uma rotina em lote, com o motivo "Duplicata da importação legada — mantido contrato irmão". Não foi ação da equipe na tela.

O lote atingiu **153 contratos, todos da POLICLINICA MENINO JESUS**. Nenhum dos contratos cancelados tem mensalidade paga.

Composição dos pares (contrato cancelado x contrato irmão que ficou ativo):

| Cancelado | Irmão ativo | Pares | Irmão com mensalidade paga |
|---|---|---|---|
| CARTÃO CONSULTA + SEGUROS | CARTÃO CONSULTA | 97 | 2 |
| CARTÃO CONSULTA | CARTÃO CONSULTA + SEGUROS | 32 | 32 |
| (sem convênio) | CARTÃO CONSULTA + SEGUROS | 14 | 2 |
| (sem convênio) | CARTÃO CONSULTA | 8 | 2 |
| sem irmão ativo | — | 2 | — |

## Regra aprovada por você

Havendo duplicidade, **fica o contrato de CARTÃO CONSULTA + SEGUROS**; o outro é **excluído do sistema**, sem gravar cancelamento. Se o contrato tiver sido alterado manualmente **e** tiver mensalidade paga, não se mexe nele.

## Plano

1. **Lista de conferência primeiro**: gerar planilha com os 153 casos — nº, paciente, prontuário, convênio, início/fim, valor, contrato irmão, se tem mensalidade paga e a ação proposta (manter / excluir / não mexer). Nada é executado antes da sua conferência.

2. **Grupo A — 97 pares "+ SEGUROS cancelado x CARTÃO CONSULTA ativo"**
   - Reativar o contrato "+ SEGUROS" (limpar situação, data e motivo de cancelamento).
   - Excluir o contrato CARTÃO CONSULTA irmão, junto com suas parcelas em aberto.
   - Exceção: os **2 pares em que o irmão tem mensalidade paga** ficam intocados e entram na lista de conferência manual.

3. **Grupo B — 32 pares "CARTÃO CONSULTA cancelado x + SEGUROS ativo"**
   - O contrato correto já está ativo. O cancelado seria excluído, mas nos 32 casos o irmão tem pagamento; a regra é sobre o contrato a excluir, que não tem pagamento — então excluir os 32 cancelados e manter o "+ SEGUROS" como está.

4. **Grupo C — 22 pares com contrato sem convênio definido**
   - Excluir o contrato cancelado sem convênio e manter o irmão ativo.
   - Se o cancelado tiver qualquer parcela paga ou edição manual, fica na lista de exceções e não é tocado.

5. **Grupo D — 2 contratos cancelados sem irmão ativo**
   - Apenas reativar, pois não havia duplicidade.

6. **Rastreabilidade**: as exclusões e reativações ficam registradas no log de auditoria, com um relatório final em arquivo listando exatamente o que foi feito em cada contrato.

7. **Prevenção**: nenhuma nova rotina de cancelamento ou exclusão em massa será executada sem lista aprovada antes.

## Escopo e limites
- Clínica alvo: **POLICLINICA MENINO JESUS** apenas. As outras duas clínicas não são tocadas.
- Não altero valores, convênios, datas, carência nem regras de Cartão Consulta.
- Nenhum contrato novo é criado.
- Contratos com mensalidade paga não são excluídos em nenhuma hipótese.

## Detalhes técnicos
- Tabela principal: `contratos_assinatura`; parcelas em `contrato_mensalidades`.
- Seleção do lote: `cancelamento_motivo LIKE 'Duplicata da importa%'` + `clinica_id = 7570ddde-…`.
- Exclusão física com verificação prévia de ausência de `pago_em` e de lançamentos financeiros vinculados; execução em transação única e idempotente.
- Reativação por atualização de `status`, `cancelado_em`, `cancelamento_motivo`; trigger `fn_audit_trigger` grava antes/depois em `audit_log`.

Confirmo a execução gerando primeiro a lista (passo 1) e só depois aplicando os passos 2 a 5.
