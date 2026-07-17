**Classificação:** erro de banco/regra de contrato, com impacto em **contratos, dependentes e financeiro**.

**Problema confirmado:** a função de renovação ainda tenta gravar `clinica_id` na tabela `contrato_dependentes`, mas essa tabela não possui essa coluna. Por isso aparece: `column "clinica_id" of relation "contrato_dependentes" does not exist`.

**Plano de correção:**
1. Recriar as funções de renovação do contrato para inserir dependentes apenas com as colunas reais da tabela `contrato_dependentes`.
2. Revisar as duas rotas do fluxo:
   - renovação mantendo/extensando o contrato atual;
   - renovação com troca de convênio e geração de novo contrato.
3. Manter a lógica já ajustada de faixa de preço: o valor mensal continua vindo da faixa selecionada conforme quantidade de pessoas.
4. Garantir que inclusão/exclusão de dependentes continue atualizando mensalidade, taxa de inclusão e taxa de adesão quando aplicável.
5. Validar com leitura do banco que as funções foram recriadas sem referência a `contrato_dependentes.clinica_id`.

**Fora do escopo:** não vou alterar o layout da tela nem mexer em outros módulos financeiros que não sejam chamados pela renovação.

**Risco:** baixo a moderado, porque mexe em função de contrato/financeiro. A correção será localizada no ponto que está quebrando.