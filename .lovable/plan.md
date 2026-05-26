## Problema

O `RichEditor` (abas Contrato, Informativo, Termo de Inclusão) já tem o botão **Cortar imagem** (ícone tesoura) e o `ImageCropDialog` implementados. Mas no print enviado pelo usuário a imagem está visivelmente selecionada (com handles nos 4 cantos) e mesmo assim o botão não aparece — só ficam visíveis ícones de inserir/excluir/link.

Causa: a linha de controles da imagem na toolbar (alinhar L/C/R, **Cortar**, Select de largura) está envolvida por `{editor.isActive("image") && (...)}`. Como a imagem agora é **inline** e o NodeView usa `<span>` + `data-drag-handle`, clicar na imagem nem sempre cria uma `NodeSelection` no ProseMirror — às vezes vira só uma `TextSelection` adjacente. O `selected` interno do NodeView às vezes vira `true` por hover/drag-handle e desenha os handles, mas `editor.isActive("image")` permanece `false`, então a toolbar não mostra o botão Cortar.

## Mudanças (apenas em `src/components/cartao-beneficios/rich-editor.tsx`)

1. **Forçar NodeSelection ao clicar na imagem.** No `ImageNodeView`, adicionar `onMouseDown` no `<img>` que chama `editor.commands.setNodeSelection(getPos())` antes do ProseMirror tratar o clique. Isso garante que toda imagem clicada vire uma `NodeSelection`, o que faz `editor.isActive("image")` retornar `true` de forma confiável.

2. **Tornar a linha de controles da imagem sempre visível** (em vez de só quando `isActive("image")`), com cada botão `disabled={!editor.isActive("image")}`. Assim o usuário enxerga o botão **Cortar** mesmo antes de clicar e entende que precisa selecionar a imagem; e quando seleciona, o botão habilita imediatamente. Aplicar o mesmo aos botões de alinhar (L/C/R) e ao `Select` de largura.

3. **Fallback do botão Cortar.** Se por algum motivo `editor.getAttributes("image").src` voltar vazio no clique, manter um `toast.info("Clique na imagem que deseja cortar e tente novamente.")` em vez de simplesmente não fazer nada (hoje sai silenciosamente com `return`).

Nenhuma alteração em `image-crop-dialog.tsx`, CSS ou outras abas — todas as três abas (Contrato, Informativo, Termo de Inclusão) usam o mesmo `RichEditor` e passam a ter o corte funcionando.

## Resultado

- O botão **Cortar imagem** aparece sempre na toolbar (desabilitado quando nenhuma imagem está selecionada).
- Clicar em qualquer imagem do editor seleciona-a de forma confiável, habilita os controles de alinhamento, largura e corte, e abre o `ImageCropDialog` ao clicar em Cortar.
- Funciona nas três abas sem mexer em mais nada.
