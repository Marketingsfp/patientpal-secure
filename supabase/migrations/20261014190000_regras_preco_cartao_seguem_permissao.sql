-- Regras de preço do Cartão Benefícios passam a ter permissão própria
-- ============================================================================
--
-- PROBLEMA
-- cb_convenio_regras (regras de preço e exceções de cada convênio) ficou de
-- fora da migration 20260827120000_cartao_beneficios_segue_matriz_de_perfis:
-- INSERT/UPDATE/DELETE continuam exigindo can_manage_clinica (admin/gestor).
-- Não há como dar a uma pessoa de outro perfil (ex.: um perfil customizado
-- CARTÃO BENEFÍCIOS) o poder de ajustar preço, e o RLS recusa o UPDATE sem
-- erro — a tela dizia "Regra atualizada" sem gravar nada.
--
-- POR QUE UMA PERMISSÃO SEPARADA (e não 'cartao-beneficios')
-- Na matriz gravada em produção, o CAIXA e a RECEPÇÃO estão com Edição em
-- 'cartao-beneficios' (ver 20260827120000). Reaproveitar essa chave daria a
-- todos eles o poder de mudar o preço do convênio. A chave nova
-- 'cartao-beneficios-precos' nasce sem linha para nenhum perfil — sem linha,
-- pode_escrever_modulo responde falso —, então ninguém ganha acesso até o
-- gestor marcar Edição na tela Perfis de Acesso (decisão do dono, 14/10/2026).
--
-- O QUE MUDA NA PRÁTICA
--   admin / gestor  -> sem mudança (can_manage_clinica continua valendo)
--   demais perfis   -> sem mudança até alguém ganhar a permissão nova
--   perfil com 'cartao-beneficios-precos' = Edição -> cria, altera e exclui
--                      regras e exceções de preço da própria unidade
-- SELECT não muda (is_member).
--
-- Perfil customizado só é reconhecido por pode_escrever_modulo depois da
-- migration 20261014180000_perfis_acesso_customizados. Sem ela, esta aqui
-- funciona igual para os perfis de sistema.
--
-- Idempotente: pode ser rodada mais de uma vez.
--
-- Rollback (volta a admin/gestor):
--   recriar as três políticas abaixo só com can_manage_clinica(auth.uid(), clinica_id)
--   (definição original em 20260602131116_f19b5d72-....sql).
-- ============================================================================

DROP POLICY IF EXISTS "cb_convenio_regras_insert" ON public.cb_convenio_regras;
CREATE POLICY "cb_convenio_regras_insert" ON public.cb_convenio_regras
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_clinica(auth.uid(), clinica_id)
    OR public.pode_escrever_modulo(auth.uid(), clinica_id, ARRAY['cartao-beneficios-precos'])
  );

-- WITH CHECK explícito: sem ele, quem pode editar a regra numa unidade
-- conseguiria trocar o clinica_id dela para outra.
DROP POLICY IF EXISTS "cb_convenio_regras_update" ON public.cb_convenio_regras;
CREATE POLICY "cb_convenio_regras_update" ON public.cb_convenio_regras
  FOR UPDATE TO authenticated
  USING (
    public.can_manage_clinica(auth.uid(), clinica_id)
    OR public.pode_escrever_modulo(auth.uid(), clinica_id, ARRAY['cartao-beneficios-precos'])
  )
  WITH CHECK (
    public.can_manage_clinica(auth.uid(), clinica_id)
    OR public.pode_escrever_modulo(auth.uid(), clinica_id, ARRAY['cartao-beneficios-precos'])
  );

DROP POLICY IF EXISTS "cb_convenio_regras_delete" ON public.cb_convenio_regras;
CREATE POLICY "cb_convenio_regras_delete" ON public.cb_convenio_regras
  FOR DELETE TO authenticated
  USING (
    public.can_manage_clinica(auth.uid(), clinica_id)
    OR public.pode_escrever_modulo(auth.uid(), clinica_id, ARRAY['cartao-beneficios-precos'])
  );
