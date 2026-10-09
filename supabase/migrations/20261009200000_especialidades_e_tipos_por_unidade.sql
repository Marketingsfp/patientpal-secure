-- Especialidades e tipos de serviço: ativo/inativo POR UNIDADE.
--
-- Os nomes continuam numa lista única (especialidades / tipos_servico), mas
-- quem decide se aparece numa unidade é a própria unidade. Decisão do dono em
-- 09/10/2026: "as duas são clínicas diferentes e nada pode afetar uma a outra".
--
--   * Ligar/desligar: especialidade_unidade / tipo_servico_unidade, por
--     clinica_id. Gestor da unidade decide só a dele.
--   * Nome novo nasce ligado só na unidade que criou (a tela grava a linha).
--     Sem linha = não aparece naquela unidade.
--   * O "ativo" da lista única só muda pela plataforma — antes, desativar ali
--     sumia com a especialidade nas duas unidades.
--   * Renomear fica bloqueado quando o nome é usado/ligado em mais de uma
--     unidade (o gatilho de renomear reescreve os serviços pelo nome).
--
-- Histórico (agendamentos, orçamentos, rateio) não é tocado.

-- ---------------------------------------------------------------------------
-- 1. Tabelas por unidade
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.especialidade_unidade (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  especialidade_id uuid NOT NULL REFERENCES public.especialidades(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinica_id, especialidade_id)
);

CREATE TABLE IF NOT EXISTS public.tipo_servico_unidade (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  tipo_servico_id uuid NOT NULL REFERENCES public.tipos_servico(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinica_id, tipo_servico_id)
);

DROP TRIGGER IF EXISTS trg_especialidade_unidade_updated ON public.especialidade_unidade;
CREATE TRIGGER trg_especialidade_unidade_updated
  BEFORE UPDATE ON public.especialidade_unidade
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_tipo_servico_unidade_updated ON public.tipo_servico_unidade;
CREATE TRIGGER trg_tipo_servico_unidade_updated
  BEFORE UPDATE ON public.tipo_servico_unidade
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Situação por unidade não é dado sensível (a lista de nomes já é pública);
-- leitura aberta para não quebrar Nina/integrações que leem sem usuário.
ALTER TABLE public.especialidade_unidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipo_servico_unidade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS especialidade_unidade_select ON public.especialidade_unidade;
CREATE POLICY especialidade_unidade_select ON public.especialidade_unidade
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS especialidade_unidade_insert ON public.especialidade_unidade;
CREATE POLICY especialidade_unidade_insert ON public.especialidade_unidade
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id)
              OR public.pode_editar_catalogo_global(auth.uid()) AND public.is_member(auth.uid(), clinica_id));
DROP POLICY IF EXISTS especialidade_unidade_update ON public.especialidade_unidade;
CREATE POLICY especialidade_unidade_update ON public.especialidade_unidade
  FOR UPDATE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id)
         OR public.pode_editar_catalogo_global(auth.uid()) AND public.is_member(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id)
              OR public.pode_editar_catalogo_global(auth.uid()) AND public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS tipo_servico_unidade_select ON public.tipo_servico_unidade;
CREATE POLICY tipo_servico_unidade_select ON public.tipo_servico_unidade
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS tipo_servico_unidade_insert ON public.tipo_servico_unidade;
CREATE POLICY tipo_servico_unidade_insert ON public.tipo_servico_unidade
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id)
              OR public.pode_editar_catalogo_global(auth.uid()) AND public.is_member(auth.uid(), clinica_id));
DROP POLICY IF EXISTS tipo_servico_unidade_update ON public.tipo_servico_unidade;
CREATE POLICY tipo_servico_unidade_update ON public.tipo_servico_unidade
  FOR UPDATE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id)
         OR public.pode_editar_catalogo_global(auth.uid()) AND public.is_member(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id)
              OR public.pode_editar_catalogo_global(auth.uid()) AND public.is_member(auth.uid(), clinica_id));

-- ---------------------------------------------------------------------------
-- 2. Situação de hoje copiada para cada unidade (nada some nem aparece)
-- ---------------------------------------------------------------------------
INSERT INTO public.especialidade_unidade (clinica_id, especialidade_id, ativo)
SELECT c.id, e.id, e.ativo
FROM public.clinicas c CROSS JOIN public.especialidades e
ON CONFLICT (clinica_id, especialidade_id) DO NOTHING;

INSERT INTO public.tipo_servico_unidade (clinica_id, tipo_servico_id, ativo)
SELECT c.id, t.id, t.ativo
FROM public.clinicas c CROSS JOIN public.tipos_servico t
ON CONFLICT (clinica_id, tipo_servico_id) DO NOTHING;

-- Histórico de quem ligou/desligou (mesma auditoria das outras tabelas).
-- Criado depois da cópia inicial para não encher o log com ela.
DROP TRIGGER IF EXISTS trg_audit_especialidade_unidade ON public.especialidade_unidade;
CREATE TRIGGER trg_audit_especialidade_unidade
  AFTER INSERT OR UPDATE OR DELETE ON public.especialidade_unidade
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
DROP TRIGGER IF EXISTS trg_audit_tipo_servico_unidade ON public.tipo_servico_unidade;
CREATE TRIGGER trg_audit_tipo_servico_unidade
  AFTER INSERT OR UPDATE OR DELETE ON public.tipo_servico_unidade
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- ---------------------------------------------------------------------------
-- 3. Visões "o que está ligado nesta unidade" (usadas pelas listas de escolha)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.especialidades_da_unidade
WITH (security_invoker = true) AS
SELECT eu.clinica_id, e.id, e.nome, e.descricao, (e.ativo AND eu.ativo) AS ativo
FROM public.especialidade_unidade eu
JOIN public.especialidades e ON e.id = eu.especialidade_id;

CREATE OR REPLACE VIEW public.tipos_servico_da_unidade
WITH (security_invoker = true) AS
SELECT tu.clinica_id, t.id, t.nome, (t.ativo AND tu.ativo) AS ativo
FROM public.tipo_servico_unidade tu
JOIN public.tipos_servico t ON t.id = tu.tipo_servico_id;

GRANT SELECT ON public.especialidades_da_unidade TO anon, authenticated, service_role;
GRANT SELECT ON public.tipos_servico_da_unidade TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Travas na lista única
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.especialidades_guarda_unidades()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _unidades int;
BEGIN
  -- auth.uid() nulo = manutenção pelo servidor/SQL; segue livre.
  IF NEW.ativo IS DISTINCT FROM OLD.ativo
     AND auth.uid() IS NOT NULL
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Esta especialidade vale para todas as unidades. Para tirar só da sua, use "Desativar nesta unidade".'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.nome IS DISTINCT FROM OLD.nome THEN
    SELECT count(DISTINCT u.clinica_id) INTO _unidades FROM (
      SELECT eu.clinica_id FROM public.especialidade_unidade eu
       WHERE eu.especialidade_id = OLD.id AND eu.ativo
      UNION SELECT m.clinica_id FROM public.medicos m WHERE m.especialidade_id = OLD.id
      UNION SELECT m.clinica_id FROM public.medico_especialidades me
              JOIN public.medicos m ON m.id = me.medico_id
             WHERE me.especialidade_id = OLD.id
      UNION SELECT pe.clinica_id FROM public.procedimento_especialidades pe
             WHERE pe.especialidade_id = OLD.id
      UNION SELECT p.clinica_id FROM public.procedimentos p
             WHERE lower(p.grupo) = lower(OLD.nome)
    ) u;
    IF _unidades > 1 THEN
      RAISE EXCEPTION 'Esta especialidade está em uso em mais de uma unidade — renomear mudaria as duas. Cadastre uma especialidade nova com o nome desejado.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_especialidades_guarda_unidades ON public.especialidades;
CREATE TRIGGER trg_especialidades_guarda_unidades
  BEFORE UPDATE ON public.especialidades
  FOR EACH ROW EXECUTE FUNCTION public.especialidades_guarda_unidades();

CREATE OR REPLACE FUNCTION public.tipos_servico_guarda_unidades()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _unidades int;
BEGIN
  IF NEW.ativo IS DISTINCT FROM OLD.ativo
     AND auth.uid() IS NOT NULL
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Este tipo de serviço vale para todas as unidades. Para tirar só da sua, use "Desativar nesta unidade".'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.nome IS DISTINCT FROM OLD.nome THEN
    SELECT count(DISTINCT u.clinica_id) INTO _unidades FROM (
      SELECT tu.clinica_id FROM public.tipo_servico_unidade tu
       WHERE tu.tipo_servico_id = OLD.id AND tu.ativo
      UNION SELECT p.clinica_id FROM public.procedimentos p
             WHERE lower(p.tipo) = lower(OLD.nome)
    ) u;
    IF _unidades > 1 THEN
      RAISE EXCEPTION 'Este tipo de serviço está em uso em mais de uma unidade — renomear mudaria as duas. Cadastre um tipo novo com o nome desejado.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tipos_servico_guarda_unidades ON public.tipos_servico;
CREATE TRIGGER trg_tipos_servico_guarda_unidades
  BEFORE UPDATE ON public.tipos_servico
  FOR EACH ROW EXECUTE FUNCTION public.tipos_servico_guarda_unidades();
