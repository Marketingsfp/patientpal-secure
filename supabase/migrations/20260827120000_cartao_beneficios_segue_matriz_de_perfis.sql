-- Cartão Benefícios: o banco passa a seguir a matriz de Perfis de Acesso
-- ============================================================================
--
-- PROBLEMA
-- A tela de Perfis de Acesso é a fonte de verdade do sistema: o gestor marca
-- "Edição" num módulo e o front (usePodeEscrever) libera os botões. As
-- políticas de RLS do módulo Cartão Benefícios, porém, tinham a lista de
-- cargos escrita na mão:
--
--   contratos_assinatura  INSERT/UPDATE -> lista fixa de 6 cargos
--                         DELETE        -> can_manage_clinica (admin/gestor)
--   contrato_mensalidades INSERT/UPDATE -> lista fixa de 5 cargos
--                         DELETE        -> can_manage_clinica (admin/gestor)
--   cb_convenios          INSERT/UPDATE/DELETE -> can_manage_clinica
--   cb_convenio_faixas    INSERT/UPDATE/DELETE -> can_manage_clinica
--
-- E a função estornar_lancamento_receita (botão "Reverter" da parcela paga)
-- tinha a lista de cargos direto no corpo: admin, gestor e financeiro.
--
-- Resultado: um perfil marcado como "Edição" via os botões na tela, clicava, e
-- ou tomava "Sem permissão para estornar nesta clínica", ou — pior — o
-- Postgres apagava/alterava zero linhas SEM devolver erro (é assim que RLS
-- recusa um UPDATE/DELETE). Para o usuário parecia que o sistema tinha travado.
--
-- SOLUÇÃO
-- Uma função única, public.pode_escrever_modulo, lê a mesma matriz que o front
-- lê (perfis_acesso + perfil_permissoes) e é usada por todas as políticas de
-- escrita do módulo. Mudar o acesso na tela de Perfis passa a valer nas duas
-- camadas ao mesmo tempo, sem precisar mexer em SQL de novo.
--
-- O QUE MUDA NA PRÁTICA (conforme a matriz gravada hoje)
--   caixa      cartao-beneficios = Edição -> passa a alterar, estornar,
--              reverter, excluir parcela e editar convênios/faixas
--   recepcao   cartao-beneficios = Edição -> idem
--   financeiro cartao-beneficios = Leitura, contratos = Edição -> continua
--              escrevendo em contratos/mensalidades, mas NÃO em convênios
--   gestor     Edição em ambos -> sem mudança
--   admin      sempre liberado, independente da matriz
--   medico / enfermeiro  = Nenhum -> continuam sem escrever (como já era)
--
-- ATENÇÃO: o cargo "supervisor" (1 usuário ativo) não tem linha em
-- perfis_acesso, então perde o INSERT/UPDATE que a lista fixa lhe dava. Ele já
-- não conseguia abrir a tela (o front também não acha perfil para ele), então
-- na prática nada que funcionava deixa de funcionar. Para devolver o acesso,
-- basta criar o perfil "supervisor" na tela de Perfis de Acesso.
--
-- Esta migration é idempotente: pode ser rodada mais de uma vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) A função que lê a matriz
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER porque perfis_acesso e perfil_permissoes também têm RLS —
-- sem isso a checagem entraria em recursão / devolveria falso negativo.
-- STABLE para o planner poder reusar o resultado dentro da mesma query.
CREATE OR REPLACE FUNCTION public.pode_escrever_modulo(
  _user_id uuid,
  _clinica_id uuid,
  _modulos text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinica_memberships m
    WHERE m.user_id = _user_id
      AND m.clinica_id = _clinica_id
      AND m.ativo = true
      AND (
        -- Administrador da clínica nunca depende da matriz (é quem a edita).
        m.role = 'admin'
        OR EXISTS (
          SELECT 1
          FROM public.perfis_acesso p
          JOIN public.perfil_permissoes pp ON pp.perfil_id = p.id
          WHERE p.clinica_id = m.clinica_id
            AND p.chave = m.role::text
            AND pp.modulo = ANY (_modulos)
            AND pp.acesso::text = 'write'
        )
      )
  )
$function$;

COMMENT ON FUNCTION public.pode_escrever_modulo(uuid, uuid, text[]) IS
  'True quando o cargo do usuário na clínica tem acesso "Edição" (write) em '
  'pelo menos um dos módulos informados, segundo a tela de Perfis de Acesso '
  '(perfis_acesso + perfil_permissoes). Admin sempre true. Espelha no banco a '
  'mesma regra que o front aplica em usePodeEscrever.';

REVOKE EXECUTE ON FUNCTION public.pode_escrever_modulo(uuid, uuid, text[]) FROM public;
REVOKE EXECUTE ON FUNCTION public.pode_escrever_modulo(uuid, uuid, text[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.pode_escrever_modulo(uuid, uuid, text[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) contratos_assinatura
-- ----------------------------------------------------------------------------
-- A mesma tela (ContratosPage) é aberta por duas rotas, cada uma amarrada a um
-- módulo diferente: /app/cartao-beneficios/contratos -> "cartao-beneficios" e
-- /app/contratos -> "contratos". Por isso a política aceita os dois.
DROP POLICY IF EXISTS contratos_assinatura_insert_roles ON public.contratos_assinatura;
CREATE POLICY contratos_assinatura_insert_roles
  ON public.contratos_assinatura
  FOR INSERT TO authenticated
  WITH CHECK (
    public.pode_escrever_modulo(
      auth.uid(), clinica_id, ARRAY['cartao-beneficios', 'contratos']
    )
  );

DROP POLICY IF EXISTS contratos_assinatura_update_roles ON public.contratos_assinatura;
CREATE POLICY contratos_assinatura_update_roles
  ON public.contratos_assinatura
  FOR UPDATE TO authenticated
  USING (
    public.pode_escrever_modulo(
      auth.uid(), clinica_id, ARRAY['cartao-beneficios', 'contratos']
    )
  )
  WITH CHECK (
    public.pode_escrever_modulo(
      auth.uid(), clinica_id, ARRAY['cartao-beneficios', 'contratos']
    )
  );

-- Antes: can_manage_clinica (só admin/gestor). É o DELETE que sustenta o botão
-- "Cancelar contrato"/limpeza de contrato duplicado.
DROP POLICY IF EXISTS ca_delete ON public.contratos_assinatura;
CREATE POLICY ca_delete
  ON public.contratos_assinatura
  FOR DELETE TO authenticated
  USING (
    public.pode_escrever_modulo(
      auth.uid(), clinica_id, ARRAY['cartao-beneficios', 'contratos']
    )
  );

-- ----------------------------------------------------------------------------
-- 3) contrato_mensalidades
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS contrato_mensalidades_insert_roles ON public.contrato_mensalidades;
CREATE POLICY contrato_mensalidades_insert_roles
  ON public.contrato_mensalidades
  FOR INSERT TO authenticated
  WITH CHECK (
    public.pode_escrever_modulo(
      auth.uid(), clinica_id, ARRAY['cartao-beneficios', 'contratos']
    )
  );

DROP POLICY IF EXISTS contrato_mensalidades_update_roles ON public.contrato_mensalidades;
CREATE POLICY contrato_mensalidades_update_roles
  ON public.contrato_mensalidades
  FOR UPDATE TO authenticated
  USING (
    public.pode_escrever_modulo(
      auth.uid(), clinica_id, ARRAY['cartao-beneficios', 'contratos']
    )
  )
  WITH CHECK (
    public.pode_escrever_modulo(
      auth.uid(), clinica_id, ARRAY['cartao-beneficios', 'contratos']
    )
  );

-- Antes: can_manage_clinica. Era este o DELETE que apagava zero linhas em
-- silêncio no botão "Excluir parcela" e ao regerar as 12 parcelas de um
-- contrato retroativo.
DROP POLICY IF EXISTS cm_delete ON public.contrato_mensalidades;
CREATE POLICY cm_delete
  ON public.contrato_mensalidades
  FOR DELETE TO authenticated
  USING (
    public.pode_escrever_modulo(
      auth.uid(), clinica_id, ARRAY['cartao-beneficios', 'contratos']
    )
  );

-- ----------------------------------------------------------------------------
-- 4) cb_convenios (aba "Convênios" do Cartão Benefícios)
-- ----------------------------------------------------------------------------
-- Esta aba só existe dentro do módulo cartao-beneficios, então não herda
-- "contratos".
DROP POLICY IF EXISTS "Gestores podem criar convenios"     ON public.cb_convenios;
DROP POLICY IF EXISTS "Perfis com edicao criam convenios"  ON public.cb_convenios;
CREATE POLICY "Perfis com edicao criam convenios"
  ON public.cb_convenios
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_escrever_modulo(auth.uid(), clinica_id, ARRAY['cartao-beneficios']));

DROP POLICY IF EXISTS "Gestores podem atualizar convenios"    ON public.cb_convenios;
DROP POLICY IF EXISTS "Perfis com edicao atualizam convenios" ON public.cb_convenios;
CREATE POLICY "Perfis com edicao atualizam convenios"
  ON public.cb_convenios
  FOR UPDATE TO authenticated
  USING (public.pode_escrever_modulo(auth.uid(), clinica_id, ARRAY['cartao-beneficios']))
  WITH CHECK (public.pode_escrever_modulo(auth.uid(), clinica_id, ARRAY['cartao-beneficios']));

DROP POLICY IF EXISTS "Gestores podem excluir convenios"    ON public.cb_convenios;
DROP POLICY IF EXISTS "Perfis com edicao excluem convenios" ON public.cb_convenios;
CREATE POLICY "Perfis com edicao excluem convenios"
  ON public.cb_convenios
  FOR DELETE TO authenticated
  USING (public.pode_escrever_modulo(auth.uid(), clinica_id, ARRAY['cartao-beneficios']));

-- ----------------------------------------------------------------------------
-- 5) cb_convenio_faixas (as faixas de preço de cada convênio)
-- ----------------------------------------------------------------------------
-- A tabela não tem clinica_id própria: a clínica vem do convênio dono da faixa.
DROP POLICY IF EXISTS "Gestores inserem faixas" ON public.cb_convenio_faixas;
DROP POLICY IF EXISTS "Perfis com edicao inserem faixas" ON public.cb_convenio_faixas;
CREATE POLICY "Perfis com edicao inserem faixas"
  ON public.cb_convenio_faixas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cb_convenios c
      WHERE c.id = cb_convenio_faixas.convenio_id
        AND public.pode_escrever_modulo(auth.uid(), c.clinica_id, ARRAY['cartao-beneficios'])
    )
  );

DROP POLICY IF EXISTS "Gestores atualizam faixas" ON public.cb_convenio_faixas;
DROP POLICY IF EXISTS "Perfis com edicao atualizam faixas" ON public.cb_convenio_faixas;
CREATE POLICY "Perfis com edicao atualizam faixas"
  ON public.cb_convenio_faixas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cb_convenios c
      WHERE c.id = cb_convenio_faixas.convenio_id
        AND public.pode_escrever_modulo(auth.uid(), c.clinica_id, ARRAY['cartao-beneficios'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cb_convenios c
      WHERE c.id = cb_convenio_faixas.convenio_id
        AND public.pode_escrever_modulo(auth.uid(), c.clinica_id, ARRAY['cartao-beneficios'])
    )
  );

DROP POLICY IF EXISTS "Gestores excluem faixas" ON public.cb_convenio_faixas;
DROP POLICY IF EXISTS "Perfis com edicao excluem faixas" ON public.cb_convenio_faixas;
CREATE POLICY "Perfis com edicao excluem faixas"
  ON public.cb_convenio_faixas
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cb_convenios c
      WHERE c.id = cb_convenio_faixas.convenio_id
        AND public.pode_escrever_modulo(auth.uid(), c.clinica_id, ARRAY['cartao-beneficios'])
    )
  );

-- ----------------------------------------------------------------------------
-- 6) estornar_lancamento_receita — o botão "Reverter" da mensalidade
-- ----------------------------------------------------------------------------
-- Este era o bloqueio mais visível: a função recusava com "Sem permissão para
-- estornar nesta clínica" (erro 42501) para qualquer cargo fora de
-- admin/gestor/financeiro. Um Caixa com "Edição" no Cartão Benefícios via o
-- botão "Reverter" na parcela paga, clicava e tomava erro.
--
-- A autorização passa a sair da matriz, e o módulo exigido depende do que está
-- sendo estornado:
--   parcela de contrato -> Cartão Benefícios, Contratos ou Financeiro
--   qualquer outro      -> só Financeiro
-- Assim "Edição no Cartão Benefícios" NÃO vira permissão para estornar o
-- financeiro inteiro (agendamentos, lançamentos avulsos) — continua valendo
-- só para as parcelas do próprio módulo.
--
-- O resto do corpo é idêntico ao que está em produção hoje: regra do repasse
-- já pago, escolha do caixa de destino, reabertura da parcela/agendamento.
CREATE OR REPLACE FUNCTION public.estornar_lancamento_receita(_lancamento_id uuid, _clinica_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lanc record; v_atd_repasse_pago boolean; v_ag_id uuid; v_mens_id uuid;
  v_uid uuid := auth.uid();
  v_autorizado boolean;
  v_sem_destino boolean;
  v_usou_caixa_do_executor boolean;
  v_usou_caixa_de_quem_recebeu boolean;
  v_aviso text := null;
  v_e_mensalidade boolean;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.contrato_mensalidades where lancamento_id = _lancamento_id
  ) into v_e_mensalidade;

  v_autorizado := public.pode_escrever_modulo(
    v_uid,
    _clinica_id,
    case when v_e_mensalidade
      then ARRAY['cartao-beneficios', 'contratos', 'financeiro', 'financeiro-estorno']
      else ARRAY['financeiro', 'financeiro-estorno']
    end
  );

  if not v_autorizado then
    raise exception 'Sem permissão para estornar nesta clínica' using errcode = '42501';
  end if;

  select id, agendamento_id, valor, descricao, repasse_pago, clinica_id into v_lanc
  from fin_lancamentos where id = _lancamento_id for update;
  if v_lanc.id is null then
    return jsonb_build_object('ok', true, 'motivo', 'nao_encontrado');
  end if;

  if v_lanc.clinica_id is distinct from _clinica_id then
    raise exception 'Lançamento não pertence à clínica informada' using errcode = '42501';
  end if;

  select repasse_pago into v_atd_repasse_pago from fin_atendimentos where lancamento_id = _lancamento_id limit 1;

  if coalesce(v_atd_repasse_pago, false) or coalesce(v_lanc.repasse_pago, false) then
    return jsonb_build_object('ok', false, 'motivo', 'repasse_pago',
      'mensagem', 'Repasse já pago — estorne o pagamento do repasse primeiro.');
  end if;

  select coalesce(bool_or(d.sessao_destino is null), false),
         coalesce(bool_or(d.origem = 'caixa_de_quem_recebeu'), false),
         coalesce(bool_or(d.origem = 'caixa_do_executor'), false)
    into v_sem_destino, v_usou_caixa_de_quem_recebeu, v_usou_caixa_do_executor
    from public.estorno_receita_destinos(v_lanc.id, v_uid) d;

  if v_sem_destino then
    return jsonb_build_object('ok', false, 'motivo', 'sem_sessao_aberta',
      'mensagem', 'O caixa do pagamento original já foi fechado e quem recebeu o valor não tem caixa aberto. Peça para essa pessoa abrir o caixa dela e tente novamente.');
  end if;

  if v_usou_caixa_do_executor then
    v_aviso := 'lancado_em_sessao_atual';
  elsif v_usou_caixa_de_quem_recebeu then
    v_aviso := 'lancado_no_caixa_de_quem_recebeu';
  end if;

  update fin_lancamentos set status = 'cancelado' where id = v_lanc.id;

  insert into caixa_movimentos (sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento, lancamento_id)
  select d.sessao_destino, d.clinica_id, d.dono_destino, 'estorno', d.valor,
         trim('Estorno — ' || coalesce(d.descricao, '')), d.forma_pagamento, d.lancamento_id
    from public.estorno_receita_destinos(v_lanc.id, v_uid) d;

  v_ag_id := v_lanc.agendamento_id;
  if v_ag_id is not null then
    update agendamentos set status = 'agendado', fluxo_etapa = 'aguardando_recepcao', fluxo_atualizado_em = now()
    where id = v_ag_id;
  else
    select id into v_mens_id from contrato_mensalidades where lancamento_id = v_lanc.id limit 1;
    if v_mens_id is not null then
      update contrato_mensalidades set status = 'pendente', pago_em = null, forma_pagamento = null,
        valor_pago = null, lancamento_id = null where id = v_mens_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'agendamento_id', v_ag_id, 'mensalidade_id', v_mens_id,
    'valor', v_lanc.valor, 'aviso', v_aviso);
end; $function$;

REVOKE EXECUTE ON FUNCTION public.estornar_lancamento_receita(uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.estornar_lancamento_receita(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.estornar_lancamento_receita(uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7) Conferência: mostra como cada perfil ficou depois da mudança
-- ----------------------------------------------------------------------------
SELECT
  p.chave                             AS perfil,
  max(pp.acesso::text) FILTER (WHERE pp.modulo = 'cartao-beneficios') AS cartao_beneficios,
  max(pp.acesso::text) FILTER (WHERE pp.modulo = 'contratos')         AS contratos,
  CASE
    WHEN p.chave = 'admin' THEN 'sim (admin)'
    WHEN bool_or(pp.modulo IN ('cartao-beneficios', 'contratos') AND pp.acesso::text = 'write')
      THEN 'sim'
    ELSE 'nao'
  END                                 AS escreve_em_contratos,
  CASE
    WHEN p.chave = 'admin' THEN 'sim (admin)'
    WHEN bool_or(pp.modulo = 'cartao-beneficios' AND pp.acesso::text = 'write')
      THEN 'sim'
    ELSE 'nao'
  END                                 AS escreve_em_convenios
FROM public.perfis_acesso p
LEFT JOIN public.perfil_permissoes pp ON pp.perfil_id = p.id
GROUP BY p.chave
ORDER BY p.chave;
