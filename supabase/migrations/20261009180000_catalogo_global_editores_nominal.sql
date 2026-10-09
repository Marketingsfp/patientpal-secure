-- Catálogos globais (especialidades e tipos de serviço): edição por lista
-- nominal, não por cargo.
--
-- Esses cadastros não têm clinica_id — valem para todas as unidades. Até aqui
-- qualquer admin/gestor de QUALQUER clínica podia criar, renomear e desativar
-- (20260903150416). Em 09/10/2026 a desativação de 9 especialidades feita na
-- São Francisco sumiu com elas também na Menino Jesus. Decisão do dono:
-- só as pessoas desta lista mexem no catálogo global; os demais gestores
-- continuam editando serviços e valores da própria unidade normalmente.
--
-- Excluir continua restrito ao administrador da plataforma (sem mudança).
-- Para incluir/retirar alguém: insert/delete em catalogo_global_editores.

CREATE TABLE IF NOT EXISTS public.catalogo_global_editores (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.catalogo_global_editores ENABLE ROW LEVEL SECURITY;

-- Cada um vê a própria linha; a plataforma vê todas. Sem políticas de escrita:
-- a lista só muda por SQL.
DROP POLICY IF EXISTS catalogo_global_editores_select ON public.catalogo_global_editores;
CREATE POLICY catalogo_global_editores_select ON public.catalogo_global_editores
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.pode_editar_catalogo_global(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_platform_admin(_user_id)
      OR EXISTS (SELECT 1 FROM public.catalogo_global_editores WHERE user_id = _user_id)
$$;

REVOKE ALL ON FUNCTION public.pode_editar_catalogo_global(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pode_editar_catalogo_global(uuid) TO authenticated, service_role;

-- especialidades
DROP POLICY IF EXISTS especialidades_manager_insert ON public.especialidades;
DROP POLICY IF EXISTS especialidades_manager_update ON public.especialidades;
DROP POLICY IF EXISTS especialidades_catalogo_insert ON public.especialidades;
DROP POLICY IF EXISTS especialidades_catalogo_update ON public.especialidades;
CREATE POLICY especialidades_catalogo_insert ON public.especialidades
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_editar_catalogo_global(auth.uid()));
CREATE POLICY especialidades_catalogo_update ON public.especialidades
  FOR UPDATE TO authenticated
  USING (public.pode_editar_catalogo_global(auth.uid()))
  WITH CHECK (public.pode_editar_catalogo_global(auth.uid()));

-- tipos_servico
DROP POLICY IF EXISTS tipos_servico_manager_insert ON public.tipos_servico;
DROP POLICY IF EXISTS tipos_servico_manager_update ON public.tipos_servico;
DROP POLICY IF EXISTS tipos_servico_catalogo_insert ON public.tipos_servico;
DROP POLICY IF EXISTS tipos_servico_catalogo_update ON public.tipos_servico;
CREATE POLICY tipos_servico_catalogo_insert ON public.tipos_servico
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_editar_catalogo_global(auth.uid()));
CREATE POLICY tipos_servico_catalogo_update ON public.tipos_servico
  FOR UPDATE TO authenticated
  USING (public.pode_editar_catalogo_global(auth.uid()))
  WITH CHECK (public.pode_editar_catalogo_global(auth.uid()));

-- Lista inicial (09/10/2026), definida pelo dono.
INSERT INTO public.catalogo_global_editores (user_id, observacao)
SELECT u.id, 'lista inicial 09/10/2026'
FROM auth.users u
WHERE u.email IN (
  'quedimapsfp@gmail.com',
  'michelle.meninojesus@gmail.com',
  'jeanpsfp@gmail.com',
  'jpnevespsfp@gmail.com',
  'rodrigorss2301@gmail.com'
)
ON CONFLICT (user_id) DO NOTHING;
