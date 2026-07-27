## Objetivo

Unificar as telas duplicadas do Cartão Benefícios: a aba **Modelos** deixa de existir e tudo passa a ser feito em **Convênios > Informações**. Aplicação **global (3 clínicas)**.

## Situação atual (verificada)

- **Modelos** grava em `planos_assinatura`; **Convênios** grava em `cb_convenios`.
- `cb_convenios` já é superconjunto: nome, descrição, valor mensal, taxa de adesão, parcelas, máx. dependentes, fidelidade, vigência, modelo de contrato, informativo, termo de inclusão, taxa de inclusão de dependente, acréscimo cartão/pix e **modalidade** (equivale ao "tipo" de Modelos).
- Único campo exclusivo de Modelos é **"Máx. agregados"**, que não é lido em nenhum outro ponto do sistema.
- **1.623 contratos** apontam para um plano, e **todos eles** também já apontam para um convênio. Nenhum contrato tem plano sem convênio.
- Contratos novos criados pela tela de Vendas já não gravam plano; só o Pagamento Avulso ainda grava.

## Escopo

### 1. Migrar as leituras de "plano" para "convênio"
Passar a ler nome/tipo/vigência de `cb_convenios` pelo convênio do contrato:

- Impressão do contrato, do carnê, da GR (3 pontos) e do cartão do paciente
- Regra de limite de dependentes
- Lista de Clientes (coluna do plano) e ficha do cliente
- Relatórios gerais e Relatórios BI do Cartão
- Consulta da Nina
- Pagamento Avulso: passa a trabalhar com convênio e deixa de gravar plano

### 2. Remover as telas duplicadas
- Excluir a aba **Modelos** e a página `/app/cartao-beneficios/modelos` (redireciona para Convênios, para não quebrar links salvos).
- Remover **"Planos / Convênios"** do menu Cadastros e a página `/app/planos` (mesmo redirecionamento).
- Remover o componente da tela de planos e o atalho de busca que apontava para ela.

### 3. Convênios > Informações
Nenhum campo novo é necessário. Apenas ajuste de rótulo deixando claro que ali se define o modelo do convênio. "Máx. agregados" é descontinuado por não ter uso.

### 4. Banco de dados — exclusão definitiva (autorizada)

Como você autorizou excluir, faremos em **duas etapas separadas e aprovadas uma por vez**, para não perder histórico por engano:

**Etapa A — antes de excluir (obrigatória):**
1. Conferir novamente, no momento da execução, que **nenhum** contrato tem plano sem convênio. Se aparecer algum, ele é corrigido/apontado antes de seguir.
2. Copiar o conteúdo atual de `planos_assinatura` para uma tabela de arquivo morto (`planos_assinatura_arquivo`), somente leitura, apenas para consulta histórica.
3. Exportar também um CSV do conteúdo para você guardar fora do sistema.

**Etapa B — exclusão:**
4. Remover a ligação de plano nos contratos (a coluna `plano_id` de `contratos_assinatura`), já que 100% dos contratos têm convênio.
5. Excluir a tabela `planos_assinatura`.

Nenhum valor de Cartão Consulta é tocado (Regra 1.11). A Etapa B só roda depois que a Etapa A e as validações da seção seguinte estiverem OK.

## Riscos e cuidados

- Área crítica: impressão de contrato, carnê, GR e cartão do paciente. A mudança é de **origem do nome/tipo**, não de valores financeiros.
- A exclusão é destrutiva e só é reversível pela tabela de arquivo morto e pelo CSV da Etapa A — por isso ela é feita depois, em migração separada.

## Validação (entre a Etapa A e a Etapa B)

- Imprimir contrato, carnê, GR e cartão de um contrato antigo e de um recente, e conferir nome/tipo em ambos.
- Conferir a coluna de plano na lista de Clientes e na ficha do cliente.
- Conferir Relatórios BI do Cartão e o relatório geral de contratos.
- Fazer um Pagamento Avulso de teste e conferir o vínculo com o convênio.
- Conferir que `/app/cartao-beneficios/modelos` e `/app/planos` redirecionam sem erro.
