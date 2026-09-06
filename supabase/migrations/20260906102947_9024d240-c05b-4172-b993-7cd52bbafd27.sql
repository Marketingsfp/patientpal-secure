DROP POLICY IF EXISTS agend_select ON public.agendamentos;
CREATE POLICY agend_select ON public.agendamentos
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));

DROP POLICY IF EXISTS conv_select ON public.atend_conversas;
CREATE POLICY conv_select ON public.atend_conversas
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));

DROP POLICY IF EXISTS ca_select ON public.contratos_assinatura;
CREATE POLICY ca_select ON public.contratos_assinatura
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));

DROP POLICY IF EXISTS procedimentos_select ON public.procedimentos;
CREATE POLICY procedimentos_select ON public.procedimentos
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));