-- agendamentos
CREATE INDEX IF NOT EXISTS idx_agendamentos_clinica_inicio ON public.agendamentos (clinica_id, inicio DESC);
CREATE INDEX IF NOT EXISTS idx_agendamentos_medico_inicio ON public.agendamentos (medico_id, inicio DESC) WHERE medico_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente ON public.agendamentos (paciente_id) WHERE paciente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON public.agendamentos (clinica_id, status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_token ON public.agendamentos (token_publico) WHERE token_publico IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agendamentos_fluxo ON public.agendamentos (clinica_id, fluxo_etapa) WHERE fluxo_etapa IS NOT NULL;

-- fin_lancamentos
CREATE INDEX IF NOT EXISTS idx_fin_lanc_clinica_data ON public.fin_lancamentos (clinica_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_clinica_venc ON public.fin_lancamentos (clinica_id, data_vencimento) WHERE data_vencimento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_lanc_paciente ON public.fin_lancamentos (paciente_id) WHERE paciente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_lanc_status ON public.fin_lancamentos (clinica_id, tipo, status);

-- audit_log
CREATE INDEX IF NOT EXISTS idx_audit_clinica_created ON public.audit_log (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table ON public.audit_log (clinica_id, table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_log (clinica_id, user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- whatsapp_mensagens / atend_conversas
CREATE INDEX IF NOT EXISTS idx_wa_msg_conversa_created ON public.whatsapp_mensagens (conversa_id, created_at DESC) WHERE conversa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_msg_clinica_created ON public.whatsapp_mensagens (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atend_conv_clinica_ultima ON public.atend_conversas (clinica_id, ultima_msg_em DESC);
CREATE INDEX IF NOT EXISTS idx_atend_conv_status ON public.atend_conversas (clinica_id, status);

-- contrato_mensalidades
CREATE INDEX IF NOT EXISTS idx_contr_mens_contrato ON public.contrato_mensalidades (contrato_id, vencimento);
CREATE INDEX IF NOT EXISTS idx_contr_mens_status_venc ON public.contrato_mensalidades (status, vencimento);

-- caixa
CREATE INDEX IF NOT EXISTS idx_caixa_sessoes_clinica_aberto ON public.caixa_sessoes (clinica_id, aberto_em DESC);
CREATE INDEX IF NOT EXISTS idx_caixa_sessoes_user_status ON public.caixa_sessoes (user_id, status);
CREATE INDEX IF NOT EXISTS idx_caixa_mov_sessao ON public.caixa_movimentos (sessao_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_caixa_mov_clinica_created ON public.caixa_movimentos (clinica_id, created_at DESC);

-- pacientes
CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_ativo ON public.pacientes (clinica_id, ativo);
CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_email ON public.pacientes (clinica_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_cpf ON public.pacientes (clinica_id, cpf) WHERE cpf IS NOT NULL;

-- medicos
CREATE INDEX IF NOT EXISTS idx_medicos_clinica_ativo ON public.medicos (clinica_id, ativo);

-- contratos_assinatura
CREATE INDEX IF NOT EXISTS idx_contr_assin_clinica_status ON public.contratos_assinatura (clinica_id, status);
CREATE INDEX IF NOT EXISTS idx_contr_assin_paciente ON public.contratos_assinatura (paciente_id) WHERE paciente_id IS NOT NULL;