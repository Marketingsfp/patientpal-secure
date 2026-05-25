## Submenu "Serviços" em Cadastros

Adicionar um submenu colapsável **Serviços** dentro do grupo **Cadastros** da sidebar (em `src/components/app-shell.tsx`) e mover **Especialidades** e **Procedimentos** para dentro dele.

### Mudanças

**1. Estrutura de dados do menu** (`navRows`)

Trocar os dois itens soltos por um item-pai com `children`:

```text
Cadastros
├── Equipe
├── Serviços                ← novo (colapsável, ícone Stethoscope)
│    ├── Especialidades
│    └── Procedimentos
├── Horários médicos
├── Modelos de Prontuário
├── Perfis
└── Unidades
```

**2. Renderização** (linhas ~353–371)

Estender o `.map` dos itens para suportar `item.children`:
- Se `item.children` existir: renderiza um botão que abre/fecha o submenu (estado local `openSubgroups`), com chevron. Quando aberto, lista os filhos indentados (`pl-8`).
- Sub-item ativo (`location.pathname` casa com `child.to`) mantém o estilo de ativo atual.
- Se qualquer filho estiver ativo, o submenu abre automaticamente (mesmo padrão de `groupHasActive` já usado nos grupos).
- Quando a sidebar está **collapsed** (modo ícone), o submenu mostra só o ícone do pai e expande os filhos automaticamente (mesmo comportamento dos grupos hoje), preservando navegação.

**3. Nada mais muda** — rotas, permissões e demais grupos permanecem iguais.
