## Que erro é esse?

A tela mostrou:

> `Erro ao renovar: column "descricao" of relation "contrato_mensalidades" does not exist`

Traduzindo em linguagem simples: as funções do banco que fazem a renovação (`renovar_contrato_extensao` e `renovar_contrato_troca_plano`) tentam gravar a taxa de inclusão de dependente em uma coluna chamada **descricao** na tabela de mensalidades — só que essa coluna nunca existiu nessa tabela. A tabela `contrato_mensalidades` só tem o campo **observacoes** para texto livre. Por isso o Postgres recusa o insert e a renovação inteira é abortada.

Isso é **erro de código no banco**, não regra de negócio nem problema de dados. Foi um resquício das mudanças anteriores da "Taxa de inclusão de dependente" — ficou uma referência a uma coluna que foi imaginada, mas não criada.

Efeito prático: **nenhuma renovação está passando** hoje, mesmo sem incluir dependente novo, porque as duas versões da função continuam com esse INSERT quebrado no caminho de dependentes.

Também vi que a função `renovar_contrato_extensao` existe em **duas assinaturas sobrepostas** (uma antiga sem `_valor_mensal` e a nova com `_valor_mensal`). Convém remover a antiga para não haver ambiguidade nas chamadas futuras.

## Como resolver

Uma migração única que:

1. **Corrige `renovar_contrato_extensao`** (versão com `_valor_mensal`): remove a coluna inexistente `descricao` do `INSERT` da taxa de inclusão. O texto "Taxa de inclusão de dependente — <nome>" continua sendo gravado em `observacoes`, exatamente como já acontece hoje nas taxas antigas visíveis no financeiro da paciente.
2. **Corrige `renovar_contrato_troca_plano`** da mesma forma (mesmo bug no ramo de dependentes novos).
3. **Remove a assinatura antiga** `renovar_contrato_extensao(_contrato_id, _observacao, _dependentes)` sem `_valor_mensal`, para deixar apenas a versão nova em uso.

Nenhuma alteração no front-end é necessária — o diálogo de renovação já envia os parâmetros certos.

## Antes × Depois

- **Antes:** clicar em "Renovar Contrato" dispara toast vermelho `column "descricao" ... does not exist`; nenhuma parcela é gerada, nenhum dependente é atualizado.
- **Depois:** renovação (extensão e troca de plano) processa normalmente; taxa de inclusão de dependente é lançada com o texto correto em `observacoes` (como já é feito hoje para as taxas existentes da paciente).

## Validação após aplicar

- Re-testar a renovação da paciente Quédima (extensão do CARTÃO CONSULTA, mesmo com a Tuane como dependente ativa).
- Conferir se as parcelas 13–24 aparecem em "Mensalidades" com o valor da faixa selecionada.
- Confirmar que nenhuma taxa nova é lançada quando não há inclusão de dependente novo nesta renovação.

## Riscos

- Baixo. É correção pontual de duas funções `SECURITY DEFINER` já existentes; não altera tabela, RLS, permissão nem dados.
- Áreas sensíveis tocadas: **financeiro** (mensalidades) e **contratos**. Como o INSERT quebrado hoje aborta a transação inteira, ninguém conseguiu renovar até agora — não há risco de "consertar em cima" de renovação parcial.
