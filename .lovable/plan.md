
## Objetivo

Retirar do sistema tudo relacionado a "Serviços de Enfermagem" que não é usado, **preservando** os módulos **Triagem - Enfermagem** e **Alertas Enfermagem** (que continuam funcionando normalmente).

## O que será removido

### 1. Tela Horários médicos (`/app/disponibilidades`)
- Aba **"Enfermagem"** (ao lado de Agendas / Médicos).
- Bloco **"Gerar agenda - Enfermagem"** (gerador de slots para recursos de enfermagem).
- Arquivo `src/components/enfermagem-horarios-parts.tsx` (deixará de ser usado).

### 2. Módulo Recursos de Enfermagem
- Rota `/app/enfermagem-recursos` (arquivo `src/routes/_authenticated/app.enfermagem-recursos.tsx`).
- Item de menu correspondente, se houver.
- Todo o CRUD de recursos de enfermagem, atendentes vinculados e disponibilidades.

### 3. Cadastro de profissional de Enfermagem (Equipe)
- Aba **"Enfermagem"** em `/app/equipe` (`app.equipe.index.tsx`).
- Rota de edição `app.equipe.enfermeiro.$userId.editar.tsx`.
- Componente `src/components/funcionarios/EnfermeiroFormDialog.tsx`.
- Server functions em `src/lib/enfermagem-equipe.functions.ts`.

### 4. Referências pontuais a "enfermagem" em Serviços/Agenda
- Opção **"Procedimento de enfermagem"** no seletor de categoria em `/app/procedimentos` (linha 1395).
- Rótulo "enfermagem" em mapeamentos de exibição na agenda (`app.agenda.tsx` linha 5921) — apenas o rótulo, sem mudar regra de negócio.

### 5. Banco de dados (migração)
Serão removidas, em uma única migração, as tabelas e colunas abaixo. Antes de rodar, a migração verifica que não há dados vinculados vivos (`agendamentos.enfermagem_recurso_id` está zerado hoje).

Tabelas a apagar (DROP):
- `enfermagem_recurso_atendentes`
- `enfermagem_recurso_disponibilidades`
- `enfermagem_recurso_procedimentos`
- `enfermagem_recursos`

Coluna a apagar:
- `agendamentos.enfermagem_recurso_id`

**Não serão tocadas** (dependem de Triagem-Enfermagem e Alertas, que ficam):
- `triagens_enfermagem` e suas colunas (`enfermeira_id`, `enfermeira_nome`).
- `alertas_enfermagem`.

## O que NÃO será alterado

- `/app/triagem-enfermagem` — permanece igual.
- `/app/alertas-enfermagem` — permanece igual.
- Nenhuma regra de agendamento, financeiro, prontuário ou permissão além das citadas.

## Ordem de execução

1. **Backend primeiro (schema)**: migração que dropa as 4 tabelas de recursos de enfermagem e a coluna `agendamentos.enfermagem_recurso_id`. Como `_authenticated/` bloqueia tudo o que consome esses objetos, esconder da UI antes do drop deixaria server functions quebradas — por isso o schema sai primeiro. Aguarda aprovação humana.
2. **Frontend + server functions** (mesmo commit, após a migração aprovada):
   - Remover aba e bloco de Enfermagem em `app.disponibilidades.tsx`.
   - Remover rota `app.enfermagem-recursos.tsx` e itens de menu.
   - Remover aba Enfermagem em `app.equipe.index.tsx` + rota `app.equipe.enfermeiro.$userId.editar.tsx` + `EnfermeiroFormDialog.tsx`.
   - Apagar `src/lib/enfermagem-equipe.functions.ts` e `src/components/enfermagem-horarios-parts.tsx`.
   - Limpar imports órfãos e o SelectItem "Procedimento de enfermagem" em `app.procedimentos.tsx`.
3. **Validação**: build sem erros de import; abrir `/app/disponibilidades`, `/app/equipe` e `/app/procedimentos` para conferir que as abas/blocos sumiram e que Triagem-Enfermagem e Alertas Enfermagem continuam abrindo.

## Antes × Depois

- **Antes:** aba Enfermagem em Horários médicos, gerador de agenda de enfermagem, módulo Recursos de Enfermagem, aba Enfermagem em Equipe com cadastro de enfermeiro e opção "Procedimento de enfermagem" em Serviços.
- **Depois:** todas essas superfícies somem da interface e do banco. Triagem - Enfermagem e Alertas Enfermagem seguem operando.

## Riscos e pontos de atenção

- **Irreversível no banco:** o DROP das 4 tabelas apaga os 10 recursos e 30 vínculos de atendentes existentes hoje. Confirmar que ninguém precisa desse histórico antes de aprovar a migração.
- Existem 0 agendamentos com `enfermagem_recurso_id` preenchido, então o DROP da coluna é seguro.
- Se no futuro voltar a existir "serviços de enfermagem", será preciso recriar o módulo do zero.

## Classificação do pedido

Remoção de funcionalidade (regra de negócio + limpeza de dados). Não é bug nem correção visual.
