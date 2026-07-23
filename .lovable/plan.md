## Escopo

Ajustes visuais/UX em `src/components/odontologia/novo-orcamento-odonto-dialog.tsx` (componente único, vale para as 3 clínicas). Sem mudança de banco, RLS ou lógica de salvamento.

## Confirmação

Presumo aplicar nas 3 clínicas (código compartilhado). Confirmar se deve valer só para uma.

## Mudanças

### 1. Mensagem duplicada de "Nenhum dente selecionado"
Hoje aparece duas vezes:
- uma dentro do próprio `DentePicker` (inline, `dente-picker.tsx` linha 64);
- outra no rodapé do bloco Odontograma no diálogo (linha 363).

Remover o texto do rodapé no diálogo (linha 362-364) — manter só o do `DentePicker`, que já mostra "Nenhum dente selecionado" / "N dente(s)". Assim a informação aparece uma única vez, junto do próprio odontograma.

### 2. Novo item no topo da lista
Hoje `setItens((arr) => [...arr, ...novos])` empurra novos itens no final. Trocar para `setItens((arr) => [...novos, ...arr])` em `adicionarProcsSelecionados` e `adicionarManual`, para que o item mais recente apareça no topo de "Serviços incluídos".

Ajustar também o campo `ordem` no `salvar()` para continuar refletindo a ordem visual (índice atual do array), sem inversão — o que já acontece naturalmente com `.map((_, idx) => ({ ordem: idx }))`.

### 3. Item manual sem exigir dente
Hoje `adicionarManual` só cria linhas para dentes selecionados (ou 1 sem dente se nada estiver selecionado), e o botão fica junto do bloco de dentes. Ajustes:
- O botão "Item manual" passa a **sempre criar uma única linha sem dente**, ignorando a seleção atual do odontograma (a seleção continua preservada para o próximo "Adicionar serviço").
- Manter o botão onde está (ao lado de "Adicionar serviço aos dentes selecionados") — só muda o comportamento.
- A linha manual criada continua editável (descrição, quantidade); como não tem `valores_formas`, as colunas Dinheiro/PIX e Cartão mostram o `valor_unitario` (0 até o usuário editar). Para permitir digitar valor no item manual, reintroduzir um pequeno `CurrencyInput` de `valor_unitario` **apenas quando `procedimento_id` for null** (item manual). Itens vindos de procedimento seguem sem campo editável, como pediu antes.

## Fora de escopo

- Odontograma em si, cabeçalho, formas de pagamento, desconto, validade, total, observações, salvamento e impressão.
- Nenhum ajuste em `dente-picker.tsx` além do que já mostra.

## Detalhes técnicos

- Arquivo único: `src/components/odontologia/novo-orcamento-odonto-dialog.tsx`.
- Remover o `<span>` de "Nenhum dente selecionado" no rodapé do bloco odontograma (linhas 361-364), mantendo os botões à direita.
- `adicionarProcsSelecionados` / `adicionarManual`: prepend em vez de append.
- `adicionarManual`: forçar `dentes = [null]` (1 item sem dente), não usar `selecao`.
- No render da lista de itens, quando `it.procedimento_id == null`, mostrar `CurrencyInput` no lugar dos dois blocos fixos Dinheiro/PIX e Cartão (ou como coluna extra) para permitir preço manual.
