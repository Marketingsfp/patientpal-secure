# Página de Perfis — proposta visual (somente preview)

A página `/app/perfis` passa a ter **2 abas**, sem ainda persistir nada no banco. Primeiro só o layout — assim você aprova o formato antes de eu salvar permissões reais por perfil.

## Aba 1 — "Perfis"

Os 7 perfis atuais (ADMIN, GESTOR, MÉDICO, RECEPÇÃO, CAIXA, FINANCEIRO, ENFERMEIRO) deixam de ser cards e viram **uma lista (tabela) compacta** com:

```text
| Ícone | Nome do Perfil | Chave    | Descrição curta                       | Permissões (resumo) |
|-------|----------------|----------|---------------------------------------|---------------------|
| 🛡    | ADMIN          | admin    | Acesso total ao sistema...            | 32 módulos          |
| 💼    | GESTOR         | gestor   | Gestão operacional da unidade...      | 18 módulos          |
| 🩺    | MÉDICO         | medico   | Profissional clínico...               | 6 módulos           |
| ...   |                |          |                                       |                     |
```

Clicar em uma linha **seleciona o perfil** e leva à aba "Permissões" já filtrada por ele.

## Aba 2 — "Permissões"

Inspirada na foto que você enviou. No topo, um **seletor de perfil** (dropdown com os 7 perfis). Abaixo, **grupos colapsáveis** espelhando a estrutura do menu lateral, e dentro de cada grupo uma tabela com os módulos.

Cada linha tem 3 colunas de acesso (radio): **Sem acesso · Leitura · Edição**.

```text
▼ Operação                                                     8 / 10
  ┌───────────────────────────┬──────────────────────────────┬────────────────────────┐
  │ Módulo                    │ Descrição                    │ Acesso                 │
  ├───────────────────────────┼──────────────────────────────┼────────────────────────┤
  │ Agenda                    │ Calendário de agendamentos   │ ( ) Sem  ( ) Leit  (•) Edição │
  │ Caixa                     │ Operação de caixa diário     │ ( ) Sem  (•) Leit  ( ) Edição │
  │ Cartão Benefícios         │ Planos e contratos           │ (•) Sem  ( ) Leit  ( ) Edição │
  │ Chat interno              │ Mensagens entre equipe       │ ...                          │
  └───────────────────────────┴──────────────────────────────┴────────────────────────┘

▶ Inteligência                                                 3 / 7
▶ Marketing                                                    0 / 5
▼ Cadastros                                                    9 / 11
  │ Cargos               │ Cargos e funções        │ ...
  │ Equipe               │ Usuários do sistema     │ ...
  │ Funcionários         │ Cadastro de RH          │ ...
  │ Perfis               │ Gestão de perfis        │ ...
  │ ...
▶ Gestão                                                       2 / 5
▶ RH                                                           1 / 5
```

No topo da aba também:
- contador global (ex.: `Acessos: 23 / 45`)
- botões **Marcar tudo como Leitura**, **Marcar tudo como Edição**, **Limpar**
- botão **Salvar** (desabilitado nesta etapa de preview)

## Lista de módulos do sistema (que ficam atrelados ao perfil)

Para popular a matriz vou usar **exatamente** o menu lateral hoje existente, agrupado por seção. Total = 45 módulos:

- **Operação (10):** Agenda · Caixa · Cartão Benefícios · Chat interno · Clientes · Dashboard · Fluxo do paciente · Orçamentos · Recepção / Filas · Triagem - Enfermagem
- **Inteligência (7):** Atendimento médico · CRM · Enfermeira IA — Alertas · Informações rápidas · Nina — WhatsApp · Odontologia · Resultados de Exames
- **Marketing (5):** Campanhas · Envios · Landing Pages · Leads · Segmentos
- **Cadastros (11):** Cargos · Equipe · Especialidades · Funcionários · Horários médicos · Médicos · Modelos de Prontuário · Perfis · Procedimentos · Setores · Unidades
- **Gestão (5):** Auditoria · Financeiro · Integrações · LGPD · Relatórios
- **RH (5):** Bater ponto · Cursos (admin) · Férias · Holerites · Treinamentos
- **Sistema (2):** Configurações · Perfil próprio

## Escopo desta entrega (preview only)

- ✅ Refatorar `src/routes/_authenticated/app.perfis.tsx` com Tabs (`Perfis` / `Permissões`).
- ✅ Lista de perfis em tabela na aba 1.
- ✅ Matriz com grupos colapsáveis + radio (Sem / Leitura / Edição) na aba 2, com estado **local em memória** (sem banco).
- ✅ Por padrão, ADMIN inicia tudo como "Edição" e os demais perfis com seleção sugerida visualmente (apenas mock).
- ❌ **Não** cria tabela no banco, **não** liga ao backend, **não** aplica RLS — isso vem depois que você aprovar o formato.

## Detalhes técnicos

- Componentes shadcn: `Tabs`, `Table`, `RadioGroup`, `Collapsible`, `Select`, `Badge`, `Button`.
- Constante única `MODULOS` (array agrupado) reutilizada pela aba 1 (contagem) e aba 2 (matriz).
- Estado: `useState<Record<perfilKey, Record<moduloKey, "none" | "read" | "write">>>`.
- Sem alteração em outros arquivos.
