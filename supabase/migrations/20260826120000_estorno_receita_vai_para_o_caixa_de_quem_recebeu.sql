-- ---------------------------------------------------------------------------
-- Estorno de receita: a saída vai para o caixa de QUEM RECEBEU o dinheiro,
-- nunca para o caixa de um terceiro qualquer.
--
-- Problema corrigido
-- ------------------
-- Quando o caixa do recebimento original já estava fechado, a versão anterior
-- escolhia a sessão de destino assim:
--
--   1º  caixa aberto de quem CLICOU no estorno (auth.uid());
--   2º  qualquer caixa aberto da clínica, o mais recente.
--
-- Os dois passos estão errados pelo mesmo motivo: a devolução é dinheiro que
-- sai de uma gaveta física, e a gaveta certa é a de quem recebeu o pagamento —
-- não a de quem aprovou o estorno, e muito menos a de um colega sorteado por
-- `order by aberto_em desc`.
--
-- Na prática o estorno de receita é quase sempre APROVADO por um admin
-- (a atendente só solicita, em `estorno_solicitacoes`), então o passo 1 acerta
-- justamente o caixa errado: o do admin.
--
-- Caso real, 25/08/2026:
--   16:44:29  SUELLEN solicita o estorno de ODAIZA — CONSULTA, R$ 110,00 em
--             dinheiro, recebido por ela mesma no caixa do dia 20 (já fechado).
--   16:44:35  JOÃO PEDRO (admin) aprova. A função roda com auth.uid() = João
--             Pedro, encontra o caixa dele aberto desde as 13:00 e lança lá.
--
-- Resultado: R$ 110,00 saíram de um caixa onde esse dinheiro nunca entrou. O
-- caixa do João Pedro ficou R$ 110,00 negativo e o da Suellen — que tinha uma
-- sessão aberta desde as 16:43 e era o destino certo — ficou com R$ 110,00 de
-- sobra fantasma. A linha ainda nascia com user_id da Suellen dentro da sessão
-- do João Pedro, um movimento sem dono coerente.
--
-- Regra nova (por recebimento, não por lançamento)
-- ------------------------------------------------
--   1º  sessão do recebimento ainda aberta  -> lança nela (inalterado);
--   2º  fechada -> caixa aberto de QUEM RECEBEU (o user_id do recebimento),
--                  que é o dono da gaveta de onde o dinheiro sai;
--   3º  se essa pessoa não tem caixa aberto -> caixa aberto de quem executa;
--   4º  se nenhum dos dois existe -> NÃO estorna e explica o motivo.
--
-- O passo 4 é a mudança que impede a poluição: o fallback "qualquer caixa
-- aberto da clínica" foi removido. É preferível pedir para abrir um caixa a
-- tirar dinheiro da gaveta de quem não tem nada com a devolução.
--
-- A escolha é feita por recebimento porque um pagamento misto pode ter linhas
-- recebidas por operadores diferentes; cada devolução volta para a sua origem.
--
-- O movimento passa a nascer com user_id do DONO DA SESSÃO DE DESTINO, mesmo
-- padrão já adotado em `estornar_sangria` (migração 20260822120000). A política
-- de RLS `cx_mov_select` deixa o operador comum ver apenas as linhas com
-- user_id = auth.uid(); com o dono errado, a saída ficava invisível justamente
-- para quem precisa conferir e fechar o caixa. Quem executou a ação continua
-- registrado no audit_log, que é o lugar certo para autoria.
--
-- Avisos devolvidos ao frontend:
--   'lancado_no_caixa_de_quem_recebeu' -> caso 2 (novo)
--   'lancado_em_sessao_atual'          -> caso 3 (nome mantido por compat.)
--
-- Nada mais muda: autorização, trava de repasse pago, deduplicação por forma +
-- valor, reabertura do agendamento e baixa da mensalidade seguem idênticos.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Auxiliar: para cada recebimento ainda pendente de estorno, onde a devolução
-- deve ser lançada.
--
-- Existe como função separada porque o mesmo conjunto é lido duas vezes na
-- rotina principal — uma para decidir se dá para estornar e montar o aviso,
-- outra para inserir os movimentos. A alternativa seria uma tabela temporária
-- dentro do PL/pgSQL, que é justamente onde mora a armadilha: o plano fica
-- cacheado por conexão e a temp table é recriada com outro OID a cada chamada,
-- então a segunda chamada na mesma conexão do pool falha com "relation ... does
-- not exist". Uma função SQL não tem esse problema.
--
-- Não recebe GRANT para `authenticated`: é chamada de dentro de uma função
-- SECURITY DEFINER e não deve ser exposta sozinha.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.estorno_receita_destinos(
  _lancamento_id uuid,
  _uid uuid
)
RETURNS TABLE (
  clinica_id uuid,
  valor numeric,
  descricao text,
  forma_pagamento text,
  lancamento_id uuid,
  sessao_destino uuid,
  dono_destino uuid,
  origem text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with recebimentos as (
    select r.id, r.sessao_id, r.clinica_id, r.user_id, r.valor, r.descricao,
           r.forma_pagamento, r.lancamento_id, r.created_at,
           s.status as sessao_status,
           row_number() over (
             partition by r.forma_pagamento, r.valor order by r.created_at, r.id
           ) as rn
      from caixa_movimentos r
      join caixa_sessoes    s on s.id = r.sessao_id
     where r.lancamento_id = _lancamento_id
       and r.tipo = 'recebimento'
  ),
  ja_estornados as (
    select e.forma_pagamento, e.valor, count(*) as n
      from caixa_movimentos e
     where e.lancamento_id = _lancamento_id
       and (
         e.tipo = 'estorno'
         or (e.tipo = 'sangria' and lower(coalesce(e.descricao, '')) like 'estorno%')
       )
     group by e.forma_pagamento, e.valor
  ),
  pendentes as (
    select r.*
      from recebimentos r
      left join ja_estornados j
        on j.forma_pagamento is not distinct from r.forma_pagamento
       and j.valor = r.valor
     where r.rn > coalesce(j.n, 0)
  )
  select p.clinica_id, p.valor, p.descricao, p.forma_pagamento, p.lancamento_id,
         d.sessao_destino, d.dono_destino, d.origem
    from pendentes p
    cross join lateral (
      select
        case when p.sessao_status = 'aberto' then p.sessao_id
             else coalesce(s_receb.id, s_exec.id) end                as sessao_destino,
        case when p.sessao_status = 'aberto' then p.user_id
             else coalesce(s_receb.user_id, s_exec.user_id) end      as dono_destino,
        case when p.sessao_status = 'aberto' then 'sessao_original'
             when s_receb.id is not null     then 'caixa_de_quem_recebeu'
             when s_exec.id  is not null     then 'caixa_do_executor'
             else 'sem_destino' end                                  as origem
        -- A base de uma linha é obrigatória: os dois LEFT JOIN LATERAL abaixo
        -- podem não achar nada, e sem ela o recebimento sumiria do resultado
        -- em vez de aparecer como 'sem_destino' — que é justamente o caso que
        -- precisa bloquear o estorno.
        from (select 1) base
        -- Caixa aberto de quem RECEBEU o dinheiro: a gaveta de onde ele sai.
        left join lateral (
          select s2.id, s2.user_id
            from caixa_sessoes s2
           where s2.clinica_id = p.clinica_id
             and s2.user_id    = p.user_id
             and s2.status     = 'aberto'
           order by s2.aberto_em desc
           limit 1
        ) s_receb on true
        -- Só se essa pessoa não tiver caixa aberto: o de quem está executando.
        left join lateral (
          select s3.id, s3.user_id
            from caixa_sessoes s3
           where s3.clinica_id = p.clinica_id
             and s3.user_id    = _uid
             and s3.status     = 'aberto'
           order by s3.aberto_em desc
           limit 1
        ) s_exec on true
    ) d;
$function$;

-- O Postgres concede EXECUTE a PUBLIC em toda função nova. Aqui isso seria um
-- vazamento: a função é SECURITY DEFINER, lê caixa_movimentos sem checar
-- permissão nenhuma, e a descrição do movimento carrega nome de paciente e
-- procedimento. Sem este REVOKE, qualquer usuário autenticado poderia varrer
-- lançamentos de qualquer clínica passando ids no lugar do parâmetro.
-- A função principal continua chamando normalmente: ela é SECURITY DEFINER e
-- roda como owner.
REVOKE ALL ON FUNCTION public.estorno_receita_destinos(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.estorno_receita_destinos(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.estorno_receita_destinos(uuid, uuid) FROM anon;


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
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select
    public.can_manage_clinica(v_uid, _clinica_id)
    or exists (
      select 1 from public.clinica_memberships m
      where m.user_id = v_uid
        and m.clinica_id = _clinica_id
        and m.ativo = true
        and m.role in ('admin','gestor','financeiro')
    )
  into v_autorizado;

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

  -- Onde cada devolução vai cair, e se alguma ficou sem destino possível.
  select coalesce(bool_or(d.sessao_destino is null), false),
         coalesce(bool_or(d.origem = 'caixa_de_quem_recebeu'), false),
         coalesce(bool_or(d.origem = 'caixa_do_executor'), false)
    into v_sem_destino, v_usou_caixa_de_quem_recebeu, v_usou_caixa_do_executor
    from public.estorno_receita_destinos(v_lanc.id, v_uid) d;

  -- Nenhum caixa aberto para receber a devolução: não reescreve fechamento
  -- antigo nem empurra a saída para a gaveta de um terceiro.
  if v_sem_destino then
    return jsonb_build_object('ok', false, 'motivo', 'sem_sessao_aberta',
      'mensagem', 'O caixa do pagamento original já foi fechado e quem recebeu o valor não tem caixa aberto. Peça para essa pessoa abrir o caixa dela e tente novamente.');
  end if;

  -- O caso mais grave manda na mensagem: se ALGUMA linha caiu no caixa de quem
  -- está executando, é isso que ele precisa saber para conferir a própria gaveta.
  if v_usou_caixa_do_executor then
    v_aviso := 'lancado_em_sessao_atual';
  elsif v_usou_caixa_de_quem_recebeu then
    v_aviso := 'lancado_no_caixa_de_quem_recebeu';
  end if;

  update fin_lancamentos set status = 'cancelado' where id = v_lanc.id;

  -- Registra a devolução como 'estorno' (não 'sangria'): é dinheiro que sai
  -- do caixa para o paciente, não uma retirada operacional. O user_id é o do
  -- DONO DA SESSÃO DE DESTINO, para a linha não ficar invisível pela RLS a
  -- quem precisa conferir a gaveta.
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

GRANT EXECUTE ON FUNCTION public.estornar_lancamento_receita(uuid, uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- Mesma regra para o estorno de sangria: remove o fallback que pegava
-- "qualquer caixa aberto da clínica". A compensação de uma sangria volta para
-- a sessão original se ela ainda estiver aberta; senão, para o caixa aberto do
-- DONO daquela sessão; e só então para o de quem executa. Nunca para o de um
-- terceiro.
-- ---------------------------------------------------------------------------
create or replace function public.estornar_sangria(
  _movimento_id uuid,
  _clinica_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_mov              public.caixa_movimentos%ROWTYPE;
  v_sessao_status    text;
  v_sessao_dono      uuid;
  v_sessao_alvo      uuid;
  v_aviso            text := NULL;
  v_user             uuid := auth.uid();
  v_novo_id          uuid;
  v_ja_estornado     boolean;
  v_desc_estorno     text;
  v_dono_sessao      uuid;
BEGIN
  PERFORM set_config('app.actor_source', 'estornar_sangria', true);
  IF v_user IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  SELECT * INTO v_mov FROM public.caixa_movimentos WHERE id = _movimento_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrado', 'mensagem', 'Movimento de caixa não encontrado.'); END IF;
  IF _clinica_id IS NOT NULL AND v_mov.clinica_id <> _clinica_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'clinica_divergente', 'mensagem', 'Movimento pertence a outra clínica.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = v_user AND m.clinica_id = v_mov.clinica_id AND m.ativo = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_acesso',
      'mensagem', 'Você não tem acesso a esta clínica.');
  END IF;

  IF NOT public.has_module_access(v_user, v_mov.clinica_id, 'financeiro', 'write') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao',
      'mensagem', 'Você não tem permissão para estornar sangria (módulo financeiro).');
  END IF;

  IF v_mov.tipo <> 'sangria' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tipo_invalido', 'mensagem', 'Este movimento não é uma sangria.');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.caixa_movimentos WHERE tipo = 'suprimento' AND clinica_id = v_mov.clinica_id AND descricao LIKE ('[ESTORNO DE SANGRIA #' || v_mov.id::text || ']%')) INTO v_ja_estornado;
  IF v_ja_estornado THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_estornado', 'mensagem', 'Esta sangria já foi estornada anteriormente.');
  END IF;

  SELECT status, user_id INTO v_sessao_status, v_sessao_dono
    FROM public.caixa_sessoes WHERE id = v_mov.sessao_id;

  IF v_sessao_status = 'aberto' THEN
    v_sessao_alvo := v_mov.sessao_id;
  ELSE
    -- Caixa aberto do DONO da sessão sangrada: é a gaveta que perdeu o dinheiro.
    SELECT id INTO v_sessao_alvo FROM public.caixa_sessoes
     WHERE clinica_id = v_mov.clinica_id AND user_id = v_sessao_dono AND status = 'aberto'
     ORDER BY aberto_em DESC LIMIT 1;
    IF v_sessao_alvo IS NOT NULL THEN
      v_aviso := 'lancado_no_caixa_de_quem_recebeu';
    ELSE
      -- Só então o caixa de quem está executando.
      SELECT id INTO v_sessao_alvo FROM public.caixa_sessoes
       WHERE clinica_id = v_mov.clinica_id AND user_id = v_user AND status = 'aberto'
       ORDER BY aberto_em DESC LIMIT 1;
      IF v_sessao_alvo IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'sem_sessao_aberta',
          'mensagem', 'A sessão original já foi fechada e quem fez a sangria não tem caixa aberto. Peça para essa pessoa abrir o caixa dela e tente novamente.');
      END IF;
      v_aviso := 'lancado_em_sessao_atual';
    END IF;
  END IF;

  SELECT user_id INTO v_dono_sessao FROM public.caixa_sessoes WHERE id = v_sessao_alvo;
  IF v_dono_sessao IS NULL THEN v_dono_sessao := v_user; END IF;
  v_desc_estorno := '[ESTORNO DE SANGRIA #' || v_mov.id::text || '] ' || COALESCE(v_mov.descricao, 'Sangria');
  INSERT INTO public.caixa_movimentos (sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento, destino_user_id, destino_nome)
  VALUES (v_sessao_alvo, v_mov.clinica_id, v_dono_sessao, 'suprimento', v_mov.valor, v_desc_estorno, v_mov.forma_pagamento, v_mov.destino_user_id, v_mov.destino_nome)
  RETURNING id INTO v_novo_id;
  BEGIN
    INSERT INTO public.audit_log (clinica_id, user_id, action, table_name, record_id, dados_antes, dados_depois)
    VALUES (v_mov.clinica_id, v_user, 'ESTORNO_SANGRIA', 'caixa_movimentos', v_mov.id::text, to_jsonb(v_mov), jsonb_build_object('novo_movimento_id', v_novo_id, 'sessao_alvo', v_sessao_alvo));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('ok', true, 'novo_movimento_id', v_novo_id, 'sessao_alvo', v_sessao_alvo, 'aviso', v_aviso);
END;
$function$;
