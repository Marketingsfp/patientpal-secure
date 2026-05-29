## Problema

O menu lateral em `src/components/app-shell.tsx` tem **dois containers com scroll vertical aninhados**:

- `<aside>` (linha 375): `h-screen overflow-y-auto flex flex-col`
- `<nav>` interno (linha 406): `flex-1 ... overflow-y-auto`

Como o `<nav>` é `flex-1` dentro do `<aside>` que já rola, o conteúdo nunca "transborda" no nav — em vez disso o aside cresce e rola. Isso faz a roda do mouse ora prender no scroller errado, ora não responder, dando a sensação de barra travada. Soma-se a isso o `useEffect` que ajusta `navRoot.scrollTop` automaticamente ao trocar de rota, o que com dois scrollers acaba "puxando" o menu de volta.

## Correção

No arquivo `src/components/app-shell.tsx`, linha 375, remover `overflow-y-auto` do `<aside>` para que apenas o `<nav>` interno seja o container de rolagem (padrão correto para sidebar com header fixo + nav rolante).

Antes:
```tsx
className={`${collapsed ? "w-16" : "w-64"} transition-all duration-200 shrink-0 text-white h-screen overflow-y-auto flex flex-col`}
```

Depois:
```tsx
className={`${collapsed ? "w-16" : "w-64"} transition-all duration-200 shrink-0 text-white h-screen overflow-hidden flex flex-col`}
```

Com `min-h-0` implícito pelo `flex-1` do nav já correto, o nav passa a ter altura limitada e a rolagem flui normalmente.

## Verificação

- Abrir o app, expandir vários grupos do menu até passar da altura da tela
- Rolar com a roda do mouse dentro do menu — deve rolar suave, sem travar
- Trocar de rota — o item ativo continua sendo trazido para a área visível, sem "pular"
- Testar com menu colapsado e expandido