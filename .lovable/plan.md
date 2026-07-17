## Reorganizar filtros da agenda em 2 linhas

Hoje os 8 filtros ficam numa linha só (`lg:grid-cols-8`), o que aperta demais os campos de texto — principalmente **Profissional** e **Cliente**.

### O que muda

Dividir o grid em duas linhas de 4 colunas cada, mantendo o mesmo card e o mesmo checkbox "Exibir apenas a data selecionada" logo abaixo.

**Linha 1 (4 colunas):**
1. Profissional
2. Tipo
3. Data
4. Cliente

**Linha 2 (4 colunas):**
1. Nº Ficha
2. Situação
3. Especialidade
4. Ações (botão **Exibir** + botão **X** para limpar) — na mesma célula, como já estão hoje

**Abaixo do grid (inalterado):** checkbox "Exibir apenas a data selecionada" alinhado à esquerda com o cabeçalho da tabela.

### Antes / Depois

**Antes:** 1 linha × 8 colunas → cada campo com ~140 px, Cliente e Profissional truncando texto.

**Depois:** 2 linhas × 4 colunas → cada campo com ~280 px, respiro para digitar nome/CPF do paciente e ver o nome completo do profissional.

### Detalhes técnicos

- Arquivo: `src/routes/_authenticated/app.agenda.tsx` (~linha 6450).
- Trocar `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8` por `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (2 colunas em tablet, 4 em desktop; empilha em mobile).
- Reordenar os blocos de filtro dentro do mesmo `<div className="grid …">` para: Profissional → Tipo → Data → Cliente → Nº Ficha → Situação → Especialidade → Ações. Como cada bloco é uma célula do grid, o resultado natural são 2 linhas de 4.
- Nenhuma lógica de negócio muda. Nenhum filtro é adicionado, removido ou renomeado.

### Validação

- Verificar visualmente em desktop (1440 px): 4+4, campos largos.
- Verificar em tablet: 2+2+2+2 (2 colunas).
- Verificar em mobile: empilha um por linha.
- Confirmar que o checkbox "Exibir apenas a data selecionada" continua alinhado com a coluna FICHA da tabela.
