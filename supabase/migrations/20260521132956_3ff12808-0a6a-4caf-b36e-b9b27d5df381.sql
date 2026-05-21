
-- Tabela de perfis de acesso (por clínica)
CREATE TABLE public.perfis_acesso (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  chave text NOT NULL,
  nome text NOT NULL,
  descricao text,
  sistema boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, chave)
);

CREATE INDEX idx_perfis_acesso_clinica ON public.perfis_acesso(clinica_id);

ALTER TABLE public.perfis_acesso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver perfis da clínica"
ON public.perfis_acesso FOR SELECT
USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem criar perfis"
ON public.perfis_acesso FOR INSERT
WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem editar perfis"
ON public.perfis_acesso FOR UPDATE
USING (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem remover perfis não-sistema"
ON public.perfis_acesso FOR DELETE
USING (public.can_manage_clinica(auth.uid(), clinica_id) AND sistema = false);

CREATE TRIGGER trg_perfis_acesso_updated
BEFORE UPDATE ON public.perfis_acesso
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enum de nível de acesso por módulo
CREATE TYPE public.modulo_acesso AS ENUM ('none', 'read', 'write');

-- Permissões por perfil e módulo
CREATE TABLE public.perfil_permissoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  perfil_id uuid NOT NULL REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  modulo text NOT NULL,
  acesso public.modulo_acesso NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (perfil_id, modulo)
);

CREATE INDEX idx_perfil_permissoes_perfil ON public.perfil_permissoes(perfil_id);

ALTER TABLE public.perfil_permissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver permissões"
ON public.perfil_permissoes FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.perfis_acesso p
  WHERE p.id = perfil_id AND public.is_member(auth.uid(), p.clinica_id)
));

CREATE POLICY "Gestores podem criar permissões"
ON public.perfil_permissoes FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.perfis_acesso p
  WHERE p.id = perfil_id AND public.can_manage_clinica(auth.uid(), p.clinica_id)
));

CREATE POLICY "Gestores podem editar permissões"
ON public.perfil_permissoes FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.perfis_acesso p
  WHERE p.id = perfil_id AND public.can_manage_clinica(auth.uid(), p.clinica_id)
));

CREATE POLICY "Gestores podem remover permissões"
ON public.perfil_permissoes FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.perfis_acesso p
  WHERE p.id = perfil_id AND public.can_manage_clinica(auth.uid(), p.clinica_id)
));

CREATE TRIGGER trg_perfil_permissoes_updated
BEFORE UPDATE ON public.perfil_permissoes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
