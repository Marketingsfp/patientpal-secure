# Health Hub Pro — Design System (HHP)

Fonte oficial da identidade visual do sistema, extraída da Agenda V2 (Fases
A → D). Todo módulo novo (Prontuário V2, Financeiro V2, RH, Inteligência,
CRM V2) deve consumir este padrão em vez de recriar visual próprio.

> Localização técnica:
> - Tokens CSS: `src/styles.css` (bloco `Health Hub Pro — Design System tokens`)
> - Tokens TS + componentes: `src/design-system/hhp/*`
> - Showcase dev (admin-only): rota `/app/dev-hhp`

---

## 1. Princípios

1. **Editorial, não corporativo.** Tipografia Inter Tight nos títulos, cinzas
   com contraste alto, ícones finos e discretos.
2. **Densidade é escolha do usuário.** Sempre expor 3 modos:
   `confortavel` · `compacto` · `foco` — persistidos por usuário e clínica.
3. **Motion sutil.** Transições 120–260 ms com curva `hhp-ease`. Nada de
   spring elástico nem parallax.
4. **Mobile-first.** Cabeçalhos, filtros e KPIs precisam funcionar em 390 px
   sem overflow horizontal.
5. **Um só padrão de atalhos.** `D/C/F` para densidade, `J/K/Enter` para
   navegar, `N` para novo, `Ctrl/⌘+K` para busca, `?` para ajuda.

---

## 2. Tokens

### 2.1 Cores (CSS custom properties)

| Token                    | Uso                                  |
| ------------------------ | ------------------------------------ |
| `--hhp-surface-page`     | Fundo geral da página                |
| `--hhp-surface-panel`    | Sidebar / painéis laterais           |
| `--hhp-surface-card`     | Cards, drawer, dialogs               |
| `--hhp-surface-muted`    | Toolbars segmentadas, backgrounds    |
| `--hhp-border-hair`      | Divisores discretos                  |
| `--hhp-border-subtle`    | Bordas de cards e inputs             |
| `--hhp-text-strong`      | Títulos e valores em destaque        |
| `--hhp-text-body`        | Texto de corpo                       |
| `--hhp-text-muted`       | Texto secundário                     |
| `--hhp-text-hint`        | Eyebrows, placeholders, timestamps   |
| `--hhp-tone-info`        | Estados neutros positivos            |
| `--hhp-tone-ok`          | Sucesso / realizado                  |
| `--hhp-tone-warn`        | Atenção / aguardando                 |
| `--hhp-tone-danger`      | Erro / cancelado / falta             |
| `--hhp-tone-focus`       | Ação em foco / linha do agora        |

### 2.2 Tipografia

- **Display**: `--hhp-font-display` → *Inter Tight* (títulos, KPIs, drawer header).
- **Body**: `--hhp-font-body` → *Inter*.
- **Mono**: `--hhp-font-mono` → SF Mono / JetBrains-like para `<kbd>` e horas.

Escala:

| Nome        | Uso                                   | Tailwind           |
| ----------- | ------------------------------------- | ------------------ |
| Eyebrow     | Rótulos de KPI, meta info             | `text-[10px] uppercase tracking-widest` |
| Caption     | Chips, hints                          | `text-[11px]`      |
| Body-sm     | Texto de tabela / cards               | `text-xs`          |
| Body        | Descrições                            | `text-sm`          |
| H2 módulo   | Título principal da tela              | `text-xl md:text-2xl font-semibold` |
| KPI number  | Valor grande do KpiCard               | `text-3xl font-bold tabular-nums` |

### 2.3 Raios, sombras, motion

- Raios: `--hhp-radius-chip | -control | -card | -card-lg | -drawer`
  (`9999px / 12 / 16 / 24 / 24 px`).
- Sombras: `--hhp-shadow-hair | -card | -lift`.
- Motion: `--hhp-ease` + `--hhp-dur-fast/base/slow`
  (mesma curva do iOS: `cubic-bezier(0.32, 0.72, 0, 1)`).

### 2.4 Densidades

`HHP_DENSITY_GAP` e `HHP_DENSITY_CARD_PAD` em `tokens.ts` traduzem a
densidade escolhida em classes Tailwind. Sempre persistir a preferência em
`hhp:density:{modulo}:{clinicaId}` (localStorage).

---

## 3. Componentes

Todos exportados por `@/design-system/hhp`.

| Componente          | Descrição                                                 |
| ------------------- | --------------------------------------------------------- |
| `HhpChip`           | Chip semântico com tom e dot opcional.                    |
| `HhpKpiCard` + `HhpKpiRow` | Cards de KPI clicáveis; row com scroll horizontal no mobile e grid em ≥ md. |
| `HhpEmptyState`     | Ícone grande de baixo peso + título + descrição + CTA.    |
| `HhpSkeletonCard` / `HhpSkeletonList` | Placeholders proporcionais à densidade.       |
| `HhpDrawer`         | Sheet lateral com defaults (Centro de Atendimento etc.).  |
| `HhpWizardShell`    | Wizard N passos: header + progress + corpo + footer.      |
| `HhpShortcutsDialog`| Painel de atalhos padrão (consome `HHP_SHORTCUTS`).       |
| `HhpPageHeader`     | Cabeçalho editorial + eyebrow + leading + actions.        |
| `HhpToolbar` / `HhpToolbarPill` | Linha de filtros e "pills" de ToggleGroup.     |

---

## 4. Padrões de tela

### 4.1 Estrutura canônica de um módulo

```text
┌ HhpPageHeader (título + eyebrow + actions)
│   └ HhpToolbar (busca + filtros)
│   └ HhpKpiRow (KPIs)
├ Faixa opcional de IA / sugestões (recurso secundário, lazy)
├ Corpo (timeline / lista / grid) — respeita densidade
└ HhpDrawer + HhpWizardShell + HhpShortcutsDialog
```

### 4.2 Atalhos globais (obrigatórios em todo módulo)

| Tecla           | Ação                                          |
| --------------- | --------------------------------------------- |
| `D` `C` `F`     | Densidade confortável / compacto / foco       |
| `J` `K` `Enter` | Item seguinte / anterior / abrir              |
| `Esc`           | Fechar drawer / cancelar wizard               |
| `N`             | Ação primária de "novo" (contexto da tela)    |
| `Ctrl/⌘ + K`   | Focar busca                                   |
| `?`             | Abrir painel de atalhos                       |

### 4.3 Estados

- **Carregando**: `HhpSkeletonList` com mesma densidade da tela.
- **Vazio filtrado**: `HhpEmptyState` com CTA "Limpar filtros".
- **Sem permissão**: bloco central com `Shield` + texto explicativo.
- **Erro**: chip `danger` + botão "Tentar novamente".

---

## 5. Exemplo de uso

```tsx
import {
  HhpPageHeader, HhpToolbar, HhpKpiRow, HhpKpiCard,
  HhpDrawer, HhpEmptyState, HhpShortcutsDialog,
} from "@/design-system/hhp";
import { Users } from "lucide-react";

export function MeuModulo() {
  return (
    <div className="h-full flex flex-col bg-[color:var(--hhp-surface-page)]">
      <HhpPageHeader
        title="Financeiro do Dia"
        eyebrow="06 de julho · terça"
        actions={<button>Novo lançamento</button>}
      >
        <HhpToolbar>{/* busca + filtros */}</HhpToolbar>
        <HhpKpiRow>
          <HhpKpiCard label="Recebido" value={54000} tone="ok" icon={Users} />
          {/* ... */}
        </HhpKpiRow>
      </HhpPageHeader>

      {/* corpo */}
    </div>
  );
}
```

---

## 6. Rollback e adoção

- O HHP é aditivo. Nenhum componente da Agenda V2 (ou clássica) foi
  reescrito nesta fase — a Agenda V2 continua com seus próprios arquivos em
  `src/components/agenda-v2/*` e os novos primitivos vivem em
  `src/design-system/hhp/*`.
- Para "desligar" o HHP: basta remover a pasta `src/design-system/hhp/` e o
  bloco `Health Hub Pro — Design System tokens` de `src/styles.css`. Nada
  fora dessa pasta importa dele por padrão.
- Adoção nos próximos módulos: importar `@/design-system/hhp` e seguir a
  seção 4 (Estrutura canônica). Novos componentes que se repetirem entre
  módulos devem ser promovidos para cá.

---

## 7. Governança

- Toda mudança nos tokens ou primitivos do HHP exige acompanhar a versão
  desta doc.
- Não introduzir cor nova em componente sem antes registrar o token em
  `styles.css`.
- Nunca criar variantes específicas de módulo dentro de `src/design-system/hhp`
  — a pasta é agnóstica a domínio.