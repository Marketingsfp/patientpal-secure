## Objetivo
Reduzir a quantidade de itens no menu lateral agrupando cadastros relacionados em **uma única página com abas internas**, sem perder nenhuma funcionalidade nem quebrar URLs existentes (redirecionamentos serão mantidos).

## Consolidações propostas

### 1. Cartão Benefícios → 1 item só
Hoje: Nova venda · Convênio · Relatórios (3 itens)
Vira: **Cartão Benefícios** (1 item) com abas internas:
- Nova venda
- Convênios
- Relatórios

### 2. Marketing → 1 item só
Hoje: Campanhas · Envios · Landing Pages · Leads · Segmentos (5 itens)
Vira: **Marketing** (1 item) com abas:
- Leads
- Campanhas
- Envios
- Segmentos
- Landing Pages

### 3. RH → 1 item só
Hoje: Bater ponto · Cursos (admin) · Férias · Holerites · Treinamentos (5 itens)
Vira: **RH** (1 item) com abas:
- Ponto
- Férias
- Holerites
- Treinamentos
- Cursos (admin)

### 4. Cadastros → Serviços já é submenu, simplificar
Hoje (Cadastros): Equipe · Serviços[Especialidades/Tipo/Item] · Horários médicos · Modelos de Prontuário · Perfis · Unidades
Vira:
- **Serviços** (1 item) com abas internas: Especialidades · Tipos · Itens (remove o submenu expansível)
- Restante continua igual

### 5. Gestão → agrupar Segurança & Compliance
Hoje: Auditoria · Cargos · Financeiro · Funcionários · Integrações · LGPD · Relatórios · Setores (8 itens)
Vira:
- **Segurança** (1 item) com abas: Auditoria · LGPD · Integrações
- Demais continuam separados (Financeiro/Relatórios/Funcionários/Cargos/Setores)

### Inteligência
Mantém como está — cada item tem natureza muito diferente (IA médica, CRM, Nina, Odontologia, etc.).

## Resultado
- **Antes:** ~33 itens visíveis no menu
- **Depois:** ~22 itens visíveis (redução de ~33%)

## Detalhes técnicos
- Criar rotas pai com `<Outlet />` + barra de abas (shadcn `Tabs` controlada por URL):
  - `/app/cartao-beneficios` (já existe como pai, apenas adicionar abas no layout)
  - `/app/marketing` (novo layout)
  - `/app/rh` (novo layout)
  - `/app/servicos` (novo layout para Especialidades/Tipos/Itens)
  - `/app/seguranca` (novo layout para Auditoria/LGPD/Integrações)
- Rotas atuais (`/app/mkt-leads`, `/app/hr-ponto`, `/app/especialidades`, etc.) continuam funcionando — vão redirecionar para o novo caminho com a aba correspondente, então links salvos não quebram.
- Atualizar `navRows` em `src/components/app-shell.tsx` para refletir a nova estrutura.
- Reaproveitar 100% das páginas existentes (apenas renderizadas dentro do Outlet do novo layout).

## Confirmação
Posso aplicar essa organização? Se preferir, posso ajustar — por exemplo, manter Marketing/RH separados e consolidar só Cartão Benefícios + Serviços + Segurança.