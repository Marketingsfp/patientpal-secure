-- Mesclagem de pacientes duplicados: sai do "somente admin" e passa a seguir a
-- matriz de Perfis de Acesso, no módulo "clientes-duplicados" nível Escrita.
--
-- Motivo: a exclusão direta de paciente é (e continua sendo) restrita a admin e
-- gestor pela policy `pacientes_manager_delete`. Recepção e Caixa, que são quem
-- de fato encontra os cadastros repetidos no balcão, ficavam sem nenhum caminho
-- para resolver: o botão de excluir não apagava e o de mesclar recusava. Mesclar
-- é a operação segura — preserva agendamentos, financeiro e prontuário no
-- cadastro que fica, e grava em `audit_log` quem fez e o que havia antes.
--
-- A exclusão direta NÃO é afetada por esta migration.

CREATE OR REPLACE FUNCTION public.merge_pacientes(_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _vencedor uuid;
  _perdedores uuid[];
  _clinica_ids uuid[];
  _cid uuid;
  _pode boolean;
  _row record;
  _vencedor_antes jsonb;
  _perdedores_antes jsonb;
BEGIN
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL OR array_length(_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Selecione pelo menos 2 pacientes para mesclar';
  END IF;

  -- Confere que todos os IDs existem
  IF (SELECT count(*) FROM public.pacientes WHERE id = ANY(_ids)) <> array_length(_ids, 1) THEN
    RAISE EXCEPTION 'Um ou mais pacientes informados não existem';
  END IF;

  -- Coleta clínicas envolvidas
  SELECT array_agg(DISTINCT clinica_id) INTO _clinica_ids
    FROM public.pacientes WHERE id = ANY(_ids);

  -- Exige Escrita em "clientes-duplicados" em TODAS as clínicas envolvidas.
  -- has_module_access já devolve true para admin sem depender da matriz.
  FOREACH _cid IN ARRAY _clinica_ids LOOP
    SELECT public.has_module_access(auth.uid(), _cid, 'clientes-duplicados', 'write')
      INTO _pode;
    IF NOT COALESCE(_pode, false) THEN
      RAISE EXCEPTION 'Seu perfil não tem permissão para mesclar cadastros de pacientes';
    END IF;
  END LOOP;

  -- Escolhe vencedor: menor codigo_prontuario numérico; tiebreak = created_at asc
  SELECT id INTO _vencedor
  FROM public.pacientes
  WHERE id = ANY(_ids)
  ORDER BY
    CASE
      WHEN codigo_prontuario ~ '^[0-9]+$' THEN codigo_prontuario::bigint
      ELSE NULL
    END NULLS LAST,
    codigo_prontuario NULLS LAST,
    created_at ASC
  LIMIT 1;

  _perdedores := array_remove(_ids, _vencedor);

  -- Snapshot antes (auditoria)
  SELECT jsonb_agg(row_to_json(x)) INTO _perdedores_antes
    FROM (SELECT * FROM public.pacientes WHERE id = ANY(_perdedores)) x;
  SELECT row_to_json(x)::jsonb INTO _vencedor_antes
    FROM (SELECT * FROM public.pacientes WHERE id = _vencedor) x;

  -- Preenche campos vazios do vencedor com dados dos perdedores (não toca em identificadores legados)
  UPDATE public.pacientes v SET
    cpf = COALESCE(NULLIF(v.cpf, ''), (
      SELECT NULLIF(p.cpf, '') FROM public.pacientes p
      WHERE p.id = ANY(_perdedores) AND NULLIF(p.cpf, '') IS NOT NULL
      ORDER BY p.created_at LIMIT 1
    )),
    telefone = COALESCE(NULLIF(v.telefone, ''), (
      SELECT NULLIF(p.telefone, '') FROM public.pacientes p
      WHERE p.id = ANY(_perdedores) AND NULLIF(p.telefone, '') IS NOT NULL
      ORDER BY p.created_at LIMIT 1
    )),
    email = COALESCE(NULLIF(v.email, ''), (
      SELECT NULLIF(p.email, '') FROM public.pacientes p
      WHERE p.id = ANY(_perdedores) AND NULLIF(p.email, '') IS NOT NULL
      ORDER BY p.created_at LIMIT 1
    )),
    data_nascimento = COALESCE(v.data_nascimento, (
      SELECT p.data_nascimento FROM public.pacientes p
      WHERE p.id = ANY(_perdedores) AND p.data_nascimento IS NOT NULL
      ORDER BY p.created_at LIMIT 1
    ))
  WHERE v.id = _vencedor;

  -- Reatribui todos os vínculos (paciente_id em qualquer tabela do public)
  FOR _row IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'paciente_id'
      AND table_name <> 'pacientes'
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET paciente_id = $1 WHERE paciente_id = ANY($2)',
      _row.table_name
    ) USING _vencedor, _perdedores;
  END LOOP;

  -- Apaga perdedores
  DELETE FROM public.pacientes WHERE id = ANY(_perdedores);

  -- Auditoria
  INSERT INTO public.audit_log (
    clinica_id, user_id, table_name, record_id, action, dados_antes, dados_depois
  )
  VALUES (
    _clinica_ids[1],
    auth.uid(),
    'pacientes',
    _vencedor::text,
    'merge_pacientes',
    jsonb_build_object('vencedor', _vencedor_antes, 'perdedores', _perdedores_antes),
    (SELECT row_to_json(x)::jsonb FROM (SELECT * FROM public.pacientes WHERE id = _vencedor) x)
  );

  RETURN _vencedor;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_pacientes(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_pacientes(uuid[]) TO authenticated;

-- Liga o módulo "clientes-duplicados" em Escrita para Recepção e Caixa nos
-- perfis que já existem. Perfis que ainda não têm linha para este módulo caem
-- no padrão de `src/lib/permissoes-presets.ts`, atualizado no mesmo commit.
UPDATE public.perfil_permissoes pp
   SET acesso = 'write'
  FROM public.perfis_acesso pa
 WHERE pp.perfil_id = pa.id
   AND pa.chave IN ('recepcao', 'caixa')
   AND pp.modulo = 'clientes-duplicados'
   AND pp.acesso::text <> 'write';

INSERT INTO public.perfil_permissoes (perfil_id, modulo, acesso)
SELECT pa.id, 'clientes-duplicados', 'write'
  FROM public.perfis_acesso pa
 WHERE pa.chave IN ('recepcao', 'caixa')
   AND NOT EXISTS (
     SELECT 1 FROM public.perfil_permissoes pp
      WHERE pp.perfil_id = pa.id AND pp.modulo = 'clientes-duplicados'
   );
