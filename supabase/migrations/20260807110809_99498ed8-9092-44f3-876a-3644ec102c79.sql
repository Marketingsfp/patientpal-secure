-- 1) caixa_movimentos: valida destino_user_id como membro da mesma clínica
CREATE OR REPLACE FUNCTION public.fn_caixa_mov_valida_destino()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.destino_user_id IS NOT NULL THEN
    IF NOT public.is_member(NEW.destino_user_id, NEW.clinica_id) THEN
      RAISE EXCEPTION 'Usuário de destino não pertence a esta clínica';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_caixa_mov_valida_destino ON public.caixa_movimentos;
CREATE TRIGGER trg_caixa_mov_valida_destino
BEFORE INSERT OR UPDATE OF destino_user_id, clinica_id ON public.caixa_movimentos
FOR EACH ROW EXECUTE FUNCTION public.fn_caixa_mov_valida_destino();

-- 2) medico_biometria: INSERT apenas pelo próprio profissional ou por gestor
DROP POLICY IF EXISTS mb_insert ON public.medico_biometria;
CREATE POLICY mb_insert ON public.medico_biometria
FOR INSERT TO authenticated
WITH CHECK (
  public.can_manage_clinica(auth.uid(), clinica_id)
  OR EXISTS (
    SELECT 1 FROM public.medicos m
    WHERE m.id = medico_biometria.medico_id
      AND m.clinica_id = medico_biometria.clinica_id
      AND m.user_id = auth.uid()
  )
);