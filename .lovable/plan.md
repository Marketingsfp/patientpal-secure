## Objetivo

Tornar visíveis no menu páginas que hoje só são alcançadas por URL direta ou pela busca global. Aplicação **global (3 clínicas)**, conforme confirmado.

## Escopo

### 1. Aba "Modelos" no Cartão Benefícios
Hoje as abas são: Vendas, Convênios, Dependentes, Relatórios (BI). A página `/app/cartao-beneficios/modelos` existe mas não está listada.

- Acrescentar a aba **"Modelos"** (ícone de arquivo/cartão) na barra de abas do Cartão Benefícios, após "Dependentes".
- Ela abre o cadastro de modelos de plano/contrato: nome, tipo, valor mensal, taxa de adesão, limite de dependentes/agregados, fidelidade, vigência, nº de parcelas, benefícios e template de impressão do contrato.
- Nada muda na tela em si nem nos dados; é só exposição de navegação.

### 2. Páginas órfãs úteis ganham item de menu
- **Anamneses** (`/app/anamneses`) → grupo Clínico/Atendimento.
- **Clínicas** (`/app/clinicas`) → grupo Configurações.
- **Backups** (`/app/backups`) → grupo Configurações.

Cada uma continua respeitando as permissões já definidas em `permissoes-rotas.ts` — quem não tem o módulo liberado segue sem ver o item.

### 3. Fora do escopo (não mexer agora)
- Telas internas de teste `dev-caixa-shell`, `dev-clientes-shell`, `dev-list-shell`, `dev-orcamentos-shell`, `dev-hhp` — permanecem como estão.
- Página antiga `/app/medicos` (substituída por `/app/equipe`) — permanece como está.
- Páginas que já têm navegação própria dentro do módulo pai: abas do Financeiro, `cartao-beneficios/beneficios`, `nfse/testar`, `orcamentos-agenda`, `agenda-v2`.
- Nenhuma alteração de valores, regras de negócio, banco ou permissões.

## Detalhes técnicos

- `src/routes/_authenticated/app.cartao-beneficios.tsx`: adicionar entrada `{ to: "/app/cartao-beneficios/modelos", label: "Modelos", icon: ... }` no array de abas.
- `src/components/app-shell.tsx`: adicionar os três itens nos grupos correspondentes do array de navegação.
- Sem migração de banco. Sem mudança em `permissoes-rotas.ts` (as rotas já estão mapeadas).

## Riscos

Baixo. Mudança puramente de navegação/frontend, reversível. Impacto: itens novos passam a aparecer para usuários com permissão nos módulos correspondentes nas 3 clínicas.

## Validação após implementar

- Abrir Cartão Benefícios e confirmar a aba "Modelos" listando os modelos da clínica ativa.
- Conferir que Anamneses, Clínicas e Backups abrem pelo menu.
- Conferir que usuário sem permissão no módulo continua sem ver o item.
