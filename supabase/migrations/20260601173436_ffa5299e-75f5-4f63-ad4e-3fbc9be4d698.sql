DO $$
DECLARE
  pares uuid[][] := ARRAY[
    ARRAY['36b6264b-c392-4ab1-ad1f-872f3aaee1b3'::uuid, '01ab8216-6432-47c7-9189-4d30612739f7'::uuid],
    ARRAY['20de963c-fc33-4955-be76-8a17e1d76bb5'::uuid, '112e887b-c800-4900-8f23-63683a069b73'::uuid],
    ARRAY['de5c99cc-ecb4-4615-bca1-89af33942fd3'::uuid, '9f9f5879-dc4c-4cdd-aafb-73b30635dc0e'::uuid],
    ARRAY['b37f771e-d78f-4a2a-9d47-562074c15f58'::uuid, 'd18b8c51-e9f1-4af1-932c-e35d00d902d9'::uuid]
  ];
  par uuid[];
  velho uuid;
  novo uuid;
BEGIN
  FOREACH par SLICE 1 IN ARRAY pares LOOP
    velho := par[1];
    novo  := par[2];

    DELETE FROM public.medico_especialidades me
     WHERE me.medico_id = velho
       AND EXISTS (SELECT 1 FROM public.medico_especialidades me2
                    WHERE me2.medico_id = novo AND me2.especialidade_id = me.especialidade_id);
    UPDATE public.medico_especialidades SET medico_id = novo WHERE medico_id = velho;

    DELETE FROM public.medico_procedimentos mp
     WHERE mp.medico_id = velho
       AND EXISTS (SELECT 1 FROM public.medico_procedimentos mp2
                    WHERE mp2.medico_id = novo AND mp2.procedimento_id = mp.procedimento_id);
    UPDATE public.medico_procedimentos SET medico_id = novo WHERE medico_id = velho;

    DELETE FROM public.medico_convenios mc
     WHERE mc.medico_id = velho
       AND EXISTS (SELECT 1 FROM public.medico_convenios mc2
                    WHERE mc2.medico_id = novo AND lower(mc2.nome) = lower(mc.nome));
    UPDATE public.medico_convenios SET medico_id = novo WHERE medico_id = velho;

    UPDATE public.agendamentos              SET medico_id = novo WHERE medico_id = velho;
    UPDATE public.documentos_emitidos       SET medico_id = novo WHERE medico_id = velho;
    UPDATE public.fin_atendimentos          SET medico_id = novo WHERE medico_id = velho;
    UPDATE public.fin_lancamentos           SET medico_id = novo WHERE medico_id = velho;
    UPDATE public.medico_biometria          SET medico_id = novo WHERE medico_id = velho;
    UPDATE public.medico_disponibilidades   SET medico_id = novo WHERE medico_id = velho;
    UPDATE public.nfse                      SET medico_id = novo WHERE medico_id = velho;
    UPDATE public.orcamentos                SET medico_id = novo WHERE medico_id = velho;
    UPDATE public.pagamento_splits          SET medico_id = novo WHERE medico_id = velho;
    UPDATE public.procedimento_split_regras SET medico_id = novo WHERE medico_id = velho;
    UPDATE public.prontuarios               SET medico_id = novo WHERE medico_id = velho;
    UPDATE public.regras_rateio             SET medico_id = novo WHERE medico_id = velho;

    DELETE FROM public.medicos WHERE id = velho;
  END LOOP;
END$$;