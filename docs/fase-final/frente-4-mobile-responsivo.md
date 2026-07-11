# Frente 4 — Responsividade Mobile

**Meta:** deixar 100% das 106 páginas do app usáveis em telas de 375–430 px
(iPhone SE → Pro Max) sem perder nada da versão desktop.

**Padrão escolhido pelo usuário:** tabelas viram **cards empilhados** no mobile.

---

## Fase 1 — Shell universal (✅ ENTREGUE)

Impacto: **todas as 106 páginas** ganham espaço no mobile de uma só vez.

- Sidebar clássica (`app-shell.tsx`) e `MenuV2` ficam ocultos abaixo de `md`
  (`hidden md:flex`).
- Botão hambúrguer aparece no header (`md:hidden`), abre um `Sheet` lateral
  com o menu completo — mesmos grupos, mesmas rotas, respeitando permissões.
- Header enxuto: seletor de clínica com largura reduzida no mobile
  (`w-[120px]`), busca universal continua acessível.
- Nenhum overflow horizontal detectado em 14 rotas testadas em 390 px.

Arquivos alterados:
- `src/components/app-shell.tsx`
- (MenuV2 herda a mesma proteção via wrapper `hidden md:flex`)

---

## Fase 2 — Ferramenta reutilizável (✅ ENTREGUE)

Componente `ResponsiveCards<T>` em `src/components/responsive-cards.tsx`:

```tsx
<ResponsiveCards
  items={data}
  getKey={(x) => x.id}
  onItemClick={openDrawer}
  desktop={<TabelaAtual />}
  renderCard={(x) => (
    <>
      <MobileCardHeader title={x.nome} subtitle={x.cpf} right={<StatusChip s={x.status}/>} />
      <MobileCardRow label="Data" value={fmtDate(x.data)} />
      <MobileCardRow label="Valor" value={fmtBRL(x.valor)} />
    </>
  )}
/>
```

- Desktop (`md+`): renderiza a `desktop` prop (tabela original — zero
  regressão em telas grandes).
- Mobile (`< md`): renderiza uma lista de cards com header + linhas
  label/valor + estado vazio + skeleton.

---

## Fase 3 — Módulos críticos (🟡 A EXECUTAR)

**Ordem sugerida (uma onda = um turno):**

| Ordem | Rota | Componente atual | Ação |
| --- | --- | --- | --- |
| 1 | `/app/agenda` | tabela de agendamentos (5985 linhas) | envolver `<Table>` da lista em `ResponsiveCards`; header/filtros já colapsam bem |
| 2 | `/app/clientes` | tabela clientes-v2 | idem — usar drawer existente ao tocar no card |
| 3 | `/app/caixa` | fila de caixa | fila-card já parece card; conferir filtros/KPIs |
| 4 | `/app/orcamentos` | tabela orçamentos | idem |
| 5 | `/app/prontuarios` | listagem | idem |
| 6 | `/app/financeiro/movimento` | tabela lançamentos | mostrar `descrição / conta / valor / status` no card |
| 7 | `/app/financeiro/atendimentos` (repasse) | tabela repasses | idem |
| 8 | `/app/painel` e `/app/painel-executivo` | KPIs + gráficos | `HhpKpiCard` já colapsa; garantir que gráficos usem `overflow-x-auto` |

Para cada rota:
1. Localizar a `<Table>` / grid principal.
2. Extrair `items` para uma variável (já existe na maioria).
3. Trocar por `<ResponsiveCards items desktop={<TableAtual/>} renderCard=… />`.
4. Validar em 390 px via Playwright.

---

## Fase 4 — Módulos secundários (🟡 A EXECUTAR)

Todos os `/app/cartao-beneficios/*`, `/app/mkt-*`, `/app/hr-*`,
`/app/financeiro/*` restantes, `/app/nfse/*`, `/app/relatorios`,
`/app/lms-admin` etc. — mesmo padrão.

---

## Fase 5 — Cadastros / Admin (🟡 A EXECUTAR)

`/app/equipe`, `/app/medicos`, `/app/funcionarios`, `/app/procedimentos`,
`/app/tipos-servico`, `/app/perfis`, `/app/setores`, `/app/unidades`,
`/app/especialidades`, `/app/cargos`, `/app/estoque`.

Essas telas usam `SimpleCrud` e `ListShell` — vale um único PR que aplica
`ResponsiveCards` dentro do próprio `SimpleCrud`, cobrindo todas de uma vez.

---

## Fase 6 — Diálogos / Wizards / Drawers (🟡 A EXECUTAR)

- `NovoAgendamentoWizard`, `SolicitarEstornoDialog`, `MedicoFormDialog`,
  `FuncionarioFormDialog`, `lancamento-dialog`, `LancamentoDialog`,
  `EnfermeiroFormDialog`, etc.
- Forçar `max-w-[calc(100vw-24px)]` e conteúdo em 1 coluna abaixo de `sm`.
- Botões primários viram largura total no mobile.

---

## Fase 7 — QA final

- Rodar suite Playwright em 4 breakpoints: 360, 390, 430, 768.
- Zero overflow horizontal.
- Tap targets ≥ 40 px.
- Verificar dark-mode e `--clinic-accent` em cada card mobile.

---

## Convenções (obrigatórias para as próximas fases)

1. **Nunca** usar `min-w-[Npx]` fora de `md:` sem escapar com `md:min-w-…`.
2. Sempre `min-w-0` + `truncate` em containers de texto flex/grid.
3. Botões de ação em toolbars: `flex-wrap gap-2` + ícone-only no `< sm`.
4. Modais / drawers usam `w-[calc(100vw-16px)] sm:w-auto`.
5. Tabelas com mais de 4 colunas **sempre** passam por `ResponsiveCards`.