# Banco de Dados — ClinicaOS / Health Hub Pro

> Lido diretamente de `supabase/migrations/*.sql` (~340 arquivos) e, para tamanhos/contagens, de consulta direta ao banco de produção em 2026-07-09 (só metadados — **nenhum dado real de paciente, credencial ou token está reproduzido aqui**).

## Tabelas — visão por domínio (schema `public`)

~140 tabelas de negócio, todas com `clinica_id` (padrão multi-tenant) exceto tabelas de staging/import (prefixo `_`). Lista completa navegável em `src/integrations/supabase/types.ts` (gerado). Agrupamento:

- **Núcleo clínico:** `pacientes`, `paciente_biometria`, `medicos`, `medico_biometria`, `medico_especialidades`, `medico_procedimentos`, `medico_convenios`, `medico_disponibilidades`, `medico_agendas`, `agendamentos`, `agendamento_orcamento_itens`, `especialidades`, `procedimentos`, `procedimento_especialidades`, `prontuarios`, `prontuario_modelos`, `odonto_prontuarios`, `odonto_dentes`, `anamnese_modelos`, `anamnese_respostas`, `exame_resultados`.
- **Financeiro:** `fin_lancamentos`, `fin_categorias`, `fin_contas`, `fin_atendimentos`, `fin_alertas`, `fin_notas_pacientes`, `fin_regras_ia`, `fin_empresas`, `fin_lembretes`, `caixa_sessoes`, `caixa_movimentos`, `pagamentos`, `pagamento_splits`, `estorno_solicitacoes`, `boletos`, `orcamentos`, `orcamento_itens`, `regras_rateio`, `procedimento_split_regras`, `procedimento_unidade_regras`.
- **Cartão de Benefícios:** `cb_convenios`, `cb_convenio_regras`, `cb_convenio_valores`, `cb_convenio_faixas`, `cb_beneficios`, `cartoes_convenio`, `contrato_dependentes`, `contrato_mensalidades`, `contratos_assinatura`, `procedimento_cb_convenio_valores`.
- **Enfermagem:** `enfermagem_recursos`, `enfermagem_recurso_disponibilidades`, `enfermagem_recurso_procedimentos`, `enfermagem_recurso_atendentes`, `alertas_enfermagem`, `triagens_enfermagem`.
- **WhatsApp/Atendimento (bot Nina):** `whatsapp_configs`, `whatsapp_mensagens`, `whatsapp_templates`, `atend_conversas`, `atend_departamentos`, `atend_departamento_membros`, `atend_routing_rules`, `atend_horarios`, `atend_pausas_log`, `atend_pause_reasons`, `atend_macros`, `atend_kb`, `atend_notas_internas`, `atend_transferencias`, `atend_avaliacoes`, `atend_bot_configs`, `atend_protocolo_config`, `atend_numeros_autorizados`, `atend_msg_fora_horario`.
- **NFS-e/Fiscal:** `nfse`, `nfse_emitentes`, `documentos_emitidos`, `modelos_documentos`, `gr_impressoes`.
- **CRM/Marketing:** `crm_etapas`, `crm_oportunidades`, `campanhas_marketing`, `mkt_envios`, `mkt_landing_pages`, `mkt_leads`, `mkt_segmentos`.
- **RH:** `cargos`, `setores`, `hr_contratos`, `hr_ferias`, `hr_holerites`, `hr_pontos`, `hr_banco_horas`, `hr_escalas`.
- **LMS:** `lms_cursos`, `lms_modulos`, `lms_licoes`, `lms_quizzes`, `lms_progresso`, `lms_certificados`, `lms_trilhas_cargo`.
- **Estrutura/Acesso:** `clinicas`, `unidades`, `clinica_memberships`, `perfis_acesso`, `perfil_permissoes`, `permissions`, `role_permissions`, `user_roles`, `profiles`, `senhas` (filas), `tipos_servico`, `prestadores`.
- **Auditoria/LGPD/Backup:** `audit_log`, `lgpd_consentimentos`, `lgpd_solicitacoes`, `backup_execucoes`, `integration_secrets`.
- **Chat interno:** `chat_canais`, `chat_membros`, `chat_mensagens`, `chat_leituras`.
- **Estoque:** `estoque_produtos`, `estoque_movimentos`.
- **Planos do sistema:** `planos_assinatura`, `sistema_planos`.
- **Staging/import (temporárias, prefixo `_`):** `_mj_import_csv`, `_mj_dedup`, `_mj_match_plan`, `_pac_stage_import`, `_pasta_final`, `_pasta_final2`, `_pasta_import_cpf`, `_pasta_import_nome`, `_pasta_import_nome2`, `_tmp_prontuario_updates`, `_stg_pagos2`, `agendamentos_legacy_import`, `import_agenda_legado`. **Risco:** algumas ainda tinham linhas em produção na consulta de 2026-07-09 (`_mj_import_csv` 62MB/246k linhas, `_mj_dedup` 61MB/241k, `_tmp_import_pacientes` 31MB/250k, `_mj_match_plan` 31MB/232k) — confirmar com o time se a importação já terminou antes de dropar.

## Relacionamentos e chaves estrangeiras

- Padrão: toda tabela de negócio tem `clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE`.
- `agendamentos.paciente_id` e `agendamentos.medico_id` são `ON DELETE SET NULL` — apagar um paciente/médico não apaga o histórico de agendamento, só desvincula (nome fica preservado em `paciente_nome` texto).
- ~200 declarações `REFERENCES` no total; sem `EXCLUDE USING gist` em nenhuma tabela (relevante para `agendamentos` — não há trava de sobreposição de horário no banco).

## Enums (`CREATE TYPE ... AS ENUM`)

`agendamento_prioridade`, `agendamento_status`, `alerta_enf_status`, `app_role`, `app_role_global`, `chat_canal_tipo`, `crm_status`, `estoque_movimento_tipo`, `fin_status_lancamento`, `fin_tipo_conta`, `fin_tipo_lancamento`, `fluxo_etapa`, `forma_pagamento`, `lms_licao_tipo`, `modulo_acesso`, `odonto_status`, `pagamento_forma`, `pagamento_status`, `prestador_tipo`, `procedimento_tipo`, `resultado_status`, `split_beneficiario_tipo`, `status_senha`, `tipo_documento`, `tipo_senha`.

## Views

Apenas **uma** encontrada: `v_pacientes_duplicados_suspeitos` (suporte ao módulo de deduplicação de pacientes).

## Triggers

123 nomes de trigger únicos no schema. Categorias confirmadas:
- **Auditoria** (`trg_audit_*`): `agendamentos`, `pacientes`, `fin_lancamentos`, `medicos`, `procedimentos`, `gr_impressoes`, `orcamento_itens` → `fn_audit_trigger()`. **`prontuarios` e `odonto_prontuarios` não têm.**
- **Espelhamento de status** em `orcamento_itens`: trigger bidirecional entre `status_item` (legado) e `status_operacional`/`status_financeiro` (novo), migration `20260705022200`.
- **`updated_at` automático**: padrão presente (ex.: `tg_integration_secrets_updated_at`), mas não confirmado como universal em todas as tabelas — variação de nomenclatura entre migrations dificultou contagem exata.

## Funções relevantes (`SECURITY DEFINER`)

124 funções `SECURITY DEFINER` no total; 120 com `SET search_path` explícito no momento da criação — as poucas exceções históricas foram corrigidas em migrations posteriores (`20260611024345` revoga EXECUTE de `anon` das que não deveriam ser públicas).

Funções centrais de autorização (chamadas dentro de políticas RLS):
- `is_member(_user_id, _clinica_id)` — pertence à clínica e está ativo.
- `has_role(_user_id, _clinica_id, _role)` — tem papel específico na clínica.
- `can_manage_clinica(_user_id, _clinica_id)` — papel `admin`/`gestor`.
- `has_role_global`, `user_is_any_manager` — variantes globais.

RPCs públicas (token-based, `GRANT ... TO anon, authenticated`): `consulta_publica`, `salvar_anamnese_publica`, `contrato_publico`, `assinar_contrato_publico`, `checkin_agendamento`, `verificar_certificado` — cada uma valida um token próprio antes de retornar dado.

## Políticas RLS

- **Cobertura:** todas as tabelas de negócio no schema `public` têm RLS habilitado (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) — confirmado por comparação 1:1 entre `CREATE TABLE` e `ENABLE ROW LEVEL SECURITY` nas migrations.
- **Padrão dominante:** `USING (is_member(auth.uid(), clinica_id))` para SELECT/INSERT/UPDATE; `USING (can_manage_clinica(auth.uid(), clinica_id))` para DELETE em tabelas sensíveis (`pacientes`, `prontuarios`, `pagamentos`, `fin_lancamentos`).
- **Proteção por coluna (exceção, não padrão):** `medicos` teve `REVOKE SELECT` de colunas sensíveis (CPF, dados bancários, PIX) de `authenticated`, expostas só via RPC `SECURITY DEFINER` (migration `20260525114119`). **Esse mesmo tratamento não existe em `pacientes`** (CPF, data de nascimento legíveis por qualquer membro da clínica).
- **Risco confirmado:** RLS não diferencia **papel/módulo** dentro da clínica — ver `docs/regras-de-negocio.md`, categoria CONTRADITÓRIA.

## Campos de auditoria

Padrão comum: `created_at`, `updated_at`, `criado_por` (nem toda tabela tem os três). Tabela dedicada `audit_log` com `user_id`, `user_email`, `clinica_id`, `table_name`, `record_id`, `action`, `dados_antes`, `dados_depois`. Leitura restrita a `can_manage_clinica` com `clinica_id NOT NULL`.

## Riscos de acesso entre clínicas

- **Não identificado** nenhum caso de tabela sem RLS ou política `USING (true)` genérica em tabela de negócio multi-tenant durante esta leitura (a única `USING (true)` de escopo amplo encontrada foi em `_pac_stage_import`, tabela de staging restrita a `service_role`).
- **Risco indireto:** como a chave `service_role` bypassa RLS por completo e é usada em várias `*.functions.ts` e nos webhooks `/api/public/*`, qualquer bug de validação nesses arquivos server-side (não no RLS) pode vazar dado entre clínicas. Cada server function que usa `supabaseAdmin` precisa validar `clinica_id` manualmente — não há uma segunda camada de defesa do banco nesses casos.

## Migrations relevantes para entender a evolução de segurança

- `20260516181120` — criação de `is_member`/`has_role`/`can_manage_clinica`.
- `20260520175438` — `has_role_global`, RLS em `user_roles`.
- `20260522181746` — restrição de leitura de `audit_log`.
- `20260525114119` — proteção por coluna em `medicos` (primeiro e único caso).
- `20260611024345` — revogação em massa de EXECUTE de `anon` em funções que não deveriam ser públicas.
- `20260705020519` / `20260705022200` / `20260705024608` — introdução do motor `fn_regras_procedimento` e separação `status_operacional`/`status_financeiro` (escopo: `orcamento_itens`).

## Tamanho em produção (metadados, sem dados reais — consulta de 2026-07-09)

Banco total: **1,4 GB** (cota do plano Pro: 8 GB). Maiores tabelas: `pacientes` 585 MB / 242k linhas, `fin_lancamentos` 423 MB / 908k linhas, `audit_log` 101 MB / 76k linhas. Bucket de backup (`backups-diarios`) media **918 kB** no momento da consulta — desproporcional ao tamanho do banco, indício de falha no job de backup diário (`src/routes/api/public/hooks/backup-diario.ts`) que não foi investigada a fundo nesta rodada.
