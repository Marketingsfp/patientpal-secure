DO $$
DECLARE
  pairs jsonb := '[
    {"old":"3f50d675-a2f7-4816-97fd-013c8df58e9b","new":"4f20eed9-f599-4602-b52e-872e445bde50"},
    {"old":"c433ba00-1888-427e-a5f4-f6aa008c54bb","new":"187c6172-32c6-4a32-a1a0-bcc462ae53b3"},
    {"old":"260667f8-3f06-4911-a0ba-c8275ea22dbb","new":"187c6172-32c6-4a32-a1a0-bcc462ae53b3"}
  ]'::jsonb;
  p jsonb;
  old_id uuid;
  new_id uuid;
BEGIN
  FOR p IN SELECT * FROM jsonb_array_elements(pairs) LOOP
    old_id := (p->>'old')::uuid;
    new_id := (p->>'new')::uuid;

    -- Junction tables: remover duplicatas antes de migrar
    DELETE FROM public.medico_especialidades me1
      WHERE me1.medico_id = old_id
        AND EXISTS (SELECT 1 FROM public.medico_especialidades me2
                    WHERE me2.medico_id = new_id AND me2.especialidade_id = me1.especialidade_id);
    UPDATE public.medico_especialidades SET medico_id = new_id WHERE medico_id = old_id;

    DELETE FROM public.medico_procedimentos mp1
      WHERE mp1.medico_id = old_id
        AND EXISTS (SELECT 1 FROM public.medico_procedimentos mp2
                    WHERE mp2.medico_id = new_id AND mp2.procedimento_id = mp1.procedimento_id);
    UPDATE public.medico_procedimentos SET medico_id = new_id WHERE medico_id = old_id;

    DELETE FROM public.medico_convenios mc1
      WHERE mc1.medico_id = old_id
        AND EXISTS (SELECT 1 FROM public.medico_convenios mc2
                    WHERE mc2.medico_id = new_id AND lower(mc2.nome) = lower(mc1.nome));
    UPDATE public.medico_convenios SET medico_id = new_id WHERE medico_id = old_id;

    -- Demais tabelas
    UPDATE public.agendamentos SET medico_id = new_id WHERE medico_id = old_id;
    UPDATE public.documentos_emitidos SET medico_id = new_id WHERE medico_id = old_id;
    UPDATE public.fin_atendimentos SET medico_id = new_id WHERE medico_id = old_id;
    UPDATE public.fin_lancamentos SET medico_id = new_id WHERE medico_id = old_id;
    UPDATE public.medico_biometria SET medico_id = new_id WHERE medico_id = old_id;
    UPDATE public.medico_disponibilidades SET medico_id = new_id WHERE medico_id = old_id;
    UPDATE public.nfse SET medico_id = new_id WHERE medico_id = old_id;
    UPDATE public.orcamentos SET medico_id = new_id WHERE medico_id = old_id;
    UPDATE public.pagamento_splits SET medico_id = new_id WHERE medico_id = old_id;
    UPDATE public.procedimento_split_regras SET medico_id = new_id WHERE medico_id = old_id;
    UPDATE public.prontuarios SET medico_id = new_id WHERE medico_id = old_id;
    UPDATE public.regras_rateio SET medico_id = new_id WHERE medico_id = old_id;

    DELETE FROM public.medicos WHERE id = old_id;
  END LOOP;
END $$;