## Objetivo

Adicionar uma terceira categoria — **Enfermagem** — ao cadastro de Equipe, separada de Funcionários e Médicos, com vínculo às agendas (recursos de enfermagem como CURATIVO, INALAÇÃO, ECG, etc.) que cada profissional pode atender.

## Mudanças

### 1. Banco — nova tabela de vínculo

`enfermagem_recurso_atendentes`
- `user_id` (FK auth.users)
- `recurso_id` (FK enfermagem_recursos)
- `clinica_id`
- Único por (user_id, recurso_id)
- RLS: leitura para membros da clínica; gestão por admin/gestor

Isso permite saber **quais agendas cada enfermeiro pode atender** sem mexer no perfil/role.

### 2. Página `/app/equipe` — nova aba "Enfermagem"

- Tabs passam a ser: **Funcionários** | **Médicos** | **Enfermagem**
- A aba Enfermagem lista membros com `role = 'enfermeiro'`, mostrando Nome, Status e **Agendas vinculadas** (badges com nome dos recursos)
- Botão de editar abre o novo `EnfermeiroFormDialog`
- Atualizar `validateSearch` para aceitar `tab: "enfermagem"`
- A aba Funcionários passa a filtrar **fora** os `role = 'enfermeiro'` (eles aparecem só na aba Enfermagem)

### 3. Pop-up "Novo cadastro" — terceira opção

Adicionar card **Enfermagem** (ícone Syringe/HeartPulse) ao lado de Funcionário e Médico. Layout muda para `grid-cols-3`. Ao escolher, abre o `EnfermeiroFormDialog`.

### 4. Novo `EnfermeiroFormDialog`

Cópia funcional do `FuncionarioFormDialog` (mesmas abas Dados / Login e perfil, mesma seleção de funcionário disponível do RH, mesmo fluxo de criar login) com:

- **Perfil fixo em "enfermeiro"** (campo oculto / pré-selecionado)
- **Nova aba (ou seção) "Agendas"** com um multi-select listando todos os `enfermagem_recursos` ativos da clínica
  - Ao salvar, sincroniza `enfermagem_recurso_atendentes` (insere novos / remove desmarcados)
  - Na edição, vem pré-marcada com os recursos atuais

### 5. Filtro da Agenda (`/app/agenda`)

Quando o usuário logado é `role = 'enfermeiro'`, o seletor de coluna passa a mostrar apenas os recursos de enfermagem para os quais ele está em `enfermagem_recurso_atendentes`. Admin/gestor/recepção continuam vendo todos.

## Fora do escopo

- Não mexer no fluxo de Médicos
- Não mexer no cadastro de recursos de enfermagem em si (`/app/enfermagem-recursos`)
- Sem relatórios de produtividade

## Detalhes técnicos

- Server function nova em `src/lib/enfermagem-equipe.functions.ts` para `salvarVinculosAgendas({ userId, clinicaId, recursoIds[] })` rodando com `supabaseAdmin` após `assertManager`.
- `EquipePage`: estender query inicial para buscar também enfermeiros + vínculos (`enfermagem_recurso_atendentes` + `enfermagem_recursos.nome`) em um `in()` por user_id.
- Migration cria tabela + GRANTs (`authenticated`, `service_role`) + RLS + policies usando `has_role` / `can_manage_clinica` já existentes.
