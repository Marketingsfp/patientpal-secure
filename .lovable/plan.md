## Problema

Nas telas de edição do convênio de funcionário, as abas "Faixas de Preço", "Contrato", "Informativo" e "Termo de Inclusão" continuam visíveis.

**Causa raiz:** a verificação em `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx` compara o nome exatamente com `"FUNCIONARIO"` (`nome.trim().toUpperCase() === "FUNCIONARIO"`). Na Menino Jesus (e provavelmente nas outras clínicas) o convênio foi cadastrado como **"CONVÊNIO FUNCIONARIO"**, então a condição nunca é verdadeira e as abas continuam sendo exibidas.

## Escopo da correção

Ajustar apenas o front-end do editor de convênios (nenhuma mudança de banco, regra ou outras telas).

## Clínica-alvo

Regra técnica de detecção do convênio de funcionário — proponho aplicar **globalmente** (SFP, Menino Jesus e Ergoclínica), já que o convênio "FUNCIONARIO" existe nas três clínicas e o comportamento esperado é o mesmo. Confirme se prefere restringir a uma clínica específica.

## O que vou alterar

Em `app.cartao-beneficios.convenios.tsx`:

1. Extrair um helper local `isConvenioFuncionario(nome)` que retorne `true` quando o nome (após `trim().toUpperCase()`) **contiver** a palavra `FUNCIONARIO` (cobre "FUNCIONARIO", "CONVÊNIO FUNCIONARIO", "CONVENIO FUNCIONARIOS" etc.).
2. Substituir as 3 ocorrências atuais da comparação estrita (linhas ~370, 561, 565) por esse helper, tanto na renderização das abas quanto na validação de faixas ao salvar.
3. Manter o comportamento automático já existente (faixa padrão 1 vida R$ 0, sem carência).

## Validação

- Abrir o convênio "CONVÊNIO FUNCIONARIO" na Menino Jesus: só devem aparecer as abas **Informações** e **Benefícios**.
- Repetir na SFP e Ergoclínica.
- Abrir um convênio comum (ex.: "Cartão Consulta") e confirmar que todas as abas continuam visíveis.
- Salvar o convênio de funcionário e confirmar que não pede faixa de preço nem contrato.

## Pendências / riscos

- Se algum dia existir um convênio legítimo com a palavra "FUNCIONARIO" no nome mas que deva ter contrato/faixas, o helper esconderá as abas. Se isso for uma preocupação, podemos evoluir depois para uma flag `tipo = 'funcionario'` na tabela `convenios` — não faço isso agora para manter o escopo pequeno.