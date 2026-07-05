# A7 — Menu Inteligente + Navegação Moderna

Feature flag: `menu_v2` em `profiles.preferencias_ui.flags`. Sem alterar o menu antigo — os dois convivem, alternáveis por usuário.

---

## 1. Estrutura do novo menu

Sidebar colapsável (usa `SidebarProvider`), 3 zonas verticais:

```
┌─ Topo ────────────────┐
│ Logo + nome clínica   │
│ Universal Search pill │  (reaproveita UB do A2)
├─ Zona 1: Fixados ─────┤
│ ★ Agenda              │
│ ★ Caixa               │
│ ★ Orçamentos          │
├─ Zona 2: Centros Op. ─┤
│ ▸ Atendimento         │
│ ▸ Financeiro          │
│ ▸ Cartão de Benefícios│
│ ▸ Clínico             │
│ ▸ Gestão              │
│ ▸ Configurações       │
├─ Zona 3: Dinâmico ────┤
│ Recentes (últ. 5)     │
│ Favoritos (do user)   │
└───────────────────────┘
```

Estética: densidade compacta (36px linha), ícones lucide 16px, `text-sm`, `rounded-md`, hover `bg-sidebar-accent`, ativo com `border-l-2 border-primary` + `bg-sidebar-accent`. Grupos com chevron animado. Transições 150ms. Modo collapsed = só ícones com tooltip.

## 2. Fixados

- Definidos por padrão do perfil (ver §6) — 3 a 5 itens.
- Usuário pode fixar/desfixar via ícone ★ em qualquer item do menu ou via "Ver todos".
- Persistidos em `preferencias_ui.menu.pinned: string[]` (route paths).
- Sempre visíveis no topo, sem grupo colapsável.

## 3. Recentes

- Últimas 5 rotas visitadas distintas, excluindo Fixados e a rota atual.
- Registrado client-side em subscriber do `router` (evento `onResolved`).
- Persistido em `preferencias_ui.menu.recent: {path, label, ts}[]` (debounce 2s, gravação upsert em `profiles`).
- LRU cap 20 em memória, exibe 5.
- Ignora rotas efêmeras (`/auth`, `/app/dev-*`).

## 4. Favoritos

- Ação explícita do usuário (♥ no header de cada tela + no "Ver todos").
- Persistidos em `preferencias_ui.menu.favorites: string[]`.
- Exibidos abaixo de Recentes, ordenados por adição.
- Sem limite rígido (soft cap 15, warning acima).

## 5. "Ver todos" por Centros Operacionais

- Cada Centro Operacional é um `SidebarGroup` colapsável mostrando **até 6 itens principais** + link "Ver todos →".
- "Ver todos" abre `Sheet` lateral (drawer) com:
  - Todos os itens do centro (filtrados por permissão).
  - Busca local por nome.
  - Estrela para fixar/desfixar, coração para favoritar.
  - Agrupamento visual por subcategoria.
- Estado do grupo (aberto/fechado) persistido em `preferencias_ui.menu.groups: Record<string, boolean>`.

## 6. Separação por perfil

Fixados padrão + Centros visíveis (permissão via `has_role` + `perfil_permissoes`):

| Perfil | Fixados padrão | Centros visíveis |
|---|---|---|
| **recepcao** | Agenda, Caixa, Clientes, Orçamentos | Atendimento, Financeiro (limitado), Cartão de Benefícios |
| **medico** | Agenda, Prontuário, Meus Pacientes | Atendimento, Clínico |
| **caixa** | Caixa, Boletos, NFS-e | Financeiro, Atendimento (leitura) |
| **financeiro** | Lançamentos, Contas, Relatórios Fin. | Financeiro, Gestão (relatórios) |
| **gestor** | Dashboard, Relatórios, Agenda | Todos (leitura ampla) |
| **admin** | Dashboard, Configurações, Usuários | Todos + Configurações |

Perfil detectado via `user_roles` (fonte única) + `clinica_memberships.perfil_id`.

## 7. Uso de `profiles.preferencias_ui`

Namespace novo `menu` dentro do JSONB existente (aditivo, não quebra flags atuais):

```json
{
  "flags": { "ub_v1": true, "menu_v2": true },
  "menu": {
    "pinned": ["/app/agenda", "/app/caixa"],
    "favorites": ["/app/relatorios/financeiro"],
    "recent": [{"path":"/app/clientes","label":"Clientes","ts":1730000000}],
    "groups": { "atendimento": true, "financeiro": false },
    "collapsed": false
  }
}
```

Escrita: hook `use-menu-prefs` com debounce 2s, upsert único em `profiles.preferencias_ui` via merge JSONB no servidor (`jsonb_set`).

## 8. Feature flag

- Chave: `preferencias_ui.flags.menu_v2` (boolean).
- Default: **off** para todos.
- Piloto: ativar manualmente para admin/gestor de 1 clínica.
- Sidebar renderiza `<MenuV2 />` se flag on, senão mantém `<AppSidebar />` atual **intocado**.
- Toggle em `/app/configuracoes/preferencias` + evento `menu:flag-changed` (mesmo padrão do `ub:flag-changed`) para trocar sem reload.
- Kill-switch: usuário ou admin desliga → volta ao menu antigo imediatamente.

## 9. Nomenclatura

Zero ocorrência de "Convênio(s)" em labels, tooltips, grupos ou rotas novas. Vocabulário oficial:

- **Cartão de Benefícios** (centro operacional)
- **Regras do Cartão**
- **Associados**
- **Empresas Associadas**
- **Contratos** (não "contratos de convênio")

Lint de string: teste Playwright verifica ausência da palavra no DOM da sidebar em todos os perfis.

## 10. Telas por Centro Operacional

**Atendimento**
Agenda · Clientes · Prontuários · Anamneses · Triagem Enfermagem · Chat interno · WhatsApp

**Financeiro**
Caixa · Boletos · NFS-e · Lançamentos · Contas · Categorias · Splits · Estornos · Relatórios Financeiros

**Cartão de Benefícios**
Contratos · Mensalidades · Dependentes · Regras do Cartão · Faixas · Associados · Empresas Associadas · Benefícios

**Clínico**
Procedimentos · Exames · Modelos de Prontuário · Modelos de Anamnese · Odontograma · Médicos · Especialidades · Escalas

**Gestão**
Dashboard · Relatórios · CRM · Marketing · Campanhas · LGPD · Auditoria · Estoque

**Configurações**
Clínica · Unidades · Usuários · Perfis & Permissões · Cargos · Setores · RH · Integrações · Preferências

## 11. Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Usuário perde item que usava | Média | Médio | Menu antigo permanece 1 clique atrás da flag; Recentes cobre o gap |
| Escrita excessiva em `profiles` | Média | Baixo | Debounce 2s + merge JSONB no servidor |
| Permissão inconsistente | Baixa | Alto | Filtro via `has_role` + `perfil_permissoes` no client E teste Playwright por perfil |
| Regressão visual do header (A2) | Baixa | Médio | Sidebar isolada, não toca `AppShell` header |
| Sidebar quebrar em mobile | Média | Médio | Usa `Sheet` do shadcn no breakpoint `<md` |

## 12. Rollback

1. **Instantâneo (usuário)**: desligar `menu_v2` em Preferências → volta ao menu antigo sem reload.
2. **Por clínica**: SQL `UPDATE profiles SET preferencias_ui = jsonb_set(preferencias_ui,'{flags,menu_v2}','false') WHERE clinica_id = X`.
3. **Global**: default já é off; basta não promover. Se promovido, mesmo SQL sem WHERE.
4. **Código**: componente `<MenuV2 />` isolado em `src/components/menu-v2/`; remoção do import em `AppSidebar` desliga em build. Migração não altera schema (apenas usa JSONB existente) — nada a reverter no DB.

## 13. Testes Playwright

Rota de teste segura: `/app/dev-menu-shell` (espelha `dev-list-shell`, isolada). Bateria por perfil:

**Por perfil** (recepcao, medico, caixa, financeiro, gestor, admin):
- Login → abrir `/app/dev-menu-shell` → screenshot sidebar.
- Verificar fixados padrão presentes.
- Verificar centros visíveis == esperado do perfil.
- Verificar que centros não permitidos **não aparecem**.
- Buscar "convênio" no DOM da sidebar → deve ser 0.

**Interações**:
- Fixar/desfixar item → recarregar → estado persistiu.
- Favoritar → aparece em Favoritos → desfavoritar → some.
- Navegar 3 rotas → Recentes mostra as 3 na ordem.
- Abrir "Ver todos" de um centro → busca local funciona → fixar dali.
- Colapsar sidebar → ícones visíveis, tooltip aparece.
- Toggle `menu_v2` off → menu antigo volta sem reload.
- Mobile viewport (390×844) → Sheet abre/fecha corretamente.

**Performance**:
- Tempo de render inicial da sidebar < 100ms.
- Debounce de escrita: 5 cliques em 1s = 1 request após 2s.

**Regressão**:
- Header A2 (UB) continua funcional com `menu_v2` on.
- Rota `/app/agenda` (produção) não muda visualmente.

---

Depois do menu aprovado e estável, seguimos para **redução de paginação em Caixa, Orçamentos e Clientes** (A8) — infinite scroll ou "carregar mais" com virtualização.

Aguardo aprovação para implementar A7 fase 1 em `/app/dev-menu-shell` atrás da flag `menu_v2`.
