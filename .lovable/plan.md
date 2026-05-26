## Objetivo

No `RichEditor` (abas Contrato, Informativo, Termo de Inclusão), reproduzir o comportamento do Word mostrado no vídeo: inserir várias imagens lado a lado ou uma embaixo da outra, redimensionar mantendo proporção e cortar.

Hoje já temos: seleção visual da imagem, alinhar esquerda/centro/direita (float), redimensionar por largura (handle no canto), Select de largura na toolbar e diálogo de corte (`image-crop-dialog.tsx`). Faltam basicamente duas coisas que o vídeo mostra:

1. Colocar **várias imagens no mesmo parágrafo** (lado a lado) ou em parágrafos seguidos (empilhadas).
2. Redimensionar **proporcionalmente** a partir dos cantos, como no Word.

## Mudanças

### 1. Imagem inline por padrão (`rich-editor.tsx`)

- Trocar `ResizableImage.configure({ inline: false, ... })` por `inline: true` e atualizar o `extend` (`inline: true`, `group: "inline"`).
- Resultado: duas imagens digitadas/inseridas em sequência ficam **lado a lado** no mesmo parágrafo, exatamente como o Word inline. Para empilhar, basta `Enter` entre elas.
- Compatibilidade: o NodeView já usa `<span>` (`as="span"`), então o HTML continua válido inline. Conteúdo antigo (imagens em parágrafo próprio) continua renderizando — vira inline dentro do `<p>`, sem quebra visual.

### 2. Upload de várias imagens de uma vez

- O `<input type="file">` atual aceita um arquivo. Adicionar `multiple` e, no handler, fazer upload em sequência e inserir cada uma com `editor.chain().focus().setImage({ src }).run()` na mesma posição → ficam lado a lado automaticamente (porque a imagem agora é inline).

### 3. Redimensionar com proporção (cantos)

No `ImageNodeView`:
- Substituir o único handle do canto inferior-direito por 4 handles (`nw`, `ne`, `sw`, `se`) — visíveis só quando selecionada.
- Capturar `naturalWidth/naturalHeight` no `pointerdown` para calcular a razão.
- Por padrão **manter proporção** (atualiza `width` em px; altura segue via `height: auto` no CSS). Se o usuário segurar `Alt`, libera distorção (não é o caso do Word, mas é útil).
- Manter o atual handle inferior-direito como um dos quatro cantos.

### 4. Estilos (`src/styles.css`)

- Adicionar `.rt-img-handle-nw/.ne/.sw/.se` posicionando cada canto com o cursor correto (`nwse-resize` / `nesw-resize`).
- Pequeno espaçamento horizontal entre imagens inline: `.rt-img-wrap + .rt-img-wrap { margin-left: 4px; }` para que duas imagens lado a lado não fiquem coladas.
- Garantir que `.rt-editor p` permita `display: inline-block` das imagens (já permite, é o default).

### 5. Toolbar — pequenos ajustes

- Manter os controles atuais (alinhar L/C/R, Select de largura, botão Cortar) — já cobrem o que o vídeo mostra.
- O botão "Inserir imagem" agora suporta múltiplos arquivos.

### 6. Corte — sem mudanças funcionais

O `ImageCropDialog` já existe e funciona; só verificar que continua disparando com a imagem selecionada após a mudança para inline (o `editor.getAttributes("image").src` continua válido).

## Resultado

- Usuário clica em "Inserir imagem", seleciona 2+ arquivos → aparecem lado a lado no editor.
- Para empilhar: pressiona Enter entre elas (ou usa alinhar centro/esquerda como já funciona).
- Arrasta qualquer canto da imagem selecionada para redimensionar mantendo a proporção.
- Corta pelo botão "Cortar imagem" (já existente).
- Funciona nas três abas (Contrato, Informativo, Termo de Inclusão) porque todas usam o mesmo `RichEditor`.

## Arquivos tocados
- `src/components/cartao-beneficios/rich-editor.tsx` (inline:true, handles dos 4 cantos, upload múltiplo)
- `src/styles.css` (estilos dos 4 handles + gap entre imagens inline)
