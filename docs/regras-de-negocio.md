# Regras de Negócio — por nível de confiança

> Complementa (não substitui) `docs/regras-negocio.md` (singular, auditoria de rodadas anteriores) e `mem/` (decisões já validadas com o usuário). Nenhuma regra aqui foi inventada — cada uma tem evidência de arquivo/tabela ou está marcada como não confirmada.

## CONFIRMADA NO CÓDIGO

### Isolamento multi-clínica via RLS
Toda tabela de negócio filtra por `clinica_id` usando `is_member(auth.uid(), clinica_id)`, `has_role(...)` ou `can_manage_clinica(...)` — funções `SECURITY DEFINER` com `SET search_path = public`.
- **Módulo:** todos. **Arquivos:** políticas em `supabase/migrations/*.sql`. **Tabelas:** ~140 tabelas de negócio.
- **Impacto:** base da segurança multi-tenant. **Risco:** RLS cobre *pertencimento à clínica*, não *papel/módulo* — ver seção CONTRADITÓRIA.

### Validação de agendamento
Antes de gravar um agendamento: paciente precisa ter telefone e data de nascimento preenchidos; se mudou horário/médico, exige agenda aberta no dia e slot `DISPONÍVEL` cobrindo o intervalo; bloqueia se `tipo_atendimento = 'convenio'` e paciente inadimplente no cartão benefícios.
- **Módulo:** Agenda. **Arquivo:** `src/lib/agenda/criar-agendamento.functions.ts`. **Tabelas:** `agendamentos`, `pacientes`.
- **Risco conhecido:** checagem "slot livre" e o `INSERT` não são atômicos (sem `SELECT ... FOR UPDATE` nem constraint de exclusão) — corrida de dois agendamentos simultâneos no mesmo slot é possível.

### Repasse — Cartão Consulta é valor fixo
Atendimento pago com "Cartão Consulta": paciente paga taxa simbólica no caixa; médico recebe o valor fixo cadastrado em `medicos` (campo de repasse cartão benefícios), **independente** do valor pago.
- **Módulo:** Financeiro/Repasse. **Arquivo:** `src/lib/print-gr.ts` (variável `isCartaoConsulta`, detecção por texto "CARTAO CONSULTA"/"CARTÃO CONSULTA" na descrição, exclui "ADESAO"/"+ SEGUROS"). **Tabelas:** `medicos`, `fin_lancamentos`.
- Também documentada em `mem/features/repasse-cartao-consulta.md` — código e documentação **concordam**.

### Auditoria automática em tabelas críticas
Trigger `fn_audit_trigger` grava em `audit_log` para INSERT/UPDATE/DELETE em: `agendamentos`, `pacientes`, `fin_lancamentos`, `medicos`, `procedimentos`, `gr_impressoes`, `orcamento_itens`.
- **Tabelas fora da cobertura:** `prontuarios`, `odonto_prontuarios` — alterações em prontuário **não** ficam na auditoria.
- **Leitura de `audit_log`** restrita a `can_manage_clinica` e apenas registros com `clinica_id` preenchido (migration `20260522181746`).

### Motor de regras "config-first" — escopo real: apenas orçamentos
`fn_regras_procedimento(procedimento_id, unidade_id)` existe e é chamada por `src/components/orcamentos/conversao-orcamento-dialog.tsx` e `src/routes/_authenticated/app.procedimentos.tsx`. Colunas `status_operacional`/`status_financeiro` existem **somente em `orcamento_itens`** (migrations de 2026-07-05).
- `mem/preferences/arquitetura-plataforma.md` descreve isso como padrão **obrigatório para toda feature nova** — hoje é verdade só para orçamentos; `agendamentos` continua com o enum simples `agendamento_status` (`agendado|cancelado|confirmado|faltou|realizado`), sem essa separação.
- **Risco:** se a intenção é expandir esse motor para agenda/caixa, ainda não aconteceu — tratar como direção arquitetural, não como regra já universal.

## CONFIRMADA EM DOCUMENTAÇÃO (mem/)

> Regras que o usuário já validou explicitamente em sessões anteriores (arquivos com `type: constraint`/`preference`/`feature` em `mem/`), mas cuja aplicação técnica no banco **não foi 100% confirmada** nesta rodada — ver observação em cada item.

### Identificadores legados de pacientes são somente-leitura
`codigo_prontuario`, `codigo_prontuario_anterior`, `numero_pasta` e números importados do sistema anterior nunca devem ser sobrescritos por automação/migration/dedup.
- **Fonte:** `mem/constraints/identificadores-legados-pacientes.md`.
- **Verificado no código:** **não há `REVOKE UPDATE`** nem constraint no banco protegendo essas colunas — é uma política comunicada à IA/equipe, não tecnicamente enforced. **Risco:** qualquer script com acesso de escrita (inclusive `service_role`) pode violar isso sem erro do banco.

### Dados históricos são imutáveis (financeiro, auditoria)
`audit_log`, `criado_por`, `atualizado_por`, `created_at`, NFS-e/boletos emitidos, movimentações de caixa não devem ser alterados retroativamente.
- **Fonte:** `mem/constraints/governanca-dados-imutaveis.md`. **Verificado no código:** parcialmente — não há trigger `BEFORE UPDATE` bloqueando escrita nessas colunas nas tabelas verificadas (`audit_log`, `fin_lancamentos`). RLS permite `UPDATE` em `fin_lancamentos` para qualquer membro (`fin_lanc_update`).

### Naming — "Cartão de Benefícios", nunca "Convênios"
Convenção de produto: não há convênios externos tradicionais; usar "Paciente Associado"/"Cartão de Benefícios".
- **Fonte:** `mem/index.md`, `mem/preferences/backlog-organizacao-menu.md`. Convenção de UI/copy, não regra de dado.

## INFERIDA E PRECISA DE VALIDAÇÃO

### Sincronismo médico ↔ especialidade ↔ serviço ↔ repasse
Intenção aparente (repetida nos relatos de uso de 09/07/2026): quando um serviço é vinculado à especialidade de um médico, ele deveria aparecer automaticamente na aba de agendamento e na aba de repasse do médico; e a lista de serviços da aba "Repasse" deveria refletir só os vinculados à especialidade selecionada.
- **Módulo:** Médicos/Agenda/Financeiro. **Tabelas envolvidas:** `medico_especialidades`, `medico_procedimentos`, `procedimento_especialidades`. **Arquivo de escrita:** `src/components/medicos/MedicoFormDialog.tsx` (grava as três tabelas de forma independente, a partir da UI).
- **Verificado no código:** **não existe trigger nem função de banco sincronizando essas três tabelas.** A consistência depende inteiramente da UI gravar todas de forma coerente a cada salvamento.
- **Evidência de risco real:** no dia 09/07/2026 o usuário relatou pelo menos 3 vezes, em módulos diferentes, cadastro de serviço/especialidade não refletindo no agendamento ou na aba de repasse (ex.: "USG Carótidas... cadastrado na Especialidade... mas não aparece em Repasse"; "Mamografia... aparecendo todos os serviços, deveria só os vinculados").
- **Pergunta para o time da clínica:** o vínculo correto é `medico_especialidades → procedimento_especialidades → medico_procedimentos` (derivado automaticamente) ou os três devem ser cadastrados manualmente e de forma independente? Se for o primeiro, falta implementar a sincronização; se for o segundo, falta validação de UI impedindo divergência.

### Numeração de GR/ficha é fixa e sequencial (não pula quando não há paciente)
Relatado como regra esperada: "o numero é fixo no sistema mesmo que não tenha paciente... não pode a numeração pular" (09/07/2026, 22:57 BRT).
- **Módulo:** Agenda/Impressão (GR). **Arquivo:** `src/lib/print-gr.ts`.
- **Status:** pedido no mesmo dia em que 2 bugs de numeração incorreta/duplicada foram relatados (10h43 e 11h22 BRT) — **não confirmado se a correção definitiva foi aplicada e validada** nesta rodada de leitura.

### Estorno individual dentro de pagamento agrupado
Pedido: quando vários agendamentos são pagos juntos, estornar um não deve afetar os demais.
- **Módulo:** Financeiro/Estorno. **Tabelas:** `estorno_solicitacoes`, `pagamentos`, `caixa_movimentos`.
- **Status:** solicitado em 09/07/2026 21:29 BRT; **implementação não verificada nesta rodada** (não localizei o handler específico de estorno parcial de pagamento agrupado).

## CONTRADITÓRIA

### Permissão por módulo existe na UI, mas não é aplicada no banco
`perfil_permissoes`/`perfis_acesso` controlam o que aparece na interface (`use-permissoes.tsx`), mas as políticas RLS de tabelas sensíveis (`prontuarios`, `fin_lancamentos`, `pacientes`) checam apenas `is_member`/`can_manage_clinica` — **não** o papel granular.
- **Impacto:** um usuário com papel restrito na UI (ex.: recepção) pode ler/editar dados de prontuário e financeiro via API direta, contornando a restrição visual.
- **Evidência de sintoma real:** 09/07/2026 17:39 BRT — "médico não tem permissão para acessar a agenda... porém na conta do médico ele pode ver e editar" (o inverso do problema: permissão negada na UI mas efetiva no banco, e vice-versa em outros relatos do mesmo dia às 15h07 e 18h13).
- **Pergunta para o time da clínica:** qual deveria ser a matriz de papel × módulo oficial? (ver `.claude/skills/validar-regra-clinica` para investigar caso a caso.)

## NÃO IDENTIFICADA

- **Regra de arredondamento/rateio em `regras_rateio`** — tabela existe, lógica de cálculo não localizada nesta rodada.
- **Política de retenção/anonimização LGPD** — tabelas `lgpd_consentimentos`/`lgpd_solicitacoes` existem; não há RPC ou job de anonimização automática encontrado.
- **Regra de bloqueio de horário duplicado além da checagem client-side** — se existe alguma trava adicional (ex.: `unique index`) não localizada, precisa ser confirmada; evidência atual (`docs/banco-de-dados.md`) é de que **não existe**.
