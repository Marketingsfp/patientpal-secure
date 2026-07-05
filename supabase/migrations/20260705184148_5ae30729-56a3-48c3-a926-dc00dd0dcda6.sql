CREATE OR REPLACE FUNCTION public.buscar_universal(
  _clinica_ids uuid[], _termo text, _tipos text[] DEFAULT NULL::text[], _limite integer DEFAULT 24
)
 RETURNS TABLE(tipo text, id uuid, titulo text, subtitulo text, hint text, payload jsonb, score numeric, criado_em timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_termo text := lower(coalesce(_termo, ''));
  v_like text := '%' || v_termo || '%';
  v_prefix text := v_termo || '%';
  v_digits text := regexp_replace(coalesce(_termo,''), '\D','','g');
  v_has_digits boolean := length(v_digits) >= 3;
  v_scope uuid[];
  v_wants_all boolean := _tipos IS NULL OR array_length(_tipos, 1) IS NULL;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  IF length(v_termo) < 2 THEN RETURN; END IF;

  SELECT array_agg(cid) INTO v_scope
  FROM unnest(coalesce(_clinica_ids, ARRAY[]::uuid[])) AS cid
  WHERE public.is_member(v_uid, cid);
  IF v_scope IS NULL OR array_length(v_scope, 1) IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH pac AS (
    SELECT
      'paciente'::text AS tipo, p.id, p.nome::text AS titulo,
      (coalesce(nullif(p.cpf,''), '—') ||
        CASE WHEN p.telefone IS NOT NULL AND p.telefone <> '' THEN ' · ' || p.telefone ELSE '' END
      )::text AS subtitulo,
      (CASE WHEN p.numero_pasta IS NOT NULL AND p.numero_pasta <> ''
              THEN 'Pasta ' || p.numero_pasta || ' · ' ELSE '' END
        || CASE WHEN p.data_nascimento IS NOT NULL
                  THEN to_char(p.data_nascimento,'DD/MM/YYYY') ELSE '' END)::text AS hint,
      jsonb_build_object('clinica_id', p.clinica_id, 'cpf', p.cpf, 'telefone', p.telefone,
        'numero_pasta', p.numero_pasta, 'codigo_prontuario', p.codigo_prontuario) AS payload,
      (CASE
        WHEN v_has_digits AND length(v_digits) = 11 AND p.cpf_digits = v_digits THEN 100
        WHEN v_has_digits AND length(v_digits) >= 8
             AND (regexp_replace(coalesce(p.telefone,''),  '\D','','g') = v_digits
               OR regexp_replace(coalesce(p.telefone2,''), '\D','','g') = v_digits) THEN 95
        WHEN v_has_digits AND (p.numero_pasta = v_digits OR p.codigo_prontuario = v_digits
                            OR p.numero_pasta = _termo OR p.codigo_prontuario = _termo) THEN 90
        WHEN lower(p.nome) = v_termo THEN 85
        WHEN lower(p.nome) LIKE v_prefix THEN 65
        WHEN v_has_digits AND (
              regexp_replace(coalesce(p.telefone,''),  '\D','','g') LIKE '%'||v_digits||'%'
           OR regexp_replace(coalesce(p.telefone2,''), '\D','','g') LIKE '%'||v_digits||'%'
           OR p.cpf_digits LIKE '%'||v_digits||'%'
        ) THEN 45
        WHEN lower(p.nome) LIKE v_like THEN 35
        ELSE 5
      END)::numeric * (CASE WHEN p.ativo THEN 1.0 ELSE 0.7 END) AS score,
      p.created_at AS criado_em
    FROM public.pacientes p
    WHERE p.clinica_id = ANY(v_scope)
      AND (v_wants_all OR 'paciente' = ANY(_tipos))
      AND (
        lower(p.nome) LIKE v_like
        OR (v_has_digits AND (
             p.cpf_digits LIKE '%'||v_digits||'%'
          OR regexp_replace(coalesce(p.telefone,''),  '\D','','g') LIKE '%'||v_digits||'%'
          OR regexp_replace(coalesce(p.telefone2,''), '\D','','g') LIKE '%'||v_digits||'%'
          OR p.numero_pasta = v_digits
          OR p.codigo_prontuario = v_digits
        ))
      )
    ORDER BY score DESC, p.created_at DESC LIMIT _limite
  ),
  orc AS (
    SELECT 'orcamento'::text, o.id,
      ('Orçamento #' || coalesce(o.numero::text, o.id::text))::text,
      coalesce(o.paciente_nome, '—')::text,
      ('R$ ' || to_char(coalesce(o.valor_total,0),'FM999G999D00') || ' · ' || coalesce(o.status::text,''))::text,
      jsonb_build_object('clinica_id', o.clinica_id, 'numero', o.numero, 'status', o.status,
        'paciente_id', o.paciente_id, 'valor', o.valor_total),
      (CASE WHEN o.numero::text = v_termo THEN 90
            WHEN o.numero::text ILIKE v_prefix THEN 60
            WHEN lower(o.paciente_nome) LIKE v_prefix THEN 45
            WHEN lower(o.paciente_nome) LIKE v_like THEN 30 ELSE 10 END)::numeric,
      o.created_at
    FROM public.orcamentos o
    WHERE o.clinica_id = ANY(v_scope) AND (v_wants_all OR 'orcamento' = ANY(_tipos))
      AND (o.numero::text ILIKE v_prefix OR lower(o.paciente_nome) LIKE v_like)
    ORDER BY score DESC, o.created_at DESC LIMIT _limite
  ),
  age AS (
    SELECT 'agendamento'::text, a.id,
      (coalesce(a.paciente_nome,'—') || ' · ' || to_char(a.inicio, 'DD/MM HH24:MI'))::text,
      coalesce(a.procedimento, '—')::text, coalesce(a.status::text,'')::text,
      jsonb_build_object('clinica_id', a.clinica_id, 'inicio', a.inicio, 'paciente_id', a.paciente_id),
      (CASE WHEN lower(a.paciente_nome) LIKE v_prefix THEN 50
            WHEN lower(a.paciente_nome) LIKE v_like THEN 30
            WHEN lower(coalesce(a.procedimento,'')) LIKE v_like THEN 15 ELSE 5 END)::numeric,
      a.inicio
    FROM public.agendamentos a
    WHERE a.clinica_id = ANY(v_scope) AND (v_wants_all OR 'agendamento' = ANY(_tipos))
      AND (lower(a.paciente_nome) LIKE v_like OR lower(coalesce(a.procedimento,'')) LIKE v_like)
    ORDER BY a.inicio DESC LIMIT _limite
  ),
  fin AS (
    SELECT 'financeiro'::text, f.id,
      ('Atendimento ' || to_char(f.data,'DD/MM/YYYY'))::text,
      coalesce(f.procedimento,'—')::text,
      ('R$ ' || to_char(coalesce(f.valor_total,0),'FM999G999D00') || ' · ' || coalesce(f.status,''))::text,
      jsonb_build_object('clinica_id', f.clinica_id, 'paciente_id', f.paciente_id, 'valor', f.valor_total),
      (CASE WHEN lower(coalesce(f.procedimento,'')) LIKE v_like THEN 35 ELSE 5 END)::numeric,
      f.created_at
    FROM public.fin_atendimentos f
    WHERE f.clinica_id = ANY(v_scope) AND (v_wants_all OR 'financeiro' = ANY(_tipos))
      AND lower(coalesce(f.procedimento,'')) LIKE v_like
    ORDER BY f.created_at DESC LIMIT _limite
  ),
  nf AS (
    SELECT 'nfse'::text, n.id,
      ('NFS-e ' || coalesce(n.numero::text, n.rps_numero::text, n.id::text))::text,
      coalesce(n.tomador_nome,'—')::text,
      ('R$ ' || to_char(coalesce(n.valor_servicos,0),'FM999G999D00') || ' · ' || coalesce(n.status,''))::text,
      jsonb_build_object('clinica_id', n.clinica_id, 'numero', n.numero, 'status', n.status),
      (CASE WHEN n.numero::text = v_termo OR n.rps_numero::text = v_termo THEN 90
            WHEN lower(coalesce(n.tomador_nome,'')) LIKE v_prefix THEN 50
            WHEN lower(coalesce(n.tomador_nome,'')) LIKE v_like THEN 30 ELSE 10 END)::numeric,
      n.created_at
    FROM public.nfse n
    WHERE n.clinica_id = ANY(v_scope) AND (v_wants_all OR 'nfse' = ANY(_tipos))
      AND (n.numero::text ILIKE v_prefix OR n.rps_numero::text ILIKE v_prefix
        OR lower(coalesce(n.tomador_nome,'')) LIKE v_like)
    ORDER BY score DESC, n.created_at DESC LIMIT _limite
  ),
  cbc AS (
    SELECT 'cartao_convenio'::text, c.id, c.nome::text,
      'Cartão de Benefícios'::text,
      (CASE WHEN c.ativo THEN 'Ativo' ELSE 'Inativo' END)::text,
      jsonb_build_object('clinica_id', c.clinica_id, 'ativo', c.ativo),
      (CASE WHEN lower(c.nome) LIKE v_prefix THEN 55
            WHEN lower(c.nome) LIKE v_like THEN 35 ELSE 5 END)::numeric
        * (CASE WHEN c.ativo THEN 1.0 ELSE 0.7 END),
      c.created_at
    FROM public.cb_convenios c
    WHERE c.clinica_id = ANY(v_scope) AND (v_wants_all OR 'cartao_convenio' = ANY(_tipos))
      AND lower(c.nome) LIKE v_like
    ORDER BY score DESC LIMIT _limite
  ),
  ctr AS (
    SELECT 'contrato_associado'::text, ct.id,
      ('Contrato ' || coalesce(ct.numero::text, ct.id::text))::text,
      coalesce(ct.paciente_nome,'—')::text,
      coalesce(ct.status,'')::text,
      jsonb_build_object('clinica_id', ct.clinica_id, 'paciente_id', ct.paciente_id, 'status', ct.status),
      (CASE WHEN ct.numero::text = v_termo THEN 90
            WHEN lower(ct.paciente_nome) LIKE v_prefix THEN 50
            WHEN lower(ct.paciente_nome) LIKE v_like THEN 30 ELSE 10 END)::numeric,
      ct.created_at
    FROM public.contratos_assinatura ct
    WHERE ct.clinica_id = ANY(v_scope) AND (v_wants_all OR 'contrato_associado' = ANY(_tipos))
      AND (ct.numero::text ILIKE v_prefix OR lower(ct.paciente_nome) LIKE v_like)
    ORDER BY score DESC, ct.created_at DESC LIMIT _limite
  ),
  med AS (
    SELECT 'medico'::text, m.id, m.nome::text,
      coalesce(m.crm || '/' || m.crm_uf, '—')::text,
      (CASE WHEN m.ativo THEN 'Ativo' ELSE 'Inativo' END)::text,
      jsonb_build_object('clinica_id', m.clinica_id, 'ativo', m.ativo),
      (CASE WHEN lower(m.nome) LIKE v_prefix THEN 55
            WHEN lower(m.nome) LIKE v_like THEN 35
            WHEN lower(coalesce(m.crm,'')) LIKE v_prefix THEN 40 ELSE 5 END)::numeric
        * (CASE WHEN m.ativo THEN 1.0 ELSE 0.7 END),
      m.created_at
    FROM public.medicos m
    WHERE m.clinica_id = ANY(v_scope) AND (v_wants_all OR 'medico' = ANY(_tipos))
      AND (lower(m.nome) LIKE v_like OR lower(coalesce(m.crm,'')) LIKE v_prefix)
    ORDER BY score DESC LIMIT _limite
  ),
  proc AS (
    SELECT 'procedimento'::text, p.id, p.nome::text,
      coalesce(p.grupo,'—')::text,
      ('R$ ' || to_char(coalesce(p.valor_padrao,0),'FM999G999D00'))::text,
      jsonb_build_object('clinica_id', p.clinica_id, 'ativo', p.ativo),
      (CASE WHEN lower(p.nome) LIKE v_prefix THEN 55
            WHEN lower(p.nome) LIKE v_like THEN 35
            WHEN lower(coalesce(p.grupo,'')) LIKE v_like THEN 15 ELSE 5 END)::numeric
        * (CASE WHEN p.ativo THEN 1.0 ELSE 0.7 END),
      p.created_at
    FROM public.procedimentos p
    WHERE p.clinica_id = ANY(v_scope) AND (v_wants_all OR 'procedimento' = ANY(_tipos))
      AND (lower(p.nome) LIKE v_like OR lower(coalesce(p.grupo,'')) LIKE v_like)
    ORDER BY score DESC LIMIT _limite
  ),
  todos AS (
    SELECT * FROM pac
    UNION ALL SELECT * FROM orc UNION ALL SELECT * FROM age UNION ALL SELECT * FROM fin
    UNION ALL SELECT * FROM nf UNION ALL SELECT * FROM cbc UNION ALL SELECT * FROM ctr
    UNION ALL SELECT * FROM med UNION ALL SELECT * FROM proc
  )
  SELECT t.tipo, t.id, t.titulo, t.subtitulo, t.hint, t.payload, t.score, t.criado_em
  FROM todos t
  ORDER BY t.score DESC NULLS LAST, t.criado_em DESC NULLS LAST, t.titulo ASC
  LIMIT _limite;
END;
$function$;