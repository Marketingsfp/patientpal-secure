## 1. Novo grupo de menu "Cadastros"

Em `src/components/app-shell.tsx`, adicionar uma nova seção `Cadastros` em `navRows`, posicionada após `Marketing` e antes de `Gestão`. Mover para ela, em ordem alfabética, os itens hoje espalhados em **Operação**, **Inteligência**, **Gestão** e **RH**:

- Cargos (hoje em Gestão)
- Clínicas (hoje em Gestão)
- Equipe (hoje em Gestão)
- Especialidades (hoje em Gestão)
- Funcionários — `/app/hr-contratos` (hoje em RH)
- Horários médicos (hoje em Gestão, rota `/app/disponibilidades`)
- Médicos (hoje em Gestão)
- Modelos de Prontuário (hoje em Inteligência)
- Procedimentos (hoje em Operação)
- Setores (hoje em Gestão)
- Unidades (hoje em Gestão)

Esses itens são **removidos** das seções de origem. As demais seções continuam intactas e na ordem alfabética atual.

Resultado das seções após a mudança:
- **Operação**: Agenda, Caixa, Cartão Benefícios, Chat interno, Clientes, Dashboard, Fluxo do paciente, Orçamentos, Recepção / Filas, Triagem - Enfermagem
- **Inteligência**: Atendimento médico, CRM, Enfermeira IA — Alertas, Informações rápidas, Nina — WhatsApp, Odontologia, Resultados de Exames
- **Marketing**: (inalterado)
- **Cadastros**: lista acima
- **Gestão**: Auditoria, Financeiro, Integrações, LGPD, Relatórios
- **RH**: Bater ponto, Cursos (admin), Férias, Holerites, Treinamentos

## 2. Cadastro de Funcionários com abas

Em `src/routes/_authenticated/app.hr-contratos.tsx`, reorganizar o diálogo de novo/editar funcionário usando `Tabs` (`@/components/ui/tabs`) com duas abas:

- **Dados** — campos atuais do contrato (clínica, nome, CPF, regime, cargo, setor, unidade, carga, salário, datas, status).
- **Login e perfil** — move para cá o bloco já existente (`criar_login`, perfil, e-mail, senha). Mantém a regra atual: só aparece para novos funcionários (`!editing`); ao editar mostra um aviso curto de que login não pode ser alterado por aqui.

Lógica de salvar permanece igual (cria usuário via `cadastrarUsuario` quando `criar_login` está marcado e vincula `user_id` ao contrato).

## Detalhes técnicos

- Sem mudanças de banco, rotas ou server functions — apenas reordenar `navRows` e refatorar o JSX do `Dialog` de Funcionários para usar `Tabs/TabsList/TabsTrigger/TabsContent`.
- A ordem alfabética dentro de "Cadastros" usa as labels exibidas (locale pt-BR).
- Nenhuma rota nova é criada; "Funcionários" continua apontando para `/app/hr-contratos`.
