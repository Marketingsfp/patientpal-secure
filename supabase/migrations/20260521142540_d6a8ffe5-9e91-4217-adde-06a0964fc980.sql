ALTER TABLE public.pacientes ADD COLUMN sexo text NOT NULL DEFAULT 'nao_informar';
ALTER TABLE public.medicos ADD COLUMN sexo text NOT NULL DEFAULT 'nao_informar';
ALTER TABLE public.hr_contratos ADD COLUMN sexo text NOT NULL DEFAULT 'nao_informar';

ALTER TABLE public.pacientes ADD CONSTRAINT pacientes_sexo_chk CHECK (sexo IN ('masculino','feminino','outro','nao_informar'));
ALTER TABLE public.medicos ADD CONSTRAINT medicos_sexo_chk CHECK (sexo IN ('masculino','feminino','outro','nao_informar'));
ALTER TABLE public.hr_contratos ADD CONSTRAINT hr_contratos_sexo_chk CHECK (sexo IN ('masculino','feminino','outro','nao_informar'));