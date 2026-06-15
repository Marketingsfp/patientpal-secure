
DO $$
DECLARE
  keeper uuid := '665a4024-0060-4361-a6b3-5a3a203153b5';
  loser  uuid := '0914b0cf-e546-4222-a8dd-6efea0ec38b3';
BEGIN
  -- Atualiza prontuarios_anteriores no keeper, incluindo numeros do loser
  UPDATE public.pacientes
  SET prontuarios_anteriores = '120251, 163858, 2654193, 44265',
      updated_at = now()
  WHERE id = keeper;

  -- Reaponta vinculos do loser para o keeper
  UPDATE public.agendamentos         SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.alertas_enfermagem   SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.anamnese_respostas   SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.atend_conversas      SET contato_paciente_id = keeper WHERE contato_paciente_id = loser;
  UPDATE public.boletos              SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.contrato_dependentes SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.contratos_assinatura SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.crm_oportunidades    SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.documentos_emitidos  SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.exame_resultados     SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.fin_atendimentos     SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.fin_lancamentos      SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.fin_notas_pacientes  SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.lgpd_consentimentos  SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.lgpd_solicitacoes    SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.mkt_envios           SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.mkt_leads            SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.nfse                 SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.odonto_dentes        SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.odonto_prontuarios   SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.orcamentos           SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.pagamentos           SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.prontuarios          SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.senhas               SET paciente_id = keeper WHERE paciente_id = loser;
  UPDATE public.triagens_enfermagem  SET paciente_id = keeper WHERE paciente_id = loser;

  -- paciente_biometria: se keeper ja tem, descarta a do loser; senao migra
  IF EXISTS (SELECT 1 FROM public.paciente_biometria WHERE paciente_id = keeper) THEN
    DELETE FROM public.paciente_biometria WHERE paciente_id = loser;
  ELSE
    UPDATE public.paciente_biometria SET paciente_id = keeper WHERE paciente_id = loser;
  END IF;

  -- Remove o cadastro duplicado
  DELETE FROM public.pacientes WHERE id = loser;
END $$;
