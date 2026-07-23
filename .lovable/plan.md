## Problema (confirmado nos dados)

O André está com contrato ativo no convênio **CARTÃO CONSULTA + SEGUROS** (nº 20261884, POLICLINICA MENINO JESUS). O convênio tem regras corretas por especialidade — NEUROLOGIA, PSIQUIATRIA e NEUROPSIQUIATRIA são todas **R$ 80 dinheiro / R$ 95 cartão/PIX**.

Só que existe também uma regra específica **por procedimento** ("CONSULTA 2", id `7a952666…`) gravada em 17/07 com **R$ 80 dinheiro / R$ 80 cartão/PIX**. Como o motor de regras dá prioridade máxima a regras por procedimento (procedimento vale +100, especialidade vale +10), essa regra vence as três de especialidade e a agenda cobra R$ 80 no cartão em vez de R$ 95.

Isso acontece "constantemente" porque:
1. O formulário de "Nova regra" (aba **Regras de Preço** do convênio) começa com o campo **Valor cartão/PIX** zerado, independente do dinheiro.
2. Quando o operador digita só o valor em dinheiro (R$ 80) e esquece do cartão, o sistema salva silenciosamente `valor_cartao = valor` (ou 0), sobrescrevendo o valor correto que vinha da regra por especialidade.
3. Toda vez que alguém cadastra uma regra específica por procedimento sem preencher os dois campos, o benefício do cartão some para aquele serviço.

Vale para as 3 clínicas (POLICLINICA MENINO JESUS, POLICLINICA SÃO FRANCISCO DE PAULA, POLICLINICA JAMPEL) conforme confirmado.

## O que vou fazer

### 1. Corrigir a regra do André agora (dados)
Atualizar a regra `7a952666…` (CONSULTA 2, CARTÃO CONSULTA + SEGUROS, POLICLINICA MENINO JESUS) para `valor_cartao = 95`. A próxima cobrança do André com cartão/PIX volta a sair R$ 95.

### 2. Auditar as 3 clínicas
Listar todas as regras `cb_convenio_regras` **por procedimento** (procedimento_id preenchido, modo `valor_fixo`, ativo) onde `valor_cartao` está igual ao dinheiro ou é 0, **e** existe uma regra por especialidade do mesmo convênio para aquele procedimento com `valor_cartao` diferente. Para cada uma:
- se `valor_cartao` está igual ao dinheiro por descuido → subir para o valor cartão da regra de especialidade;
- se `valor_cartao = 0` mas dinheiro > 0 → mesmo tratamento (não confundir com regras de gratuidade, que têm `gratuito = true`);
- gerar um relatório do que foi ajustado por clínica/convênio/procedimento antes de aplicar.

Nenhum contrato ativo é alterado, só a tabela de regras.

### 3. Consertar o formulário para não voltar a acontecer
Nas 3 clínicas, ajustar `src/components/cartao-beneficios/regras-tab.tsx` (diálogo **Nova regra / Editar regra**):

- Ao selecionar um **procedimento** (regra específica), consultar a regra por especialidade daquele convênio para o procedimento e:
  - pré-preencher **Valor cartão/PIX** com o valor cartão da especialidade (não com o dinheiro);
  - mostrar uma dica: *"A regra por especialidade cadastrada é R$ X dinheiro / R$ Y cartão. Ajuste se necessário."*
- Se o operador salvar com **Valor cartão/PIX = Valor dinheiro** enquanto existir regra por especialidade divergente, exibir um alerta de confirmação: *"Você está sobrescrevendo o valor cartão do convênio (R$ Y) para R$ X. Confirmar?"* — com opção de cancelar.
- Deixar claro no cabeçalho do dialog que uma regra por procedimento **substitui** a regra por especialidade, para não pegar o operador de surpresa.

### 4. Validação
- Consultar novamente a regra no banco depois do UPDATE para confirmar `valor_cartao = 95`.
- Explicar como testar na tela: abrir agenda → paciente André → cobrar → o modal deve mostrar Dinheiro R$ 80, PIX/Débito/Crédito R$ 95.
- Rodar `tsgo` no arquivo alterado para garantir que nada quebrou.

## Detalhes técnicos
- Tabela: `cb_convenio_regras` (campos `valor`, `valor_cartao`, `procedimento_id`, `especialidade_id`, `convenio_id`, `modo`, `gratuito`).
- Função de escolha: `findRegra` em `src/lib/cb-regras.ts` — pontua `procedimento_id: 100`, `especialidade_id: 10`, `tipo: 5`, `prioridade * 0.01`.
- A correção de dados é feita via `supabase--insert` (UPDATE); a correção do formulário via edição do componente. Auth/RLS/permissões não mudam.

## Fora do escopo
- Não vou mexer em contratos ativos, mensalidades, orçamentos nem histórico já pago.
- Não vou trocar o algoritmo do `findRegra` (mantém prioridade procedimento > especialidade — o que está errado é o dado gravado, não a lógica).
