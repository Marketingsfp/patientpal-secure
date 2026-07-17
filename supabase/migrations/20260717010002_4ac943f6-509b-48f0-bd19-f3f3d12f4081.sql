
ALTER TABLE public.orcamento_itens
  ADD COLUMN IF NOT EXISTS dentes smallint[] NULL;

ALTER TABLE public.orcamento_itens
  ADD CONSTRAINT orcamento_itens_dentes_len_chk
  CHECK (dentes IS NULL OR (array_length(dentes,1) BETWEEN 1 AND 32));

ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS especialidade_id uuid NULL REFERENCES public.especialidades(id);

CREATE INDEX IF NOT EXISTS orcamentos_especialidade_paciente_idx
  ON public.orcamentos (clinica_id, paciente_id)
  WHERE especialidade_id IS NOT NULL;
