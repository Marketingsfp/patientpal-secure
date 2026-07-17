## Ajustes de layout do formulário de contrato

Reorganizar os campos do formulário de contrato (usado tanto na venda de novo contrato quanto na edição de contratos existentes) em duas linhas agrupadas.

### Linha 1 (4 colunas)
- Convênio
- Nº de pessoas no contrato
- Valor mensal
- Taxa de adesão

### Linha 2 (3 colunas)
- Data início
- Data término
- Dia de vencimento

### Onde aplicar
- `src/components/pages/contratos-page.tsx` — tanto no bloco "Novo contrato" quanto no bloco de edição de contrato existente (aba Dados).

### Detalhes técnicos
- Substituir os grids atuais (`grid-cols-1 md:grid-cols-2`) por:
  - Linha 1: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`
  - Linha 2: `grid grid-cols-1 md:grid-cols-3 gap-4`
- Manter o campo "Paciente titular" + checkbox "Apenas titular financeiro" como está (linha própria já ajustada anteriormente).
- Preservar labels, helpers (`O valor mensal é definido...`, `Calculada automaticamente...`, `Definido pela faixa...`, `Cobrança única...`), validações e handlers.
- Sem mudança de lógica/estado; apenas reorganização visual (frontend/apresentação).

### Validação
- `tsgo --noEmit` sem erros.
- Verificar responsividade: em telas menores as colunas colapsam para 1 coluna; em `md` intermediário Linha 1 fica em 2 colunas.
