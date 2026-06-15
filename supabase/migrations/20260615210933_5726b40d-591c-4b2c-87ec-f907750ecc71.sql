CREATE INDEX IF NOT EXISTS _mj_import_csv_chave ON public._mj_import_csv (chave);
CREATE INDEX IF NOT EXISTS _mj_import_csv_cpfd ON public._mj_import_csv (REGEXP_REPLACE(COALESCE(cpf_cnpj,''),'[^0-9]','','g'));
CREATE INDEX IF NOT EXISTS _mj_import_csv_nomeu ON public._mj_import_csv (UPPER(BTRIM(nome)));
CREATE INDEX IF NOT EXISTS pacientes_clinica_cpfd ON public.pacientes (clinica_id, cpf_digits);
CREATE INDEX IF NOT EXISTS pacientes_clinica_nomeu ON public.pacientes (clinica_id, UPPER(BTRIM(nome)));