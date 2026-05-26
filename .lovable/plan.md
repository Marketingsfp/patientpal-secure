## Objetivo
No `RichEditor` (abas Contrato, Informativo e Termo de Inclusão), permitir editar imagens depois de inseridas: redimensionar, alinhar (esquerda/centro/direita) e mostrar visualmente quando a imagem está selecionada.

## Mudanças

### 1. Extensão de Image customizada (`src/components/cartao-beneficios/rich-editor.tsx`)
Estender `@tiptap/extension-image` para suportar novos atributos persistidos no HTML:
- `width` (ex.: `"320px"` ou `"50%"`) — renderizado como `style="width:..."`.
- `align` (`left` | `center` | `right`) — renderizado via classes (`rt-img-left/center/right`) que aplicam `float`/`margin: 0 auto`/`display: block`.
- `data-selected` quando o node estiver selecionado (via `NodeView` ou classe condicional) para feedback visual.

Trocar `Image` por `ResizableImage` (NodeView em React) para:
- Mostrar contorno azul + handle no canto inferior direito quando selecionada.
- Arrastar o handle para redimensionar (atualiza `width` em px).
- Manter `handleClickOn` já existente selecionando o node.

### 2. Barra de ferramentas contextual
Quando `editor.isActive("image")` for `true`, mostrar um grupo extra na toolbar (ou logo acima da imagem como bubble menu simples) com:
- Botões de alinhar Esquerda / Centro / Direita (ícones `AlignLeft`, `AlignCenter`, `AlignRight`) — chamam `updateAttributes({ align })`.
- Campo numérico de largura em px + botões rápidos 25% / 50% / 75% / 100% — atualizam `width`.
- Botão "Tamanho original" — limpa `width`.
- Botão excluir (já existe) continua funcionando.

Implementação mais simples: adicionar esses controles inline na toolbar existente, exibidos apenas quando `editor.isActive("image")` — evita adicionar dependência de BubbleMenu.

### 3. Estilos (`src/styles.css` ou bloco `<style>` no shell do editor)
- `.rt-editor img.rt-img-left { float: left; margin: 0 1rem 0.5rem 0; }`
- `.rt-editor img.rt-img-right { float: right; margin: 0 0 0.5rem 1rem; }`
- `.rt-editor img.rt-img-center { display: block; margin: 0.5rem auto; }`
- `.rt-editor img.ProseMirror-selectednode` → contorno (`outline: 2px solid hsl(var(--primary)); outline-offset: 2px;`) para feedback de seleção.
- Handle de resize: pequeno quadrado no canto inferior direito visível só quando selecionada.

### 4. Compatibilidade
- Conteúdo HTML antigo (imagens sem `width`/`align`) continua renderizando normalmente.
- Persistência: atributos vão direto no HTML salvo no banco — nenhuma mudança de schema.

## Resultado
Usuário clica numa imagem → aparece contorno azul + handle. Pode arrastar o canto para redimensionar, ou usar os botões de alinhamento/largura que surgem na toolbar. Funciona nas três abas porque todas usam o mesmo `RichEditor`.
