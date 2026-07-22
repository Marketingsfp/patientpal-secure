## Objetivo
Inverter a ordem das abas dentro do detalhe do contrato do Cartão Benefícios: "Dados" passa a ser a primeira aba, "Resumo" a segunda. As demais ("Contrato", "Histórico") permanecem na mesma ordem.

## Escopo
- Somente apresentação (ordem visual das abas).
- Sem mudança de regra de negócio, permissões, dados ou aba padrão de conteúdo.

## Clínica-alvo
Como é apenas mudança visual de ordem de abas (não é regra de negócio nem flag), sugiro aplicar global (todas as clínicas). Confirme se prefere restringir a alguma clínica específica.

## Alteração
- Arquivo: `src/components/pages/contratos-page.tsx` (renderização das abas do detalhe do contrato).
- Trocar a ordem dos `TabsTrigger` e respectivos `TabsContent` para: Dados → Resumo → Contrato → Histórico.
- Manter a aba ativa inicial que já é usada hoje (não alterar `defaultValue`), a menos que você peça para abrir em "Dados" por padrão.

## Validação
- Abrir um contrato e conferir a nova ordem visual das abas.
- Conferir que o conteúdo de cada aba continua correto e que nada mais mudou (botões Trocar convênio, Cancelar contrato, Prontuário, etc.).

Confirma que quer aplicar global e manter a aba inicial atual?