## Entendimento

Hoje, no menu lateral principal (categoria **Operação**), existe o item **"Repasse médico"**. Ao clicar, o usuário vai para `/app/financeiro/atendimentos` — que é uma rota **dentro** do layout do Financeiro, então a página abre com a subnav do Financeiro colada à esquerda (Dashboard, Mov. Caixa, BI, Analítico, Atendimentos, Estorno, Empresas, etc.).

Dentro do próprio menu do Financeiro já existe a aba **"Atendimentos"** apontando pra mesma rota. Isso dá aparência de duplicação, mas são dois caminhos de acesso à mesma tela.

**O que o usuário quer:**
1. Renomear o item **"Repasse médico"** (Operação) para **"Atendimentos"**.
2. Este atalho da Operação deve abrir a página de atendimentos **direto**, sem carregar a subnav do Financeiro.
3. A aba **"Atendimentos"** dentro do menu do Financeiro continua existindo — é apenas um atalho quando o usuário já está no módulo Financeiro.

## Classificação

Ajuste de **navegação / UX**. Nenhuma regra de negócio, permissão, dado ou lógica financeira é alterada. Nenhuma mudança em banco ou RLS.

## O que será alterado

### 1. Nova rota `src/routes/_authenticated/app.atendimentos.tsx`

Rota "atalho" **fora** do layout `/app/financeiro`, para abrir sem a sidebar do Financeiro. Renderiza exatamente o mesmo componente da tela de atendimentos.

Para reaproveitar sem duplicar as 3.291 linhas de `app.financeiro.atendimentos.tsx`:
- Exportar o componente `Page` desse arquivo (renomear para `AtendimentosPage` e adicionar `export`).
- A nova rota `/app/atendimentos` importa esse componente e o usa como `component`.
- A rota antiga `/app/financeiro/atendimentos` continua funcionando igual (mesma URL, mesmo componente, mesma subnav do Financeiro).

`head()` da nova rota: `title: "Atendimentos — ClinicaOS"` + description curta.

### 2. Menu lateral principal — `src/components/app-shell.tsx` (linha 84)

Trocar:

```tsx
{ to: "/app/financeiro/atendimentos", label: "Repasse médico", icon: HandCoins }
```

por:

```tsx
{ to: "/app/atendimentos", label: "Atendimentos", icon: HandCoins }
```

Mantém o ícone `HandCoins` e a categoria **Operação**.

### 3. Nada mais é tocado

- `src/routes/_authenticated/app.financeiro.tsx` (subnav com aba "Atendimentos" na linha 22): permanece igual — é o atalho dentro do módulo Financeiro.
- `src/components/menu-v2/menu-catalog.ts`: não mexer. A entrada "Lançamentos" (linha 58) já é outra coisa, dentro do centro Financeiro.
- Permissões, `perfil_permissoes`, RLS: **nada muda**. A tela renderizada é a mesma; suas próprias checagens internas (`useMedicoContext`, `usePodeEscrever`) continuam valendo.

## Resultado esperado (antes → depois)

- **Antes:** Operação › "Repasse médico" → abre `/app/financeiro/atendimentos` **com** a subnav do Financeiro à esquerda.
- **Depois:** Operação › **"Atendimentos"** → abre `/app/atendimentos` direto, sem a subnav do Financeiro. A aba "Atendimentos" dentro do Financeiro continua existindo como atalho interno do módulo.

## Validação

- Build/typecheck deve passar (o `routeTree.gen.ts` é regenerado automaticamente).
- Conferir no preview:
  - Operação › Atendimentos → abre sem a barra lateral do Financeiro.
  - Financeiro › Atendimentos → abre com a barra lateral do Financeiro (comportamento atual preservado).
  - Ambas as rotas mostram exatamente o mesmo conteúdo/lista.

## Fora de escopo

- Nada de regras de repasse, cálculo de `valor_medico`, permissões de médico, ou do dashboard "Repasse médicos" em `/app/financeiro`.
- Não remover o card "Repasse médicos" do dashboard financeiro (`app.financeiro.index.tsx`) — é outra funcionalidade.
