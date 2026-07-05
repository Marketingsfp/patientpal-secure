-- ============================================================
-- Bateria [TESTE-FRONT-CONVERSAO] — 20 cenários transacionais
-- Rode no SQL Editor do Supabase (autenticado como admin/gestor).
-- Cada bloco usa BEGIN … ROLLBACK para não deixar resíduo.
-- Se precisar validar cascatas de UPDATE, remova o ROLLBACK
-- do bloco isolado e execute o CLEANUP no final.
-- ============================================================

-- Variáveis de teste (ajuste conforme sua clínica de homologação):
--   :clinica_id   uuid da clínica
--   :unidade_id   uuid da unidade (pode ser NULL)
--   :proc_agenda  proc com agenda_obrigatoria=true, permite_venda_direta=false
--   :proc_venda   proc com permite_venda_direta=true (ex.: laboratório)
--   :proc_mapa    proc de entrega domiciliar (MAPA/Holter)
--   :caixa_id     sessão de caixa aberta do usuário logado
--   :medico_id    uuid médico ativo

-- -----------------------------------------------------------
-- 1) get_orcamento_conversao devolve status duplo + ações
-- -----------------------------------------------------------
BEGIN;
  INSERT INTO pacientes(clinica_id, nome) VALUES (:'clinica_id', '[TESTE-FRONT-CONVERSAO] P1') RETURNING id \gset paciente_
  INSERT INTO orcamentos(clinica_id, paciente_id, observacoes, status)
    VALUES (:'clinica_id', :'paciente_id', '[TESTE-FRONT-CONVERSAO]', 'aberto') RETURNING id \gset orc_
  INSERT INTO orcamento_itens(orcamento_id, procedimento_id, descricao, valor_unitario, quantidade, valor_total)
    VALUES (:'orc_id', :'proc_agenda', '[TESTE-FRONT-CONVERSAO] item', 100, 1, 100);
  SELECT public.get_orcamento_conversao(:'orc_id');
ROLLBACK;

-- -----------------------------------------------------------
-- 2) Venda antecipada permitida (permite_venda_direta=true)
-- -----------------------------------------------------------
BEGIN;
  INSERT INTO pacientes(clinica_id, nome) VALUES (:'clinica_id', '[TESTE-FRONT-CONVERSAO] P2') RETURNING id \gset paciente_
  INSERT INTO orcamentos(clinica_id, paciente_id, observacoes, status)
    VALUES (:'clinica_id', :'paciente_id', '[TESTE-FRONT-CONVERSAO]', 'aberto') RETURNING id \gset orc_
  INSERT INTO orcamento_itens(orcamento_id, procedimento_id, descricao, valor_unitario, quantidade, valor_total)
    VALUES (:'orc_id', :'proc_venda', '[TESTE-FRONT-CONVERSAO] lab', 80, 1, 80) RETURNING id \gset item_
  SELECT public.converter_item_venda(:'item_id', :'caixa_id', 'dinheiro', 0);
  -- esperado: ok=true, cria fin_atendimento, status_financeiro=pago, status_operacional=pendente
  SELECT status_financeiro, status_operacional FROM orcamento_itens WHERE id=:'item_id';
ROLLBACK;

-- -----------------------------------------------------------
-- 3) Venda antecipada bloqueada (permite_venda_direta=false, sem agendamento)
-- -----------------------------------------------------------
BEGIN;
  INSERT INTO pacientes(clinica_id, nome) VALUES (:'clinica_id', '[TESTE-FRONT-CONVERSAO] P3') RETURNING id \gset paciente_
  INSERT INTO orcamentos(clinica_id, paciente_id, observacoes, status)
    VALUES (:'clinica_id', :'paciente_id', '[TESTE-FRONT-CONVERSAO]', 'aberto') RETURNING id \gset orc_
  INSERT INTO orcamento_itens(orcamento_id, procedimento_id, descricao, valor_unitario, quantidade, valor_total)
    VALUES (:'orc_id', :'proc_agenda', '[TESTE-FRONT-CONVERSAO]', 150, 1, 150) RETURNING id \gset item_
  SELECT public.converter_item_venda(:'item_id', :'caixa_id', 'dinheiro', 0);
  -- esperado: codigo='VENDA_NAO_PERMITIDA'
ROLLBACK;

-- -----------------------------------------------------------
-- 4) Venda pós-agenda (bypass — item já agendado)
-- -----------------------------------------------------------
BEGIN;
  INSERT INTO pacientes(clinica_id, nome) VALUES (:'clinica_id', '[TESTE-FRONT-CONVERSAO] P4') RETURNING id \gset paciente_
  INSERT INTO orcamentos(clinica_id, paciente_id, observacoes, status)
    VALUES (:'clinica_id', :'paciente_id', '[TESTE-FRONT-CONVERSAO]', 'aberto') RETURNING id \gset orc_
  INSERT INTO orcamento_itens(orcamento_id, procedimento_id, descricao, valor_unitario, quantidade, valor_total, status_operacional)
    VALUES (:'orc_id', :'proc_agenda', '[TESTE-FRONT-CONVERSAO]', 150, 1, 150, 'agendado') RETURNING id \gset item_
  SELECT public.converter_item_venda(:'item_id', :'caixa_id', 'dinheiro', 0);
  -- esperado: ok=true (bypass por já estar agendado)
ROLLBACK;

-- -----------------------------------------------------------
-- 5) Venda sem caixa aberto → CAIXA_FECHADO
-- -----------------------------------------------------------
BEGIN;
  -- passar caixa_sessao_id inexistente
  INSERT INTO pacientes(clinica_id, nome) VALUES (:'clinica_id', '[TESTE-FRONT-CONVERSAO] P5') RETURNING id \gset paciente_
  INSERT INTO orcamentos(clinica_id, paciente_id, observacoes, status)
    VALUES (:'clinica_id', :'paciente_id', '[TESTE-FRONT-CONVERSAO]', 'aberto') RETURNING id \gset orc_
  INSERT INTO orcamento_itens(orcamento_id, procedimento_id, descricao, valor_unitario, quantidade, valor_total)
    VALUES (:'orc_id', :'proc_venda', '[TESTE-FRONT-CONVERSAO]', 50, 1, 50) RETURNING id \gset item_
  SELECT public.converter_item_venda(:'item_id', gen_random_uuid(), 'dinheiro', 0);
  -- esperado: codigo='CAIXA_FECHADO'
ROLLBACK;

-- -----------------------------------------------------------
-- 6) Agendamento com agenda_obrigatoria=false → aguardando_agendamento (sem row em agendamentos)
-- -----------------------------------------------------------
BEGIN;
  INSERT INTO pacientes(clinica_id, nome) VALUES (:'clinica_id', '[TESTE-FRONT-CONVERSAO] P6') RETURNING id \gset paciente_
  INSERT INTO orcamentos(clinica_id, paciente_id, observacoes, status)
    VALUES (:'clinica_id', :'paciente_id', '[TESTE-FRONT-CONVERSAO]', 'aberto') RETURNING id \gset orc_
  INSERT INTO orcamento_itens(orcamento_id, procedimento_id, descricao, valor_unitario, quantidade, valor_total)
    VALUES (:'orc_id', :'proc_venda', '[TESTE-FRONT-CONVERSAO]', 60, 1, 60) RETURNING id \gset item_
  SELECT public.converter_item_agendamento(:'item_id', '{}'::jsonb);
  -- esperado: status_operacional='aguardando_agendamento', 0 rows em agendamentos
  SELECT status_operacional FROM orcamento_itens WHERE id=:'item_id';
ROLLBACK;

-- -----------------------------------------------------------
-- 7) agenda_obrigatoria=true + medico_obrigatorio=true sem medico_id → MEDICO_OBRIGATORIO
-- -----------------------------------------------------------
BEGIN;
  INSERT INTO pacientes(clinica_id, nome) VALUES (:'clinica_id', '[TESTE-FRONT-CONVERSAO] P7') RETURNING id \gset paciente_
  INSERT INTO orcamentos(clinica_id, paciente_id, observacoes, status)
    VALUES (:'clinica_id', :'paciente_id', '[TESTE-FRONT-CONVERSAO]', 'aberto') RETURNING id \gset orc_
  INSERT INTO orcamento_itens(orcamento_id, procedimento_id, descricao, valor_unitario, quantidade, valor_total)
    VALUES (:'orc_id', :'proc_agenda', '[TESTE-FRONT-CONVERSAO]', 150, 1, 150) RETURNING id \gset item_
  SELECT public.converter_item_agendamento(:'item_id',
    jsonb_build_object('data','2026-12-01','hora','10:00'));
  -- esperado: codigo='MEDICO_OBRIGATORIO' (se proc_agenda tiver medico_obrigatorio=true)
ROLLBACK;

-- -----------------------------------------------------------
-- 8) equipamento_obrigatorio=true sem enfermagem_recurso_id → EQUIPAMENTO_OBRIGATORIO
-- -----------------------------------------------------------
-- similar ao 7, use um procedimento configurado com equipamento_obrigatorio=true.

-- -----------------------------------------------------------
-- 9) sala_obrigatoria=true sem sala → SALA_OBRIGATORIA
-- -----------------------------------------------------------
-- similar ao 7, use um procedimento configurado com sala_obrigatoria=true.

-- -----------------------------------------------------------
-- 10) Override por unidade (procedimento_unidade_regras)
-- -----------------------------------------------------------
-- pré-req: INSERT em procedimento_unidade_regras com agenda_obrigatoria=true
--          para o proc_venda naquela :unidade_id.
-- Chame converter_item_agendamento passando unidade_id no payload e valide
-- que agora exige agenda mesmo o base sendo permite_venda_direta=true.

-- -----------------------------------------------------------
-- 11) Reconversão idempotente
-- -----------------------------------------------------------
BEGIN;
  -- 1ª chamada: OK; 2ª: ITEM_JA_AGENDADO
  SELECT public.converter_item_agendamento(:'item_id', '{}'::jsonb);
  SELECT public.converter_item_agendamento(:'item_id', '{}'::jsonb);
ROLLBACK;

-- -----------------------------------------------------------
-- 12) cancelar_item sem confirmar → requer_confirmacao=true
-- -----------------------------------------------------------
SELECT public.cancelar_item(:'item_id', '[TESTE-FRONT-CONVERSAO]', false);

-- -----------------------------------------------------------
-- 13) cancelar_item confirmado → cascata cancela agendamento
-- -----------------------------------------------------------
SELECT public.cancelar_item(:'item_id', '[TESTE-FRONT-CONVERSAO]', true);

-- -----------------------------------------------------------
-- 14) Cancelar agendamento já realizado → AGENDAMENTO_JA_REALIZADO
-- -----------------------------------------------------------
-- pré-req: manualmente marcar agendamentos.status='realizado' e tentar cancelar

-- -----------------------------------------------------------
-- 15) Cancelar item pago → aviso_pagamento; Fin permanece 'pago'
-- -----------------------------------------------------------
SELECT public.cancelar_item(:'item_id', '[TESTE-FRONT-CONVERSAO]', true);
SELECT status_financeiro FROM orcamento_itens WHERE id=:'item_id';

-- -----------------------------------------------------------
-- 16) Trigger dual-status: orçamento vira 'finalizado' quando todos itens têm Op+Fin resolvidos
-- -----------------------------------------------------------
SELECT status FROM orcamentos WHERE id=:'orc_id';

-- -----------------------------------------------------------
-- 17) NFS-e por_item (default): 3 itens pagos → 3 rows em nfse
-- -----------------------------------------------------------
-- setar clinicas.nfse_modo_emissao='por_item' e chamar emitir_nfse_orcamento

-- -----------------------------------------------------------
-- 18) NFS-e agrupada: 3 itens pagos → 1 row em nfse com orcamento_id
-- -----------------------------------------------------------
-- setar clinicas.nfse_modo_emissao='agrupada' e chamar emitir_nfse_orcamento
SELECT public.emitir_nfse_orcamento(:'orc_id');
SELECT count(*) AS n_nfse FROM nfse WHERE orcamento_id=:'orc_id';
SELECT count(*) AS n_fin FROM fin_atendimentos WHERE nfse_id=(SELECT id FROM nfse WHERE orcamento_id=:'orc_id' LIMIT 1);

-- -----------------------------------------------------------
-- 19) NFS-e agrupada com item não pago → NFSE_ITENS_PENDENTES
-- -----------------------------------------------------------

-- -----------------------------------------------------------
-- 20) audit_log grava merge de regras usado
-- -----------------------------------------------------------
SELECT count(*) FROM audit_log WHERE payload_depois::text LIKE '%[TESTE-FRONT-CONVERSAO]%'
   OR payload_depois::text LIKE '%converter_item_venda%';

-- ============================================================
-- CLEANUP FINAL — remove todos os resíduos [TESTE-FRONT-CONVERSAO]
-- ============================================================
DELETE FROM audit_log
 WHERE payload_depois::text LIKE '%[TESTE-FRONT-CONVERSAO]%'
    OR payload_antes::text LIKE '%[TESTE-FRONT-CONVERSAO]%';
DELETE FROM nfse WHERE orcamento_id IN
  (SELECT id FROM orcamentos WHERE observacoes LIKE '%[TESTE-FRONT-CONVERSAO]%');
DELETE FROM caixa_movimentos WHERE descricao LIKE '%[TESTE-FRONT-CONVERSAO]%';
DELETE FROM fin_atendimentos WHERE observacoes LIKE '%[TESTE-FRONT-CONVERSAO]%'
   OR orcamento_item_id IN
   (SELECT id FROM orcamento_itens WHERE descricao LIKE '%[TESTE-FRONT-CONVERSAO]%');
DELETE FROM agendamentos WHERE orcamento_item_id IN
  (SELECT id FROM orcamento_itens WHERE descricao LIKE '%[TESTE-FRONT-CONVERSAO]%');
DELETE FROM orcamento_itens WHERE descricao LIKE '%[TESTE-FRONT-CONVERSAO]%';
DELETE FROM orcamentos WHERE observacoes LIKE '%[TESTE-FRONT-CONVERSAO]%';
DELETE FROM pacientes WHERE nome LIKE '%[TESTE-FRONT-CONVERSAO]%';