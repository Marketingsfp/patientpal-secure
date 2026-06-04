
-- Merge "JOAO HELIO VALENTIM EXAMES" (source) into "JOAO HELIO VALENTIM" (target)
DO $$
DECLARE
  src uuid := '22900717-d1b9-4fb1-b944-b4ebe87dfb7a';
  dst uuid := '728baa3b-5725-4f43-aac1-57505ab8d723';
BEGIN
  -- medico_procedimentos: move only those not duplicating (medico_id, procedimento_id, especialidade_id)
  DELETE FROM medico_procedimentos s
  WHERE s.medico_id = src
    AND EXISTS (
      SELECT 1 FROM medico_procedimentos d
      WHERE d.medico_id = dst
        AND d.procedimento_id IS NOT DISTINCT FROM s.procedimento_id
        AND d.especialidade_id IS NOT DISTINCT FROM s.especialidade_id
    );
  UPDATE medico_procedimentos SET medico_id = dst WHERE medico_id = src;

  -- medico_especialidades (pk medico_id, especialidade_id)
  DELETE FROM medico_especialidades s
  WHERE s.medico_id = src
    AND EXISTS (SELECT 1 FROM medico_especialidades d WHERE d.medico_id = dst AND d.especialidade_id = s.especialidade_id);
  UPDATE medico_especialidades SET medico_id = dst WHERE medico_id = src;

  -- medico_agendas (unique medico_id, lower(nome)): rename duplicates with suffix
  UPDATE medico_agendas
    SET nome = nome || ' (EXAMES)'
  WHERE medico_id = src
    AND EXISTS (SELECT 1 FROM medico_agendas d WHERE d.medico_id = dst AND lower(d.nome) = lower(medico_agendas.nome));
  UPDATE medico_agendas SET medico_id = dst WHERE medico_id = src;

  -- Other tables: simple repoint
  UPDATE agendamentos              SET medico_id = dst WHERE medico_id = src;
  UPDATE documentos_emitidos       SET medico_id = dst WHERE medico_id = src;
  UPDATE fin_atendimentos          SET medico_id = dst WHERE medico_id = src;
  UPDATE fin_lancamentos           SET medico_id = dst WHERE medico_id = src;
  UPDATE medico_biometria          SET medico_id = dst WHERE medico_id = src;
  UPDATE medico_convenios          SET medico_id = dst WHERE medico_id = src;
  UPDATE medico_disponibilidades   SET medico_id = dst WHERE medico_id = src;
  UPDATE nfse                      SET medico_id = dst WHERE medico_id = src;
  UPDATE orcamentos                SET medico_id = dst WHERE medico_id = src;
  UPDATE pagamento_splits          SET medico_id = dst WHERE medico_id = src;
  UPDATE procedimento_split_regras SET medico_id = dst WHERE medico_id = src;
  UPDATE prontuarios               SET medico_id = dst WHERE medico_id = src;
  UPDATE regras_rateio             SET medico_id = dst WHERE medico_id = src;

  -- Finally remove the duplicate doctor
  DELETE FROM medicos WHERE id = src;
END $$;
