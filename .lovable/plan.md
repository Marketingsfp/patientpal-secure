## Problema observado

Na tela **Clientes** (`/app/clientes`), ao pesquisar "kauan":
1. **Nem todos os pacientes aparecem** — a busca corta o resultado.
2. **Ao rolar para baixo, a tela congela** — não há carregamento de mais itens e a rolagem trava.

## Diagnóstico (confirmado por leitura do código)

Arquivo: `src/routes/_authenticated/app.clientes.index.tsx`

- A função `load()` chama a RPC `buscar_pacientes` com **`_limit: q ? 80 : 120`**. Ou seja, qualquer busca retorna **no máximo 80 registros**, sem paginação e sem aviso ao usuário. Se existirem mais pacientes com "kauan" no nome, eles simplesmente não aparecem.
- Não existe scroll infinito nem botão "Carregar mais": ao rolar, nada acontece porque a lista já está completa (limitada a 80).
- O "congelamento" ao rolar tem uma causa adicional: a cada mudança em `items` (inclusive quando você digita), o `useEffect` roda `createSignedUrls` para **todas** as fotos, o que provoca re-render pesado e trava a rolagem em listas com muitas linhas com foto.

## O que vou ajustar (somente frontend/apresentação)

Escopo mínimo, sem mexer em regra de negócio, RLS, RPC ou dados:

1. **Aumentar o limite e mostrar contagem correta na busca**
   - Elevar `_limit` de busca para um teto seguro (ex.: **500**) — suficiente para os casos reais da clínica sem estourar a resposta.
   - Exibir um aviso discreto acima da tabela quando o resultado atingir o teto: *"Mostrando os primeiros 500 resultados. Refine a busca para ver mais."*

2. **Resolver o travamento da rolagem**
   - Estabilizar o efeito das fotos assinadas: só re-assinar quando o conjunto de `foto_url` realmente mudar (comparação por chave), evitando refazer `createSignedUrls` a cada digitação/re-render.
   - Manter `loading:"lazy"` no `<img>` das linhas para reduzir custo de scroll.

3. **Feedback de "sem mais resultados"**
   - Quando a busca retornar exatamente o teto, sinalizar visualmente para o usuário refinar (nome + sobrenome, CPF, etc.).

## O que NÃO será alterado

- RPC `buscar_pacientes` e qualquer regra de banco.
- Layout, colunas, ações, permissões, exportação.
- Fluxo do V2 (`ClientesShellV2`) — este ajuste é apenas no clássico, que é o que está em uso na tela reportada.

## Validação

- Repetir a busca "kauan" e conferir se todos os pacientes esperados aparecem.
- Rolar a lista de cima até o fim sem travamento.
- Buscar por termos com poucos resultados e por termos amplos (ex.: "silva") para confirmar o aviso de teto quando aplicável.

## Antes × Depois

- **Antes:** busca cortava em 80 resultados sem avisar; rolagem congelava por reprocessamento das fotos.
- **Depois:** busca traz até 500 resultados com aviso quando atinge o teto; rolagem fluida porque as URLs assinadas só são recalculadas quando a lista de fotos muda de fato.

## Pendências / Observações

- Se, na prática, houver pesquisas legítimas com mais de 500 resultados, o próximo passo será introduzir paginação real (scroll infinito) — mas isso é uma mudança maior e só faria sentido após confirmar a necessidade.
