## Mudanças

### 1. Remover menu "Modelo de contrato"
Em `src/components/app-shell.tsx`, remover a linha do menu "Modelo de contrato" (`/app/cartao-beneficios/modelos`) do grupo "Cartão Benefícios". O arquivo de rota `app.cartao-beneficios.modelos.tsx` será mantido (não acessível pelo menu) para evitar quebrar links existentes.

### 2. Nova aba "Faixas de Preço" no cadastro de Convênio
No diálogo de cadastro/edição em `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`, organizar o conteúdo em **abas** (componente `Tabs` do shadcn):
- **Informações** — Nome, Taxa de adesão, Nº parcelas, Fidelidade, Vigência, Benefícios, Modelo do contrato, Descrição, Ativo.
- **Faixas de Preço** — nova aba que substitui o bloco atual "Valor mensal por nº de dependentes".

Conteúdo da aba **Faixas de Preço** (conforme a foto):
- Cabeçalho: "Faixas de Preço por Quantidade de Vidas" + subtítulo "Configure o valor mensal conforme a quantidade de vidas (titular + dependentes)".
- Botão "+ Adicionar Faixa".
- Tabela com colunas: **De (pessoas)** | **Até (pessoas)** | **Valor Mensal (R$)** | ação excluir.
  - Campo "Até" vazio = "ou mais" (mostra placeholder ∞).
- Texto de exemplo: "Exemplo: 1 pessoa = R$200, de 2 a 3 = R$350, 4+ = R$500. Deixe 'Até' vazio para indicar 'ou mais'."
- As faixas são salvas junto com o "Salvar" do diálogo (não haverá botão separado "Salvar Faixa" — ficam no mesmo fluxo do convênio).

### 3. Banco de dados
Substituir a tabela atual `cb_convenio_valores` (que guarda valor por nº exato de dependentes) por uma nova tabela de **faixas**:

- Nova tabela `cb_convenio_faixas`:
  - `convenio_id` (FK CASCADE)
  - `vidas_de` (int, >=1)
  - `vidas_ate` (int nullable — null = "ou mais")
  - `valor_mensal` (numeric 10,2)
  - timestamps
  - RLS espelhando `cb_convenios` (membros leem, gestores CRUD)
- Remover (DROP) `cb_convenio_valores` — não está em uso em produção.
- Campo "Máx. dependentes" do convênio será removido do form (a faixa já define o limite).

### 4. Listagem de convênios
A coluna "A partir de" passa a ler o menor `valor_mensal` das faixas do convênio.

### 5. Cálculo de venda
Onde o valor mensal era buscado por nº exato de dependentes, passar a buscar a faixa cuja `vidas_de <= total_vidas AND (vidas_ate IS NULL OR vidas_ate >= total_vidas)`. Será ajustado nos pontos que consomem `cb_convenio_valores` (se houver) durante a implementação.

## Arquivos afetados
- `src/components/app-shell.tsx` — remover item de menu
- `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx` — abas + UI de faixas + load/save
- Nova migration — criar `cb_convenio_faixas`, dropar `cb_convenio_valores`
