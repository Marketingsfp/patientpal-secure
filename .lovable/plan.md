## Objetivo

Criar agendas para exames realizados pela equipe de Enfermagem (ECG, MAPA 24h, Holter, ITB, Sala de Enfermagem), compartilhadas entre todos os enfermeiros, com registro automático de quem executou cada exame.

## Conceito

Tratar enfermagem como **Recursos Agendáveis** (salas), separados de médicos. Vários enfermeiros logados enxergam e mexem na mesma agenda em tempo real.

## Mudanças no banco

**Nova tabela `enfermagem_recursos`** (salas/recursos de enfermagem)
- `nome`, `cor`, `descricao`, `duracao_padrao_min`, `ativo`, `clinica_id`
- RLS: leitura para membros da clínica; gestão para admin/gestor

**Nova tabela `enfermagem_recurso_procedimentos`** (quais exames cada recurso faz)
- `recurso_id`, `procedimento_id`

**Nova tabela `enfermagem_recurso_disponibilidades`** (horários da sala)
- mesmo modelo de `disponibilidades` dos médicos

**Alterações em `agendamentos`:**
- `medico_id` continua opcional (já é nullable)
- Adicionar `enfermagem_recurso_id uuid` (FK opcional)
- Adicionar `executado_por uuid` (user_id do enfermeiro que iniciou/finalizou)
- Adicionar `executado_em timestamptz`
- Constraint: ou `medico_id` ou `enfermagem_recurso_id` preenchido (não os dois)

## Mudanças no app

**Nova tela "Enfermagem → Recursos"** (`/app/enfermagem-recursos`)
- CRUD de salas/recursos
- Seleção de procedimentos vinculados (multi-select alfabético, igual médicos)
- Configuração de horários de funcionamento

**Agenda (`/app/agenda`)**
- Filtro/seletor passa a listar Médicos + Recursos de Enfermagem (agrupados)
- Coluna de recurso renderiza igual coluna de médico
- Ao agendar, se for recurso de enfermagem grava `enfermagem_recurso_id` em vez de `medico_id`
- Procedimentos disponíveis vêm dos vinculados ao recurso

**Atendimento / Fluxo**
- Botão "Iniciar atendimento" em agendamento de enfermagem grava `executado_por = auth.uid()` e `executado_em = now()`
- Exibe nome do enfermeiro executor no card do agendamento

**Permissões**
- Papéis `enfermeiro`, `recepcao`, `admin`, `gestor` veem e editam agendas de enfermagem
- Realtime já habilitado em `agendamentos` propaga mudanças automaticamente

**Seed inicial**
- Criar automaticamente os 5 recursos informados ao rodar a migração: "EXAME DE ELETROCARDIOGRAMA", "EXAME DE MAPA 24H", "EXAME DE HOLTER", "EXAME DE ITB", "SALA ENFERMAGEM" — apenas como sugestão, podem ser editados/removidos.

## Fora do escopo desta entrega

- Relatórios de produtividade por enfermeiro (fica para depois, dados já ficam gravados)
- Repasse financeiro para enfermagem
- Bloqueio de horários por enfermeiro individual

## Detalhes técnicos

- Reuso de `procedimentos` e `medico_procedimentos` é mantido para médicos; criamos tabelas paralelas para enfermagem para não misturar contextos.
- Componente `procedimento-cell.tsx` ganha suporte a `enfermagem_recurso_id`.
- `app.agenda.tsx`: a query de "colunas" passa a unir médicos ativos + recursos de enfermagem ativos.
- Validações Zod nas server functions novas (`enfermagem.functions.ts`).
- Triggers de auditoria reaproveitam `fn_audit_trigger`.
