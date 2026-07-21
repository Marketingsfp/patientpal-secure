## Objetivo
No editor do convênio **FUNCIONARIO** (usado só para descontos de funcionários), esconder as abas que não fazem sentido para esse caso e manter apenas o essencial. As telas gerais de **Benefícios (regras)** e **Dependentes** continuam funcionando normalmente.

## Suposição a confirmar
No print, a aba de preços chama-se **"Faixas de Preço"** (não existe uma aba com o nome "Faixa etária" nesse editor). Vou assumir que é essa a aba a ocultar. Se você quis dizer outra, me avise.

## Escopo
Arquivo único: `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`.

Quando o convênio em edição for o **FUNCIONARIO** (identificado pelo `nome` do convênio, case-insensitive, para valer nas 3 clínicas sem precisar de flag):

- Ocultar os `TabsTrigger` e respectivos `TabsContent` de:
  - Faixas de Preço
  - Contrato
  - Informativo
  - Termo de Inclusão
- Manter visíveis:
  - **Informações** (nome, descrição, taxas, parcelas, vigência, fidelidade, máx. dependentes)
  - **Benefícios** (regras de desconto por especialidade / categoria / serviço)
- Aba padrão ao abrir passa a ser **Informações**.
- No `salvar()`, pular a validação de faixas quando for FUNCIONARIO e persistir uma faixa mínima automática (1 vida, R$ 0) para não quebrar o schema atual da tabela.
- Não mexer em nada fora desse arquivo. **Dependentes** e as regras de **Benefícios** continuam funcionando exatamente como hoje — são telas separadas.

## Fora do escopo
- Alterar o schema do banco.
- Mudar comportamento de outros convênios.
- Mexer na aba **Dependentes** do menu principal ou na tela de **Vendas**.

## Erro de build reportado
Foi uma falha transitória de upload S3 do preview (`InternalError` do S3, não erro de código). Nada a corrigir no código; o próximo build normaliza sozinho.

## Clínica-alvo
A regra de esconder abas vale para o convênio **FUNCIONARIO** em qualquer clínica (SFP, Menino Jesus e Ergoclínica), já que criamos ele nas 3. Confirma?
