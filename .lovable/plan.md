## Objetivo
Refazer o layout do pop-up "Novo orçamento — Odontologia" (`src/components/odontologia/novo-orcamento-odonto-dialog.tsx`) para que o **odontograma seja o elemento principal**: o profissional clica nos dentes para incluir o serviço, e os itens vão sendo listados na parte de baixo já com os valores por forma de pagamento.

Aplica-se às **3 clínicas** (mudança de UI, sem regra de negócio nova).

## Como vai ficar o pop-up (de cima para baixo)

1. **Cabeçalho compacto** — Paciente / Telefone / **Dentista** (mantidos).
2. **Odontograma interativo** (novo — ocupa o topo do modal)
   - Reusa `OdontogramaClinico` em modo "seleção" (todas as faces neutras).
   - Clicar em um dente **alterna a seleção** (destaque azul, sem alterar estado clínico).
   - Botões acima: `Selecionar arcada superior` · `Selecionar inferior` · `Limpar seleção`.
   - Contador: "3 dentes selecionados".
   - Ao lado, botão primário **"+ Adicionar serviço aos dentes selecionados"** (habilita quando ≥ 1 dente marcado) → abre a busca de procedimento.
3. **Busca de procedimento** (aparece inline quando acionada, dois caminhos)
   - **Caminho A — clique único no dente:** clicar num dente que ainda não tem serviço abre direto o campo de busca já com aquele dente pré-selecionado (1 serviço para aquele dente).
   - **Caminho B — múltiplos dentes:** seleciona vários dentes primeiro e depois usa o botão "+ Adicionar serviço" (1 item com todos os dentes).
   - Busca continua restrita à especialidade Odontologia (lógica atual de `procedimento_especialidades` preservada).
   - Também mantém o botão discreto "adicionar item manual" (para itens sem procedimento cadastrado).
4. **Lista de itens incluídos** (parte de baixo, formato de tabela enxuta)
   - Colunas: **Dentes** (chips FDI) · **Serviço** · **Qtd** · **Dinheiro/PIX** · **Cartão** · **Subtotal** · remover.
   - Se o paciente tiver cartão benefício com regra para o serviço, aparece uma linha extra abaixo do item com o valor do convênio (só quando aplicável — silencioso se não houver).
   - Cada item mostra os dentes vinculados; pode editar/remover dentes clicando em um chip.
5. **Rodapé de totais e finais** (mantido, reorganizado em uma linha)
   - **Desconto** · **Validade (dias)** · **Total** (calculado).
   - Bloco **Observações** (mantido).
6. **Rodapé do dialog**: `Cancelar` · `Salvar orçamento` (mantido).

## Preservado
- Estrutura da tabela `orcamentos` / `orcamento_itens` (coluna `dentes` já existe).
- Cálculo de totais por forma, integração com `printOrcamento`, `especialidade_id`, `medico_id`.
- `DentePicker` continua disponível como fallback de edição inline no item.
- Regras de validação (máx 32 dentes por item, desconto ≤ subtotal, etc.).
- Lógica de acréscimo de cartão (`applyAcrescimoCartao`) para convênios que exibam preço.

## Como vou executar
1. Extrair o odontograma em um sub-componente `OdontogramaSelecao` reutilizando `OdontogramaClinico` com modo `readOnly` (sem menu de status; clique = toggle de seleção).
2. Reescrever o layout de `NovoOrcamentoOdontoDialog`:
   - Mover o cabeçalho/dentista para o topo compacto.
   - Inserir o odontograma logo abaixo com barra de ações.
   - Substituir o bloco atual "Adicionar procedimento" pelo fluxo guiado por seleção (caminhos A/B).
   - Trocar a lista atual de itens pelo formato tabela enxuta com preços por forma.
3. Manter a busca/hooks já existentes (`procIdsOdonto`, `adicionarProc`, `valorPorForma`) — mudança é de UX/layout, não de dados.
4. Testar rapidamente na rota `/app/odontologia` → **Prontuário** → paciente com contrato → **Novo orçamento**.

## Fora do escopo
- Prontuário / faces clínicas / evolução / anamnese.
- Estrutura do banco.
- Impressão de orçamento (mantida como está).

## Detalhes técnicos
- Arquivo principal alterado: `src/components/odontologia/novo-orcamento-odonto-dialog.tsx`.
- Possível novo sub-componente inline `SeletorDentes` (não precisa arquivo novo).
- `OdontogramaClinico` já aceita `denteSelecionado` e `onClickFace`; para o modo seleção múltipla vou passar um `estados` fixo neutro e usar `onClickFace` como toggle no set local, ignorando a face.
