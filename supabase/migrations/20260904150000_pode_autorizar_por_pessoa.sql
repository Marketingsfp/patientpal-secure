-- ============================================================================
-- AUTORIZAR ISENÇÕES E DESCONTOS VIRA PERMISSÃO INDIVIDUAL
-- ============================================================================
-- Até aqui, quem podia autorizar um desconto ou uma isenção era decidido pelo
-- PERFIL DE ACESSO: qualquer "admin", "gestor" ou "supervisor" autorizava — e,
-- por ter perfil com alçada, autorizava sozinho, sem nem ver o pedido de senha.
--
-- Na prática isso não é controle nenhum nesta clínica: são 30 pessoas com
-- perfil de administrador na Policlínica Menino Jesus, porque o perfil também
-- é o que dá acesso às telas administrativas. Rebaixar essas pessoas para
-- resolver a alçada tiraria delas telas que usam no dia a dia.
--
-- Por isso a autorização passa a ser uma permissão PRÓPRIA, marcada pessoa a
-- pessoa (`pode_autorizar`), independente do perfil de acesso. Quem não tem a
-- marcação continua com o mesmo acesso de sempre; o que muda é que, para
-- isentar um atendimento ou aplicar desconto, passa a precisar da senha de
-- quem tem.
--
-- ESTADO INICIAL (decidido pela diretoria):
--   - Policlínica Menino Jesus: apenas LUAN CARLOS DE OLIVEIRA e TANIA MARIA
--     DE OLIVEIRA RODRIGUES.
--   - Demais clínicas: os administradores que já existem, para que nenhuma
--     unidade fique sem ninguém capaz de autorizar. A diretoria ajusta depois
--     pela tela de Equipe.
-- ============================================================================

BEGIN;

ALTER TABLE public.clinica_memberships
  ADD COLUMN IF NOT EXISTS pode_autorizar boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clinica_memberships.pode_autorizar IS
  'Pode autorizar isenções (sem faturamento), descontos e cortesias com a própria senha. É permissão individual, independente do perfil de acesso: um administrador sem esta marcação continua com todo o acesso dele, mas precisa chamar quem tem para autorizar.';

-- ---------------------------------------------------------------------------
-- Estado inicial
-- ---------------------------------------------------------------------------
-- 1) Luan e Tânia, onde tiverem vínculo ativo com perfil de alçada.
UPDATE public.clinica_memberships cm
SET pode_autorizar = true
FROM public.profiles p
WHERE p.id = cm.user_id
  AND cm.ativo
  AND cm.role IN ('admin', 'gestor', 'supervisor')
  AND (
    UPPER(p.nome) = 'LUAN CARLOS DE OLIVEIRA'
    OR UPPER(p.nome) = 'TANIA MARIA DE OLIVEIRA RODRIGUES'
  );

-- 2) Clínicas que ficariam sem NINGUÉM para autorizar continuam como estão
--    hoje: todos os administradores ativos delas seguem podendo. Sem esta
--    parte, uma unidade onde o Luan e a Tânia não têm vínculo ficaria sem
--    conseguir aplicar um desconto sequer.
UPDATE public.clinica_memberships cm
SET pode_autorizar = true
WHERE cm.ativo
  AND cm.role IN ('admin', 'gestor', 'supervisor')
  AND NOT EXISTS (
    SELECT 1
    FROM public.clinica_memberships outro
    WHERE outro.clinica_id = cm.clinica_id
      AND outro.ativo
      AND outro.pode_autorizar
  );

COMMIT;
