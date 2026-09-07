CREATE OR REPLACE FUNCTION public.atend_distribuir_fila(
  _clinica_id uuid,
  _max integer DEFAULT 20
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r record;
  _u uuid;
  _n integer := 0;
BEGIN
  IF NOT public.is_member(auth.uid(), _clinica_id) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Sem acesso a esta clínica';
  END IF;

  FOR _r IN
    SELECT id, departamento_id
      FROM public.atend_conversas
     WHERE clinica_id = _clinica_id
       AND atribuida_user_id IS NULL
       AND is_teste = false
       AND (
         status = 'waiting'
         -- Mesma definição usada pela Central de Atenção: conversa que veio do
         -- handoff da Nina e ficou sem responsável não pode ser esquecida
         -- só porque já está marcada como em andamento.
         OR (
           status IN ('active', 'in_progress')
           AND (
             COALESCE(btrim(handoff_motivo), '') <> ''
             OR COALESCE(btrim(handoff_resumo), '') <> ''
           )
         )
       )
     ORDER BY prioridade DESC, aguardando_desde ASC NULLS LAST
     LIMIT GREATEST(_max, 1)
  LOOP
    _u := public.atend_auto_assign_conversa(_r.id, _clinica_id, _r.departamento_id, 'queue_distribution');
    IF _u IS NULL THEN
      EXIT; -- ninguém disponível agora: o resto continua na fila
    END IF;
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.atend_distribuir_fila(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atend_distribuir_fila(uuid, integer) TO authenticated, service_role;