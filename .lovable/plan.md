## Objetivo

No diálogo "Incluir dependente", quando o operador marcar "Cobrar taxa de inclusão de dependente", o campo **Valor (R$)** deve vir preenchido automaticamente com o valor configurado no convênio e **ficar somente leitura** (não editável).

## O que muda

Arquivo: `src/components/pages/contratos-page.tsx` (diálogo de inclusão de dependente).

1. O valor do campo continua sendo carregado de `cb_convenios.taxa_inclusao_dependente` (já implementado).
2. O `<Input>` de Valor passa a ser `readOnly` + estilo desabilitado (cinza), mantendo o número visível para conferência.
3. Remover o spinner numérico (setas) já que não é mais editável — pode virar um campo formatado em BRL apenas para leitura.
4. A data de vencimento continua editável (o operador precisa poder ajustar).

## O que NÃO muda

- Checkbox continua funcionando (marcar/desmarcar cobra ou não a taxa).
- Regra do "mesmo dia da venda" (default desmarcado) permanece.
- Se o convênio tiver `taxa_inclusao_dependente = 0`, o valor exibido será R$ 0,00 e ao salvar nenhuma cobrança é lançada (código atual já ignora `valor <= 0`).
- Cadastro do convênio continua sendo o único lugar para editar esse valor.

## Ponto a confirmar

Se o convênio estiver com `taxa_inclusao_dependente = 0` (ou nulo) e o operador marcar o checkbox, o que fazer?

- **A) Manter como está:** exibe R$ 0,00 travado e nada é lançado ao salvar (comportamento atual).
- **B) Bloquear o checkbox:** se o convênio não tem taxa configurada, o checkbox aparece desabilitado com aviso "Configure a taxa no cadastro do convênio".

Sigo com **A** se não houver objeção.
