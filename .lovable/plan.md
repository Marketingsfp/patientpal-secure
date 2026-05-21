## 1. Cursor "maozinha" no avatar

Em `src/components/app-shell.tsx`, adicionar `cursor-pointer` à classe do botão `DropdownMenuTrigger` do avatar (e garantir o mesmo em `<Bell>` por consistência opcional — só se o usuário quiser; por padrão só o avatar).

## 2. Cores seguem a clínica selecionada

Hoje a cor da clínica só é usada como `backgroundColor` da sidebar e do avatar. Botões verdes (`Lista`, `Adicionar Encaixe`, `Exibir`, paginação ativa, etc.) usam tokens `--primary` definidos em `src/styles.css` — fixos.

Solução: ao selecionar uma clínica, **sobrescrever as CSS variables `--primary` e `--ring`** do `documentElement` para a cor da clínica. Assim tudo que usa `bg-primary`, `text-primary`, etc. passa a refletir a cor da clínica automaticamente, sem tocar em cada página.

### Implementação em `src/components/app-shell.tsx`

Adicionar `useEffect` que reage a `clinicColor` (já calculado no componente):

```ts
useEffect(() => {
  const root = document.documentElement;
  if (modoTodas || !clinicaAtual) {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--ring");
    root.style.removeProperty("--sidebar-primary");
    return;
  }
  // converter hex -> oklch via color-mix? Mais simples: setar valor hex direto via espaço de cor sRGB.
  root.style.setProperty("--primary", clinicColor);
  root.style.setProperty("--ring", clinicColor);
  root.style.setProperty("--sidebar-primary", clinicColor);
}, [clinicColor, modoTodas, clinicaAtual]);
```

Como o template usa `oklch(...)`, mas o Tailwind/shadcn aceita qualquer valor CSS válido na variável, atribuir um hex (`#15274f`) funciona porque a variável é só substituída em `bg-[var(--primary)]` ou no token `--color-primary: var(--primary)`. Para o `primary-foreground` (texto sobre primary), manter o padrão (branco) — todas as cores das clínicas são escuras o suficiente.

### Sem mudanças

- Outras páginas não precisam ser modificadas.
- Lógica de `useClinica`, rotas e dados intactos.
