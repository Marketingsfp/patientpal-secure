-- ============================================================================
-- Tela "Possíveis pacientes duplicados": detectar cadastro vazio com nome
-- repetido e permitir excluir o cadastro vazio com segurança.
--
-- PROBLEMA 1 — a tela não achava o caso mais comum do balcão
-- A view só agrupava por CPF igual, telefone igual ou nome + data de
-- nascimento igual. O caso que mais aparece na recepção é o oposto: o mesmo
-- paciente cadastrado duas vezes, uma vez completo (CPF, telefone, nascimento)
-- e outra vez só com o nome. Como o cadastro vazio não tem CPF, nem telefone,
-- nem data de nascimento, ele não casava com nenhuma das três regras e o grupo
-- nunca aparecia.
--
-- Novo tipo 'nome': agrupa pelo nome normalizado (sem acento, sem maiúscula/
-- minúscula, sem espaço duplicado), e só considera suspeito quando pelo menos
-- um dos cadastros do grupo está incompleto (sem CPF ou sem telefone). Essa
-- exigência é o que evita encher a tela de homônimos: dois pacientes diferentes
-- com o mesmo nome, ambos completos, continuam fora da lista. Também exige nome
-- com pelo menos duas palavras, para não agrupar "MARIA" com "MARIA".
-- Grupos que já aparecem por CPF, telefone ou nome+nascimento não se repetem.
--
-- PROBLEMA 2 — não dava para resolver pela tela
-- Só existia "Mesclar". Quando o cadastro repetido está vazio (nunca foi usado
-- em agenda, prontuário ou financeiro), mesclar é exagero: o certo é apagar.
-- Mas a policy `pacientes_manager_delete` só deixa admin apagar, então recepção
-- e caixa ficavam sem saída.
--
-- Entram duas funções:
--   contar_vinculos_paciente(uuid)     -> quantos registros apontam para o
--                                         paciente, tabela por tabela (leitura)
--   excluir_paciente_duplicado(uuid)   -> apaga SOMENTE se o total for zero
--
-- A exclusão é SECURITY DEFINER e por isso passa por cima da policy de admin,
-- mas isso é seguro porque a própria função recusa qualquer cadastro que tenha
-- um único vínculo, e exige nível Escrita no módulo 'clientes-duplicados' — a
-- mesma permissão já usada pelo Mesclar. Nada com histórico pode ser apagado
-- por aqui. Toda exclusão fica registrada em audit_log com o cadastro inteiro
-- em `dados_antes`.
--
-- CORREÇÃO DE BORDA — audit_log
-- `merge_pacientes` grava action = 'merge_pacientes', mas o CHECK de audit_log
-- só aceita INSERT/UPDATE/DELETE/blocked_UPDATE/blocked_DELETE. Do jeito que
-- está, o merge quebra na hora de auditar. O CHECK é ampliado abaixo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) audit_log: liberar as ações usadas pelas funções de duplicados
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action = ANY (ARRAY[
    'INSERT','UPDATE','DELETE','blocked_UPDATE','blocked_DELETE',
    'merge_pacientes','excluir_paciente_duplicado'
  ]));

-- ---------------------------------------------------------------------------
-- 2) View de suspeitos — acrescenta o tipo 'nome'
--    ATENÇÃO: CREATE OR REPLACE VIEW não herda as reloptions da definição
--    anterior. `WITH (security_invoker = true)` tem que ser repetido sempre,
--    senão a view volta a rodar com os privilégios do dono e ignora o RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_pacientes_duplicados_suspeitos
WITH (security_invoker = true) AS
WITH base AS (
  SELECT p.id, p.clinica_id, p.nome, p.data_nascimento, p.created_at,
         regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g')      AS cpf_num,
         regexp_replace(COALESCE(p.telefone, ''), '\D', '', 'g') AS tel_num,
         -- nome base: sem acento, tudo maiúsculo, espaços extras colapsados
         upper(public.strip_accents(
           btrim(regexp_replace(COALESCE(p.nome, ''), '\s+', ' ', 'g'))
         )) AS nome_key
    FROM public.pacientes p
   WHERE p.ativo
), base_tel AS (
  SELECT b.*
    FROM base b
   WHERE length(b.tel_num) BETWEEN 10 AND 11
     AND b.tel_num !~ '^(\d)\1+$'
     AND b.tel_num !~ '^0'
     -- descarta números "de mentirinha": após o DDD, todos os dígitos iguais
     AND substr(b.tel_num, 3) !~ '^(\d)\1+$'
     AND b.tel_num NOT IN ('00000000000','000000000','11111111111','99999999999','12345678901','21000000000')
), por_cpf AS (
  SELECT b.clinica_id, 'cpf'::text AS tipo, b.cpf_num AS chave,
         array_agg(b.id ORDER BY b.created_at) AS ids, count(*) AS qtd
    FROM base b
   WHERE length(b.cpf_num) = 11 AND b.cpf_num !~ '^(\d)\1{10}$'
   GROUP BY b.clinica_id, b.cpf_num
  HAVING count(*) > 1
), por_nome_dn AS (
  SELECT b.clinica_id, 'nome_dn'::text AS tipo,
         b.nome_key || '|' || b.data_nascimento::text AS chave,
         array_agg(b.id ORDER BY b.created_at) AS ids, count(*) AS qtd
    FROM base b
   WHERE b.data_nascimento IS NOT NULL
   GROUP BY b.clinica_id, b.nome_key, b.data_nascimento
  HAVING count(*) > 1
), tel_nome AS (
  SELECT b.clinica_id, b.tel_num AS chave,
         array_agg(b.id ORDER BY b.created_at) AS ids, count(*) AS qtd
    FROM base_tel b
   GROUP BY b.clinica_id, b.tel_num, b.nome_key
  HAVING count(*) > 1
), tel_dn AS (
  SELECT b.clinica_id, b.tel_num AS chave,
         array_agg(b.id ORDER BY b.created_at) AS ids, count(*) AS qtd
    FROM base_tel b
   WHERE b.data_nascimento IS NOT NULL
   GROUP BY b.clinica_id, b.tel_num, b.data_nascimento
  HAVING count(*) > 1
), por_tel AS (
  SELECT DISTINCT clinica_id, 'telefone'::text AS tipo, chave, ids, qtd
    FROM (SELECT * FROM tel_nome UNION ALL SELECT * FROM tel_dn) u
), por_nome AS (
  -- Mesmo nome base, com pelo menos um cadastro incompleto no grupo.
  SELECT b.clinica_id, 'nome'::text AS tipo, b.nome_key AS chave,
         array_agg(b.id ORDER BY b.created_at) AS ids, count(*) AS qtd
    FROM base b
   WHERE length(b.nome_key) >= 6
     AND b.nome_key LIKE '% %'            -- exige nome + sobrenome
   GROUP BY b.clinica_id, b.nome_key
  HAVING count(*) > 1
     AND bool_or(b.cpf_num = '' OR b.tel_num = '')
), ja_listados AS (
  SELECT clinica_id, ids FROM por_cpf
  UNION ALL SELECT clinica_id, ids FROM por_tel
  UNION ALL SELECT clinica_id, ids FROM por_nome_dn
)
SELECT clinica_id, tipo, chave, ids, qtd FROM por_cpf
UNION ALL
SELECT clinica_id, tipo, chave, ids, qtd FROM por_tel
UNION ALL
SELECT clinica_id, tipo, chave, ids, qtd FROM por_nome_dn
UNION ALL
SELECT n.clinica_id, n.tipo, n.chave, n.ids, n.qtd
  FROM por_nome n
 WHERE NOT EXISTS (
   SELECT 1 FROM ja_listados j
    WHERE j.clinica_id = n.clinica_id
      AND j.ids @> n.ids AND j.ids <@ n.ids   -- mesmo conjunto de cadastros
 );

REVOKE ALL ON public.v_pacientes_duplicados_suspeitos FROM authenticated, anon, PUBLIC;

-- ---------------------------------------------------------------------------
-- 3) RPC da tela — agora devolve também a contagem de vínculos por cadastro,
--    para a tela saber quem pode ser excluído sem perder histórico.
--    A contagem aqui é das tabelas grandes (agenda, prontuário, financeiro,
--    contratos/orçamentos/notas). A conferência definitiva, que varre TODAS as
--    tabelas, é feita em contar_vinculos_paciente/excluir_paciente_duplicado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_duplicados_pacientes(
  _clinica_ids uuid[],
  _tipo text DEFAULT null,
  _limite integer DEFAULT 200
)
RETURNS TABLE (
  clinica_id uuid, tipo text, chave text,
  ids uuid[], qtd bigint, pacientes jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed uuid[];
BEGIN
  IF auth.uid() IS NULL OR _clinica_ids IS NULL THEN RETURN; END IF;
  SELECT array_agg(DISTINCT m.clinica_id) INTO v_allowed
    FROM public.clinica_memberships m
   WHERE m.user_id = auth.uid() AND m.ativo
     AND m.clinica_id = ANY(_clinica_ids);
  IF v_allowed IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH d AS (
    SELECT v.clinica_id, v.tipo, v.chave, v.ids, v.qtd
      FROM public.v_pacientes_duplicados_suspeitos v
     WHERE v.clinica_id = ANY(v_allowed)
       AND (_tipo IS NULL OR v.tipo = _tipo)
     ORDER BY v.qtd DESC, v.tipo, v.chave
     LIMIT least(greatest(coalesce(_limite, 200), 1), 1000)
  ),
  alvo AS (
    SELECT DISTINCT z.id FROM (SELECT unnest(d.ids) AS id FROM d) z
  ),
  c_agenda AS (
    SELECT a.paciente_id AS id, count(*) AS n FROM public.agendamentos a
     WHERE a.paciente_id IN (SELECT id FROM alvo) GROUP BY a.paciente_id
  ),
  c_pront AS (
    SELECT x.id, sum(x.n) AS n FROM (
      SELECT pr.paciente_id AS id, count(*) AS n FROM public.prontuarios pr
       WHERE pr.paciente_id IN (SELECT id FROM alvo) GROUP BY pr.paciente_id
      UNION ALL
      SELECT op.paciente_id, count(*) FROM public.odonto_prontuarios op
       WHERE op.paciente_id IN (SELECT id FROM alvo) GROUP BY op.paciente_id
    ) x GROUP BY x.id
  ),
  c_fin AS (
    SELECT x.id, sum(x.n) AS n FROM (
      SELECT fl.paciente_id AS id, count(*) AS n FROM public.fin_lancamentos fl
       WHERE fl.paciente_id IN (SELECT id FROM alvo) GROUP BY fl.paciente_id
      UNION ALL
      SELECT fa.paciente_id, count(*) FROM public.fin_atendimentos fa
       WHERE fa.paciente_id IN (SELECT id FROM alvo) GROUP BY fa.paciente_id
      UNION ALL
      SELECT pg.paciente_id, count(*) FROM public.pagamentos pg
       WHERE pg.paciente_id IN (SELECT id FROM alvo) GROUP BY pg.paciente_id
    ) x GROUP BY x.id
  ),
  c_outros AS (
    SELECT x.id, sum(x.n) AS n FROM (
      SELECT o.paciente_id AS id, count(*) AS n FROM public.orcamentos o
       WHERE o.paciente_id IN (SELECT id FROM alvo) GROUP BY o.paciente_id
      UNION ALL
      SELECT ct.paciente_id, count(*) FROM public.contratos_assinatura ct
       WHERE ct.paciente_id IN (SELECT id FROM alvo) GROUP BY ct.paciente_id
      UNION ALL
      SELECT nf.paciente_id, count(*) FROM public.nfse nf
       WHERE nf.paciente_id IN (SELECT id FROM alvo) GROUP BY nf.paciente_id
      UNION ALL
      SELECT de.paciente_id, count(*) FROM public.documentos_emitidos de
       WHERE de.paciente_id IN (SELECT id FROM alvo) GROUP BY de.paciente_id
    ) x GROUP BY x.id
  )
  SELECT d.clinica_id, d.tipo, d.chave, d.ids, d.qtd,
    (SELECT jsonb_agg(jsonb_build_object(
              'id', p.id,
              'nome', p.nome,
              'cpf', p.cpf,
              'telefone', p.telefone,
              'data_nascimento', p.data_nascimento,
              'codigo_prontuario', p.codigo_prontuario,
              'codigo_prontuario_anterior', p.codigo_prontuario_anterior,
              'email', p.email,
              'created_at', p.created_at,
              'qtd_agendamentos', COALESCE(ca.n, 0),
              'qtd_prontuarios',  COALESCE(cp.n, 0),
              'qtd_financeiro',   COALESCE(cf.n, 0),
              'qtd_outros',       COALESCE(co.n, 0),
              'qtd_vinculos',     COALESCE(ca.n, 0) + COALESCE(cp.n, 0)
                                + COALESCE(cf.n, 0) + COALESCE(co.n, 0)
           ) ORDER BY p.created_at)
       FROM public.pacientes p
       LEFT JOIN c_agenda ca ON ca.id = p.id
       LEFT JOIN c_pront  cp ON cp.id = p.id
       LEFT JOIN c_fin    cf ON cf.id = p.id
       LEFT JOIN c_outros co ON co.id = p.id
      WHERE p.id = ANY(d.ids)) AS pacientes
    FROM d;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_duplicados_pacientes(uuid[], text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_duplicados_pacientes(uuid[], text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Contagem completa de vínculos de UM paciente
--    Varre todas as tabelas do schema public que tenham uma coluna terminada
--    em `paciente_id` (pega paciente_id e também contato_paciente_id).
--    Tabelas de rascunho/backup (nome começando com "_" ou contendo backup,
--    legacy, tmp) ficam de fora: são resíduo de importação, não histórico.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contar_vinculos_paciente(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica  uuid;
  v_row      record;
  v_qtd      bigint;
  v_total    bigint := 0;
  v_detalhes jsonb  := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR _id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT p.clinica_id INTO v_clinica FROM public.pacientes p WHERE p.id = _id;
  IF v_clinica IS NULL THEN
    RAISE EXCEPTION 'Cadastro não encontrado';
  END IF;

  IF NOT COALESCE(
       public.has_module_access(auth.uid(), v_clinica, 'clientes-duplicados', 'read'),
       false) THEN
    RAISE EXCEPTION 'Seu perfil não tem acesso à conferência de duplicados';
  END IF;

  FOR v_row IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name LIKE '%paciente_id'
       AND c.data_type = 'uuid'
       AND t.table_type = 'BASE TABLE'
       AND c.table_name <> 'pacientes'
       AND c.table_name !~ '^_'
       AND c.table_name !~ '(backup|legacy|tmp)'
     ORDER BY c.table_name, c.column_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1',
                   v_row.table_name, v_row.column_name)
      INTO v_qtd USING _id;
    IF v_qtd > 0 THEN
      v_total := v_total + v_qtd;
      v_detalhes := v_detalhes || jsonb_build_object(
        'tabela', v_row.table_name,
        'coluna', v_row.column_name,
        'qtd',    v_qtd
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('paciente_id', _id, 'total', v_total, 'detalhes', v_detalhes);
END;
$$;

REVOKE ALL ON FUNCTION public.contar_vinculos_paciente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contar_vinculos_paciente(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Exclusão do cadastro duplicado — só quando não tem nenhum vínculo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.excluir_paciente_duplicado(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica  uuid;
  v_antes    jsonb;
  v_vinculos jsonb;
  v_total    bigint;
BEGIN
  IF auth.uid() IS NULL OR _id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT p.clinica_id INTO v_clinica FROM public.pacientes p WHERE p.id = _id;
  IF v_clinica IS NULL THEN
    RAISE EXCEPTION 'Cadastro não encontrado (talvez já tenha sido excluído)';
  END IF;

  IF NOT COALESCE(
       public.has_module_access(auth.uid(), v_clinica, 'clientes-duplicados', 'write'),
       false) THEN
    RAISE EXCEPTION 'Seu perfil não tem permissão para excluir cadastros duplicados';
  END IF;

  v_vinculos := public.contar_vinculos_paciente(_id);
  v_total := (v_vinculos->>'total')::bigint;

  IF v_total > 0 THEN
    RAISE EXCEPTION
      'Este cadastro tem % registro(s) de histórico vinculado(s) e não pode ser excluído. Use Mesclar para juntá-lo ao cadastro correto.',
      v_total;
  END IF;

  SELECT row_to_json(x)::jsonb INTO v_antes
    FROM (SELECT * FROM public.pacientes WHERE id = _id) x;

  DELETE FROM public.pacientes WHERE id = _id;

  INSERT INTO public.audit_log (
    clinica_id, user_id, table_name, record_id, action, dados_antes, dados_depois
  ) VALUES (
    v_clinica, auth.uid(), 'pacientes', _id::text,
    'excluir_paciente_duplicado', v_antes, NULL
  );

  RETURN jsonb_build_object('ok', true, 'paciente_id', _id);
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION
      'Este cadastro ainda está sendo usado em outro lugar do sistema e não pode ser excluído. Use Mesclar.';
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_paciente_duplicado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_paciente_duplicado(uuid) TO authenticated;
