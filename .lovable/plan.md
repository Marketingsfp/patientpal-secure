
## Escopo

Ajustes no diálogo `src/components/odontologia/novo-orcamento-odonto-dialog.tsx` (aplicado nas 3 clínicas — o componente é único e compartilhado).

## Confirmação necessária

- **Clínica-alvo**: presumo aplicar nas **3 clínicas** (Menino Jesus, SFP e Policlínica). Confirmar antes de executar. Se for só uma, envolvo tudo em feature flag por `clinica_id`.

## Mudanças

### 1. Filtro de dentistas (foto 1)
No `useEffect` de carregamento, hoje traz todos os `medicos` da clínica. Passar a filtrar apenas os que atendem em **Odontologia**, consultando `medico_especialidades` (ou equivalente) por `especialidade_id = especialidadeOdontoId`. Se um médico não tiver vínculo com Odontologia, some da lista.

### 2. Seleção de procedimentos por lista suspensa com múltipla escolha (foto 2)
Substituir o campo de busca por digitação por um **combobox multi-select** (padrão shadcn `Command` + `Popover`, igual outros pickers do sistema), listando todos os procedimentos vinculados à Odontologia (`procedimento_especialidades`).
- Permite marcar vários serviços de uma só vez.
- Ao confirmar, todos os selecionados são adicionados aos dentes atualmente selecionados no odontograma, cada um como um item próprio (mesmo comportamento atual do `adicionarProc`, em loop).
- Mantém filtro por texto opcional dentro do combobox para clínicas com muitos procedimentos, mas sem exigir digitação.

### 3. Remover campo de valor editável (foto 3)
Remover a coluna do `CurrencyInput` de `valor_unitario` em cada linha de item. Manter apenas as duas colunas de exibição: **Dinheiro/PIX** e **Cartão**.
- `valor_unitario` continua existindo no state (usado para subtotal, total e salvamento), mas fica fixo com o valor do procedimento — sem edição manual.
- Para procedimentos com `valor_variavel`, manter comportamento atual (toast) mas ainda sem campo editável aqui — se necessário editar, será no fechamento; confirmar essa parte se preferir manter editável só nesses casos.

### 4. Um item por dente (foto 4)
Hoje, ao adicionar um serviço com N dentes selecionados, cria **1 item** com array `dentes: [11, 28]`. Mudar para criar **N itens**, um por dente, cada um com `dentes: [d]`.
- Assim, na listagem "Serviços incluídos", cada dente vira sua própria linha, com seu procedimento, quantidade, valores e subtotal independentes.
- Aplica-se tanto na seleção múltipla de procedimentos quanto quando o usuário adiciona um único procedimento em vários dentes.
- Item manual segue igual (sem dente ou com os selecionados; se múltiplos, também vira 1 item por dente para consistência).

## Fora de escopo

- Nenhuma mudança em schema, RLS, RPCs ou lógica de salvamento/impressão. `orcamento_itens.dentes` continua aceitando array; apenas o formato passa a ser sempre `[um_dente]` quando vindo do odontograma.
- Sem mexer no odontograma em si, cabeçalho, desconto, validade, total, observações ou botão salvar.

## Detalhes técnicos

- Arquivo único: `src/components/odontologia/novo-orcamento-odonto-dialog.tsx`.
- Novo componente inline ou reutilizar `Command`/`Popover` já usados em outros pickers (verificar `patient-search-input.tsx` / `cid10-picker.tsx` como referência de padrão do projeto).
- Query de médicos: `medicos` join `medico_especialidades` por `especialidade_id = especialidadeOdontoId` e `clinica_id`. Confirmar nome exato da tabela de vínculo médico↔especialidade na primeira leitura em build mode.
- Query de procedimentos: já existe cache `procIdsOdonto` — usar para popular a lista completa (buscar `nome` de todos os IDs, sem depender de texto digitado).
